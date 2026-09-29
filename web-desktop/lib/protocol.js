'use strict';

/**
 * Binary protocol between the PC and the Android server (see android-server/.../Controller.java and PacketWriter.java).
 */

const PACKET_HEADER_SIZE = 13;

const PacketType = {
    SESSION: 0,
    CONFIG: 1,
    KEY: 2,
    DELTA: 3,
};

const Codec = {
    H264: 0x68323634,
    H265: 0x68323635,
    RAW: 0x00726177,
};

const ControlType = {
    KEY: 0,
    TEXT: 1,
    TOUCH: 2,
    SCROLL: 3,
    BACK_OR_SCREEN_ON: 4,
    EXPAND_NOTIFICATION_PANEL: 5,
    EXPAND_SETTINGS_PANEL: 6,
    COLLAPSE_PANELS: 7,
    GET_CLIPBOARD: 8,
    SET_CLIPBOARD: 9,
    SET_DISPLAY_POWER: 10,
    ROTATE_DEVICE: 11,
    REQUEST_KEYFRAME: 12,
    SET_BITRATE: 13,
    PING: 14,
    START_APP: 15,
    RESET_VIDEO: 16,
    RELEASE_ALL: 17,
};

const DeviceMessageType = {
    CLIPBOARD: 0,
    ACK_CLIPBOARD: 1,
    EVENT: 2,
};

const TouchAction = { down: 0, up: 1, move: 2 };
const KeyAction = { down: 0, up: 1 };

function clampU16(v) {
    return Math.max(0, Math.min(65535, Math.round(v)));
}

function stringMessage(type, text) {
    const bytes = Buffer.from(String(text), 'utf8');
    const buf = Buffer.allocUnsafe(5 + bytes.length);
    buf[0] = type;
    buf.writeUInt32BE(bytes.length, 1);
    bytes.copy(buf, 5);
    return buf;
}

function simpleMessage(type) {
    return Buffer.from([type]);
}

/**
 * Convert a JSON message from the browser to a binary control message for the device.
 * Returns null if the message is invalid.
 */
function encodeControl(msg) {
    switch (msg.t) {
        case 'key': {
            const buf = Buffer.allocUnsafe(14);
            buf[0] = ControlType.KEY;
            buf[1] = msg.a === 'up' ? KeyAction.up : KeyAction.down;
            buf.writeInt32BE(msg.code | 0, 2);
            buf.writeInt32BE(msg.repeat | 0, 6);
            buf.writeInt32BE(msg.meta | 0, 10);
            return buf;
        }
        case 'text':
            if (typeof msg.text !== 'string' || !msg.text) {
                return null;
            }
            return stringMessage(ControlType.TEXT, msg.text);
        case 'touch': {
            const action = TouchAction[msg.a];
            if (action === undefined) {
                return null;
            }
            const buf = Buffer.allocUnsafe(20);
            buf[0] = ControlType.TOUCH;
            buf[1] = action;
            buf.writeInt32BE(msg.id | 0, 2);
            buf.writeFloatBE(+msg.x || 0, 6);
            buf.writeFloatBE(+msg.y || 0, 10);
            buf.writeUInt16BE(clampU16(msg.w), 14);
            buf.writeUInt16BE(clampU16(msg.h), 16);
            const pressure = msg.a === 'up' ? 0 : (msg.p === undefined ? 1 : msg.p);
            buf.writeUInt16BE(clampU16(pressure * 65535), 18);
            return buf;
        }
        case 'scroll': {
            const buf = Buffer.allocUnsafe(21);
            buf[0] = ControlType.SCROLL;
            buf.writeFloatBE(+msg.x || 0, 1);
            buf.writeFloatBE(+msg.y || 0, 5);
            buf.writeUInt16BE(clampU16(msg.w), 9);
            buf.writeUInt16BE(clampU16(msg.h), 11);
            buf.writeFloatBE(+msg.hs || 0, 13);
            buf.writeFloatBE(+msg.vs || 0, 17);
            return buf;
        }
        case 'back': {
            return Buffer.from([ControlType.BACK_OR_SCREEN_ON, msg.a === 'up' ? KeyAction.up : KeyAction.down]);
        }
        case 'notifications':
            return simpleMessage(ControlType.EXPAND_NOTIFICATION_PANEL);
        case 'quicksettings':
            return simpleMessage(ControlType.EXPAND_SETTINGS_PANEL);
        case 'collapse':
            return simpleMessage(ControlType.COLLAPSE_PANELS);
        case 'getclipboard':
            return Buffer.from([ControlType.GET_CLIPBOARD, msg.copy === 'cut' ? 2 : msg.copy === 'copy' ? 1 : 0]);
        case 'setclipboard': {
            const bytes = Buffer.from(String(msg.text || ''), 'utf8');
            const buf = Buffer.allocUnsafe(14 + bytes.length);
            buf[0] = ControlType.SET_CLIPBOARD;
            buf.writeBigInt64BE(BigInt(msg.seq | 0), 1);
            buf[9] = msg.paste ? 1 : 0;
            buf.writeUInt32BE(bytes.length, 10);
            bytes.copy(buf, 14);
            return buf;
        }
        case 'power':
            return Buffer.from([ControlType.SET_DISPLAY_POWER, msg.on ? 1 : 0]);
        case 'rotate':
            return simpleMessage(ControlType.ROTATE_DEVICE);
        case 'keyframe':
            return simpleMessage(ControlType.REQUEST_KEYFRAME);
        case 'bitrate': {
            const buf = Buffer.allocUnsafe(5);
            buf[0] = ControlType.SET_BITRATE;
            buf.writeInt32BE(Math.max(500000, Math.min(100000000, msg.value | 0)), 1);
            return buf;
        }
        case 'ping': {
            const buf = Buffer.allocUnsafe(9);
            buf[0] = ControlType.PING;
            buf.writeBigInt64BE(BigInt(Math.floor(msg.payload || 0)), 1);
            return buf;
        }
        case 'startapp':
            if (!msg.target) {
                return null;
            }
            return stringMessage(ControlType.START_APP, msg.target);
        case 'resetvideo':
            return simpleMessage(ControlType.RESET_VIDEO);
        case 'releaseall':
            return simpleMessage(ControlType.RELEASE_ALL);
        default:
            return null;
    }
}

