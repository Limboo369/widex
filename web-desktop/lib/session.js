'use strict';

/**
 * A streaming session with one Android device:
 *   - push and start the server on the phone (through adb),
 *   - connect the video/audio/control sockets (through "adb forward"),
 *   - relay media packets to the browser viewers (WebSocket) and control messages to the phone.
 */

const net = require('net');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const { PacketParser, DeviceMessageParser, PacketType, Codec, encodeControl } = require('./protocol');

const SERVER_VERSION = '2.0.0';
const SERVER_JAR = path.join(__dirname, '..', 'bin', 'widex-server.jar');
const DEVICE_JAR = '/data/local/tmp/widex-server.jar';

const CHANNEL_VIDEO = 1;
const CHANNEL_AUDIO = 2;

// If the browser does not consume the stream fast enough, drop frames instead of accumulating latency
const MAX_VIEWER_BUFFERED_BYTES = 1024 * 1024;
const MAX_LOG_LINES = 300;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_OPTIONS = {
    maxSize: 1920,
    bitRate: 12000000,
    maxFps: 60,
    codec: 'h264',
    audio: true,
    turnScreenOff: false,
    stayAwake: true,
    newDisplay: '',
    encoderName: '',
};

function normalizeOptions(options = {}) {
    const o = Object.assign({}, DEFAULT_OPTIONS);
    if (options.maxSize !== undefined) {
        const v = parseInt(options.maxSize, 10);
        o.maxSize = Number.isFinite(v) ? Math.max(0, Math.min(4096, v)) : DEFAULT_OPTIONS.maxSize;
    }
    if (options.bitRate !== undefined) {
        const v = parseInt(options.bitRate, 10);
        o.bitRate = Number.isFinite(v) ? Math.max(500000, Math.min(100000000, v)) : DEFAULT_OPTIONS.bitRate;
    }
    if (options.maxFps !== undefined) {
        const v = parseFloat(options.maxFps);
        o.maxFps = Number.isFinite(v) ? Math.max(0, Math.min(240, v)) : DEFAULT_OPTIONS.maxFps;
    }
    if (options.codec === 'h265' || options.codec === 'h264') {
        o.codec = options.codec;
    }
    for (const key of ['audio', 'turnScreenOff', 'stayAwake']) {
        if (options[key] !== undefined) {
            o[key] = !!options[key];
        }
    }
    if (typeof options.newDisplay === 'string' && /^\d{3,4}x\d{3,4}(\/\d{2,3})?$/.test(options.newDisplay)) {
        o.newDisplay = options.newDisplay;
    }
    if (typeof options.encoderName === 'string' && /^[\w.\-]+$/.test(options.encoderName)) {
        o.encoderName = options.encoderName;
    }
    return o;
}

function buildServerArgs(scid, o) {
    const args = [
        'scid=' + scid,
        'log_level=info',
        'video_codec=' + o.codec,
        'video_bit_rate=' + o.bitRate,
        'max_size=' + o.maxSize,
        'max_fps=' + o.maxFps,
        'audio=' + o.audio,
        'turn_screen_off=' + o.turnScreenOff,
        'stay_awake=' + o.stayAwake,
    ];
    if (o.newDisplay) {
        args.push('new_display=' + o.newDisplay);
    }
    if (o.encoderName) {
        args.push('encoder_name=' + o.encoderName);
    }
    return args.join(' ');
}

function connectSocket(port, expectDummyByte) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.setNoDelay(true);
        let settled = false;
        const finish = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            socket.removeAllListeners('data');
            socket.removeAllListeners('close');
            socket.removeAllListeners('error');
            if (error) {
                socket.destroy();
                reject(error);
            } else {
                socket.on('error', () => {});
                resolve(socket);
            }
        };
        socket.once('error', (e) => finish(e));
        if (!expectDummyByte) {
            socket.once('connect', () => finish(null));
            return;
        }
        socket.once('close', () => finish(new Error('closed')));
        socket.once('data', (data) => {
            if (data.length > 1) {
                socket.unshift(data.subarray(1));
            }
            socket.pause();
            finish(null);
        });
    });
}

