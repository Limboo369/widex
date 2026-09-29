/**
 * WebSocket connection to a streaming session (server.js relays the phone).
 *
 * Binary messages: u8 channel (1 video, 2 audio), u8 packet type, u64 pts, payload.
 * Text messages: JSON events.
 */
export const CHANNEL_VIDEO = 1;
export const CHANNEL_AUDIO = 2;

export class StreamConnection {
    /**
     * @param {string} sessionId
     * @param {object} handlers {onOpen, onClose(reason), onJson(msg), onVideo(type, pts, payload), onAudio(type, pts, buffer)}
     */
    constructor(sessionId, handlers) {
        this.sessionId = sessionId;
        this.handlers = handlers;
        this.ws = null;
        this.closedByUser = false;
        this.retries = 0;
    }

    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(protocol + '//' + location.host + '/ws?session=' + encodeURIComponent(this.sessionId));
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        ws.onopen = () => {
            this.retries = 0;
            if (this.handlers.onOpen) {
                this.handlers.onOpen();
            }
        };
        ws.onmessage = (event) => {
            const data = event.data;
            if (typeof data === 'string') {
                let msg = null;
                try {
                    msg = JSON.parse(data);
                } catch (e) {
                    return;
                }
                this.handlers.onJson(msg);
                return;
            }
            const view = new DataView(data);
            const channel = view.getUint8(0);
            const type = view.getUint8(1);
            const pts = view.getBigUint64(2);
            if (channel === CHANNEL_VIDEO) {
                this.handlers.onVideo(type, pts, new Uint8Array(data, 10));
            } else if (channel === CHANNEL_AUDIO) {
                this.handlers.onAudio(type, pts, data);
            }
        };
        ws.onclose = (event) => {
            if (this.ws !== ws) {
                return;
            }
            this.ws = null;
            if (this.closedByUser) {
                return;
            }
            if (event.code === 1000 || event.code === 4004) {
                // session stopped / unknown
                if (this.handlers.onClose) {
                    this.handlers.onClose(event.reason || 'stopped');
                }
                return;
            }
            // unexpected: retry a few times (the session may still be alive)
            if (this.retries < 5) {
                this.retries++;
                setTimeout(() => {
                    if (!this.closedByUser) {
                        this.connect();
                    }
                }, 500 * this.retries);
            } else if (this.handlers.onClose) {
                this.handlers.onClose('connection-lost');
            }
        };
    }

    isOpen() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    close() {
        this.closedByUser = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