/**
 * Incremental parser for the media sockets (video/audio).
 */
class PacketParser {
    constructor(onPacket) {
        this.onPacket = onPacket;
        this.chunks = [];
        this.length = 0;
        this.header = null;
    }

    push(chunk) {
        this.chunks.push(chunk);
        this.length += chunk.length;
        for (;;) {
            if (!this.header) {
                if (this.length < PACKET_HEADER_SIZE) {
                    return;
                }
                const h = this.read(PACKET_HEADER_SIZE);
                this.header = { type: h[0], pts: h.readBigUInt64BE(1), size: h.readUInt32BE(9) };
            }
            if (this.length < this.header.size) {
                return;
            }
            const header = this.header;
            this.header = null;
            const payload = this.read(header.size);
            this.onPacket(header.type, header.pts, payload);
        }
    }

    read(n) {
        if (n === 0) {
            return Buffer.alloc(0);
        }
        const first = this.chunks[0];
        if (first.length >= n) {
            const out = first.subarray(0, n);
            if (first.length === n) {
                this.chunks.shift();
            } else {
                this.chunks[0] = first.subarray(n);
            }
            this.length -= n;
            return out;
        }
        const out = Buffer.allocUnsafe(n);
        let offset = 0;
        while (offset < n) {
            const chunk = this.chunks[0];
            const take = Math.min(chunk.length, n - offset);
            chunk.copy(out, offset, 0, take);
            offset += take;
            if (take === chunk.length) {
                this.chunks.shift();
            } else {
                this.chunks[0] = chunk.subarray(take);
            }
        }
        this.length -= n;
        return out;
    }
}

/**
 * Incremental parser for the messages sent by the device on the control socket.
 */
class DeviceMessageParser {
    constructor(handlers) {
        this.handlers = handlers;
        this.buffer = Buffer.alloc(0);
    }

    push(chunk) {
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
        for (;;) {
            if (this.buffer.length < 1) {
                return;
            }
            const type = this.buffer[0];
            if (type === DeviceMessageType.CLIPBOARD || type === DeviceMessageType.EVENT) {
                if (this.buffer.length < 5) {
                    return;
                }
                const len = this.buffer.readUInt32BE(1);
                if (this.buffer.length < 5 + len) {
                    return;
                }
                const text = this.buffer.subarray(5, 5 + len).toString('utf8');
                this.buffer = this.buffer.subarray(5 + len);
                if (type === DeviceMessageType.CLIPBOARD) {
                    this.handlers.onClipboard(text);
                } else {
                    let event = null;
                    try {
                        event = JSON.parse(text);
                    } catch (e) {
                        // ignore malformed event
                    }
                    if (event) {
                        this.handlers.onEvent(event);
                    }
                }
            } else if (type === DeviceMessageType.ACK_CLIPBOARD) {
                if (this.buffer.length < 9) {
                    return;
                }
                const seq = this.buffer.readBigInt64BE(1);
                this.buffer = this.buffer.subarray(9);
                this.handlers.onAckClipboard(Number(seq));
            } else {
                // desynchronized: drop everything
                this.buffer = Buffer.alloc(0);
                return;
            }
        }
    }
}

module.exports = {
    PacketType,
    Codec,
    ControlType,
    encodeControl,
    PacketParser,
    DeviceMessageParser,
};