class DeviceSession extends EventEmitter {
    constructor(adb, serial, options) {
        super();
        this.id = crypto.randomBytes(4).toString('hex');
        this.adb = adb;
        this.serial = serial;
        this.options = normalizeOptions(options);
        this.state = 'starting';
        this.error = null;
        this.device = null;
        this.foreground = null;
        this.battery = null;
        this.screenOn = !this.options.turnScreenOff;
        this.video = null; // {codec, width, height, rotation, displayId}
        this.audioInfo = null;
        this.audioError = null;
        this.videoSessionPacket = null;
        this.videoConfigPacket = null;
        this.audioSessionPacket = null;
        this.viewers = new Set();
        this.logs = [];
        this.stats = { videoBytes: 0, videoFrames: 0, audioBytes: 0 };
        this.rates = { videoKbps: 0, fps: 0, audioKbps: 0 };
        this.lastKeyframeRequest = 0;
        this.idleTimer = null;
        this.idleStopMs = 20000;
        this.startedAt = Date.now();
    }

    log(line) {
        const entry = new Date().toISOString().substring(11, 19) + ' ' + line;
        this.logs.push(entry);
        if (this.logs.length > MAX_LOG_LINES) {
            this.logs.shift();
        }
        this.emit('log', entry);
    }

    describe() {
        return {
            id: this.id,
            serial: this.serial,
            state: this.state,
            error: this.error,
            options: this.options,
            device: this.device,
            video: this.video,
            audio: this.audioInfo,
            audioError: this.audioError,
            foreground: this.foreground,
            battery: this.battery,
            screenOn: this.screenOn,
            viewers: this.viewers.size,
            startedAt: this.startedAt,
        };
    }

    async start() {
        const scid = crypto.randomBytes(4).toString('hex');
        this.log('Pokrećem sesiju na ' + this.serial + ' (' + JSON.stringify(this.options) + ')');
        try {
            await this.adb.push(this.serial, SERVER_JAR, DEVICE_JAR);
            this.port = await this.adb.forward(this.serial, 'localabstract:widex_' + scid);

            const command = 'CLASSPATH=' + DEVICE_JAR + ' app_process / com.widex.server.Server ' + SERVER_VERSION + ' '
                + buildServerArgs(scid, this.options);
            this.process = this.adb.spawnShell(this.serial, command);
            this.processExited = false;
            this.attachProcessOutput();

            this.videoSocket = await this.connectWithRetry();
            if (this.options.audio) {
                this.audioSocket = await connectSocket(this.port, false);
            }
            this.controlSocket = await connectSocket(this.port, false);
        } catch (e) {
            const detail = this.lastServerError ? ' — ' + this.lastServerError : '';
            this.error = (e.message || String(e)) + detail;
            this.log('Greška pri pokretanju: ' + this.error);
            await this.stop('start-failed');
            throw new Error(this.error);
        }

        this.attachSockets();
        this.state = 'running';
        this.log('Sesija pokrenuta');
        this.statsTimer = setInterval(() => this.updateStats(), 1000);
        this.batteryTimer = setInterval(() => this.updateBattery(), 30000);
        this.updateBattery();
        this.broadcastJson({ type: 'session', session: this.describe() });
        this.emit('state');
        this.scheduleIdleStop();
    }

    attachProcessOutput() {
        const handleLines = (prefix) => {
            let pending = '';
            return (data) => {
                pending += data.toString('utf8');
                const lines = pending.split(/\r?\n/);
                pending = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }
                    this.log(prefix + line);
                    const m = /ERROR: (.*)$/.exec(line);
                    if (m) {
                        this.lastServerError = m[1];
                    } else if (/^\S+(Exception|Error)\b/.test(line.trim()) && this.lastServerError && !this.lastServerError.includes(':')) {
                        this.lastServerError += ': ' + line.trim();
                    }
                }
            };
        };
        this.process.stdout.on('data', handleLines(''));
        this.process.stderr.on('data', handleLines(''));
        this.process.on('exit', (code) => {
            this.processExited = true;
            this.log('Server na telefonu je završio (kod ' + code + ')');
            if (this.state === 'running') {
                this.stop('server-exited');
            }
        });
        this.process.on('error', (e) => {
            this.processExited = true;
            this.log('adb greška: ' + e.message);
        });
    }

    async connectWithRetry() {
        const deadline = Date.now() + 15000;
        let lastError = null;
        while (Date.now() < deadline) {
            if (this.processExited) {
                throw new Error('Server na telefonu se ugasio');
            }
            try {
                return await connectSocket(this.port, true);
            } catch (e) {
                lastError = e;
                await sleep(100);
            }
        }
        throw new Error('Nema odgovora od servera na telefonu' + (lastError ? ' (' + lastError.message + ')' : ''));
    }

    attachSockets() {
        const videoParser = new PacketParser((type, pts, payload) => this.onVideoPacket(type, pts, payload));
        this.videoSocket.on('data', (data) => videoParser.push(data));
        this.videoSocket.on('close', () => {
            if (this.state === 'running') {
                this.log('Video veza zatvorena');
                this.stop('video-closed');
            }
        });
        this.videoSocket.resume();

        if (this.audioSocket) {
            const audioParser = new PacketParser((type, pts, payload) => this.onAudioPacket(type, pts, payload));
            this.audioSocket.on('data', (data) => audioParser.push(data));
            this.audioSocket.on('close', () => {
                if (this.state === 'running' && !this.audioError) {
                    this.audioError = 'Zvuk nije dostupan';
                }
            });
        }

        const controlParser = new DeviceMessageParser({
            onClipboard: (text) => this.broadcastJson({ type: 'clipboard', text }),
            onAckClipboard: (seq) => this.broadcastJson({ type: 'clipboard-ack', seq }),
            onEvent: (event) => this.onDeviceEvent(event),
        });
        this.controlSocket.on('data', (data) => controlParser.push(data));
        this.controlSocket.on('close', () => {
            if (this.state === 'running') {
                this.stop('control-closed');
            }
        });
    }

    onDeviceEvent(event) {
        switch (event.event) {
            case 'hello':
                this.device = event;
                this.log('Telefon: ' + event.manufacturer + ' ' + event.model + ', Android ' + event.release + ' (API ' + event.sdk + ')');
                break;
            case 'foreground':
                this.foreground = event.package ? { package: event.package, component: event.component } : null;
                break;
            case 'screen':
                if (event.ok) {
                    this.screenOn = !!event.on;
                }
                break;
            case 'audio_error':
                this.audioError = event.message;
                this.log('Zvuk: ' + event.message);
                break;
            case 'error':
                this.log('Greška na telefonu: ' + event.message);
                break;
            default:
                break;
        }
        this.broadcastJson({ type: 'event', event });
    }

    onVideoPacket(type, pts, payload) {
        if (type === PacketType.SESSION) {
            const codec = payload.readUInt32BE(0);
            this.video = {
                codec: codec === Codec.H265 ? 'h265' : 'h264',
                width: payload.readUInt32BE(4),
                height: payload.readUInt32BE(8),
                rotation: payload.readUInt32BE(12),
                displayId: payload.readUInt32BE(16),
            };
            this.videoSessionPacket = payload;
            this.videoConfigPacket = null;
            this.log('Video: ' + this.video.codec + ' ' + this.video.width + 'x' + this.video.height);
            for (const ws of this.viewers) {
                ws.widex.waitingKeyframe = true;
            }
        } else if (type === PacketType.CONFIG) {
            this.videoConfigPacket = payload;
        } else {
            this.stats.videoFrames++;
        }
        this.stats.videoBytes += payload.length;

        let message = null;
        for (const ws of this.viewers) {
            const state = ws.widex;
            if (type === PacketType.DELTA && state.waitingKeyframe) {
                continue;
            }
            if ((type === PacketType.DELTA || type === PacketType.KEY) && ws.bufferedAmount > MAX_VIEWER_BUFFERED_BYTES) {
                // the viewer is late: skip frames until the next key frame
                state.waitingKeyframe = true;
                this.requestKeyframe();
                continue;
            }
            if (type === PacketType.KEY) {
                state.waitingKeyframe = false;
            }
            if (!message) {
                message = makeMediaMessage(CHANNEL_VIDEO, type, pts, payload);
            }
            ws.send(message);
        }
    }

    onAudioPacket(type, pts, payload) {
        if (type === PacketType.SESSION) {
            this.audioInfo = {
                codec: payload.readUInt32BE(0) === Codec.RAW ? 'raw' : 'unknown',
                sampleRate: payload.readUInt32BE(4),
                channels: payload.readUInt32BE(8),
            };
            this.audioSessionPacket = payload;
        }
        this.stats.audioBytes += payload.length;
        let message = null;
        for (const ws of this.viewers) {
            if (type !== PacketType.SESSION && ws.bufferedAmount > MAX_VIEWER_BUFFERED_BYTES) {
                continue;
            }
            if (!message) {
                message = makeMediaMessage(CHANNEL_AUDIO, type, pts, payload);
            }
            ws.send(message);
        }
    }

    requestKeyframe() {
        const now = Date.now();
        if (now - this.lastKeyframeRequest < 500) {
            return;
        }
        this.lastKeyframeRequest = now;
        this.sendControl(encodeControl({ t: 'keyframe' }));
    }

    sendControl(buffer) {
        if (buffer && this.controlSocket && !this.controlSocket.destroyed && this.state === 'running') {
            this.controlSocket.write(buffer);
        }
    }

    handleViewerMessage(ws, msg) {
        if (msg.t === 'keyframe') {
            this.requestKeyframe();
            return;
        }
        const buffer = encodeControl(msg);
        if (buffer) {
            this.sendControl(buffer);
        }
    }

    addViewer(ws) {
        ws.widex = { waitingKeyframe: true };
        this.viewers.add(ws);
        clearTimeout(this.idleTimer);
        this.idleTimer = null;

        ws.send(JSON.stringify({ type: 'session', session: this.describe() }));
        if (this.device) {
            ws.send(JSON.stringify({ type: 'event', event: this.device }));
        }
        if (this.foreground) {
            ws.send(JSON.stringify({ type: 'event', event: { event: 'foreground', package: this.foreground.package, component: this.foreground.component } }));
        }
        if (this.battery) {
            ws.send(JSON.stringify({ type: 'battery', battery: this.battery }));
        }
        if (this.videoSessionPacket) {
            ws.send(makeMediaMessage(CHANNEL_VIDEO, PacketType.SESSION, 0n, this.videoSessionPacket));
        }
        if (this.videoConfigPacket) {
            ws.send(makeMediaMessage(CHANNEL_VIDEO, PacketType.CONFIG, 0n, this.videoConfigPacket));
        }
        if (this.audioSessionPacket) {
            ws.send(makeMediaMessage(CHANNEL_AUDIO, PacketType.SESSION, 0n, this.audioSessionPacket));
        }
        this.lastKeyframeRequest = 0;
        this.requestKeyframe();

        ws.on('message', (data, isBinary) => {
            if (isBinary) {
                return;
            }
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch (e) {
                return;
            }
            this.handleViewerMessage(ws, msg);
        });
        ws.on('close', () => {
            this.viewers.delete(ws);
            // make sure no finger stays "pressed" on the phone
            this.sendControl(encodeControl({ t: 'releaseall' }));
            this.scheduleIdleStop();
            this.emit('state');
        });
        this.emit('state');
    }

    scheduleIdleStop() {
        if (this.viewers.size > 0 || this.state !== 'running' || this.idleTimer) {
            return;
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            if (this.viewers.size === 0 && this.state === 'running') {
                this.log('Nema otvorenog prikaza, zaustavljam sesiju');
                this.stop('idle');
            }
        }, this.idleStopMs);
    }

    broadcastJson(obj) {
        const text = JSON.stringify(obj);
        for (const ws of this.viewers) {
            ws.send(text);
        }
    }

    updateStats() {
        this.rates = {
            videoKbps: Math.round(this.stats.videoBytes * 8 / 1000),
            fps: this.stats.videoFrames,
            audioKbps: Math.round(this.stats.audioBytes * 8 / 1000),
        };
        this.stats.videoBytes = 0;
        this.stats.videoFrames = 0;
        this.stats.audioBytes = 0;
        this.broadcastJson({ type: 'stats', stats: this.rates });
    }

    async updateBattery() {
        try {
            const result = await this.adb.shell(this.serial, 'dumpsys battery', { timeout: 10000 });
            const level = /level: (\d+)/.exec(result.stdout);
            const status = /status: (\d+)/.exec(result.stdout);
            if (level) {
                // BatteryManager.BATTERY_STATUS_CHARGING = 2, FULL = 5
                this.battery = { level: parseInt(level[1], 10), charging: status ? ['2', '5'].includes(status[1]) : false };
                this.broadcastJson({ type: 'battery', battery: this.battery });
            }
        } catch (e) {
            // ignore
        }
    }

    async stop(reason) {
        if (this.state === 'stopped') {
            return;
        }
        const wasRunning = this.state === 'running';
        this.state = 'stopped';
        this.stopReason = reason;
        clearInterval(this.statsTimer);
        clearInterval(this.batteryTimer);
        clearTimeout(this.idleTimer);
        this.log('Zaustavljam sesiju (' + reason + ')');

        for (const socket of [this.videoSocket, this.audioSocket, this.controlSocket]) {
            if (socket) {
                socket.destroy();
            }
        }
        this.broadcastJson({ type: 'stopped', reason, error: this.error });
        for (const ws of this.viewers) {
            ws.close(1000, 'stopped');
        }
        this.viewers.clear();

        if (this.process && !this.processExited) {
            // let the server restore the phone (screen...) after the sockets are closed
            const exited = await Promise.race([
                new Promise((resolve) => this.process.once('exit', () => resolve(true))),
                sleep(wasRunning ? 2500 : 300).then(() => false),
            ]);
            if (!exited) {
                try {
                    this.process.kill();
                } catch (e) {
                    // ignore
                }
            }
        }
        if (this.port) {
            await this.adb.forwardRemove(this.serial, this.port);
        }
        this.emit('stopped', reason);
        this.emit('state');
    }
}

function makeMediaMessage(channel, type, pts, payload) {
    const message = Buffer.allocUnsafe(10 + payload.length);
    message[0] = channel;
    message[1] = type;
    message.writeBigUInt64BE(BigInt(pts), 2);
    payload.copy(message, 10);
    return message;
}

class SessionManager extends EventEmitter {
    constructor(adb) {
        super();
        this.adb = adb;
        this.sessions = new Map();
    }

    list() {
        return Array.from(this.sessions.values()).map((s) => s.describe());
    }

    get(id) {
        return this.sessions.get(id) || null;
    }

    findBySerial(serial) {
        for (const session of this.sessions.values()) {
            if (session.serial === serial && session.state !== 'stopped') {
                return session;
            }
        }
        return null;
    }

    async start(serial, options) {
        const existing = this.findBySerial(serial);
        if (existing) {
            await existing.stop('restart');
        }
        const session = new DeviceSession(this.adb, serial, options);
        this.sessions.set(session.id, session);
        session.on('log', (line) => this.emit('log', session, line));
        session.on('state', () => this.emit('state'));
        session.on('stopped', () => {
            // keep the stopped session a little (for its logs), then forget it
            setTimeout(() => {
                if (this.sessions.get(session.id) === session) {
                    this.sessions.delete(session.id);
                    this.emit('state');
                }
            }, 60000);
        });
        await session.start();
        return session;
    }

    async stop(id) {
        const session = this.sessions.get(id);
        if (session) {
            await session.stop('user');
        }
    }

    async stopAll() {
        await Promise.all(Array.from(this.sessions.values()).map((s) => s.stop('shutdown')));
    }
}

module.exports = { SessionManager, DeviceSession, normalizeOptions, SERVER_VERSION, SERVER_JAR, DEVICE_JAR, DEFAULT_OPTIONS };
