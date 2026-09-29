/**
 * Low-latency H.264/H.265 decoding with WebCodecs, rendered to a canvas.
 */

const PACKET_CONFIG = 1;
const PACKET_KEY = 2;

// If frames arrive this late compared to the best observed latency (backlog after a Wi-Fi stall),
// skip to the next key frame instead of displaying the past.
const MAX_LAG_MS = 250;
const LAG_FRAMES_BEFORE_SKIP = 4;

function hex2(value) {
    return value.toString(16).padStart(2, '0');
}

/** Find the NAL units (Annex B) of a buffer. */
function* nalUnits(data) {
    let i = 0;
    const n = data.length;
    let start = -1;
    while (i + 3 <= n) {
        let scLen = 0;
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
            scLen = 3;
        } else if (i + 4 <= n && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
            scLen = 4;
        }
        if (scLen) {
            if (start >= 0) {
                yield data.subarray(start, i);
            }
            i += scLen;
            start = i;
        } else {
            i++;
        }
    }
    if (start >= 0 && start < n) {
        yield data.subarray(start, n);
    }
}

/** Remove the emulation prevention bytes (00 00 03 -> 00 00). */
function unescapeRbsp(nal) {
    const out = [];
    for (let i = 0; i < nal.length; ++i) {
        if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) {
            continue;
        }
        out.push(nal[i]);
    }
    return Uint8Array.from(out);
}

function reverseBits32(value) {
    let result = 0;
    for (let i = 0; i < 32; ++i) {
        result = (result << 1) | ((value >>> i) & 1);
    }
    return result >>> 0;
}

/**
 * Build the WebCodecs codec string from the codec configuration (SPS).
 */
export function codecString(codec, config) {
    if (codec === 'h265') {
        for (const nal of nalUnits(config)) {
            const type = (nal[0] >> 1) & 0x3f;
            if (type !== 33) {
                continue;
            }
            const sps = unescapeRbsp(nal);
            // 2 bytes NAL header, 1 byte (vps id, max sub layers, temporal id nesting), then profile_tier_level
            const ptl = 3;
            if (sps.length < ptl + 12) {
                break;
            }
            const profileSpace = sps[ptl] >> 6;
            const tier = (sps[ptl] >> 5) & 1;
            const profileIdc = sps[ptl] & 0x1f;
            const compat = ((sps[ptl + 1] << 24) | (sps[ptl + 2] << 16) | (sps[ptl + 3] << 8) | sps[ptl + 4]) >>> 0;
            const constraints = Array.from(sps.subarray(ptl + 5, ptl + 11));
            const level = sps[ptl + 11];
            while (constraints.length && constraints[constraints.length - 1] === 0) {
                constraints.pop();
            }
            const space = ['', 'A', 'B', 'C'][profileSpace];
            let str = 'hvc1.' + space + profileIdc + '.' + reverseBits32(compat).toString(16) + '.' + (tier ? 'H' : 'L') + level;
            if (constraints.length) {
                str += '.' + constraints.map((b) => b.toString(16)).join('.');
            }
            return str;
        }
        return 'hvc1.1.6.L153.B0';
    }
    for (const nal of nalUnits(config)) {
        if ((nal[0] & 0x1f) === 7 && nal.length >= 4) {
            return 'avc1.' + hex2(nal[1]) + hex2(nal[2]) + hex2(nal[3]);
        }
    }
    return 'avc1.42e01f';
}

function containsSps(codec, data) {
    for (const nal of nalUnits(data.subarray(0, Math.min(data.length, 256)))) {
        const type = codec === 'h265' ? (nal[0] >> 1) & 0x3f : nal[0] & 0x1f;
        if ((codec === 'h265' && type === 33) || (codec !== 'h265' && type === 7)) {
            return true;
        }
    }
    return false;
}

export class VideoPlayer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} callbacks {onSize(width, height), onRequestKeyframe(), onError(message), onFrame()}
     */
    constructor(canvas, callbacks = {}) {
        this.canvas = canvas;
        this.callbacks = callbacks;
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.decoder = null;
        this.codec = 'h264';
        this.codecString = null;
        this.config = null;
        this.width = 0;
        this.height = 0;
        this.waitingKeyframe = true;
        this.framesDecoded = 0;
        this.fps = 0;
        this.lastFpsTime = performance.now();
        this.frameCounter = 0;
        this.hardware = 'no-preference';
        this.supported = typeof window.VideoDecoder === 'function';
        this.minOffset = null;
        this.lateFrames = 0;
        this.skipped = 0;
        this.lastKeyframeRequest = 0;
    }

    requestKeyframe() {
        const now = performance.now();
        if (now - this.lastKeyframeRequest > 500 && this.callbacks.onRequestKeyframe) {
            this.lastKeyframeRequest = now;
            this.callbacks.onRequestKeyframe();
        }
    }

    /**
     * Track how late the frames arrive. The device timestamps and the local clock have an unknown constant offset:
     * compare to the smallest offset seen (the best case), slowly adapted to follow the clock drift.
     * @returns {boolean} true if the frame is too late (backlog)
     */
    isLate(pts) {
        const offset = performance.now() - Number(pts) / 1000;
        if (this.minOffset === null || offset < this.minOffset) {
            this.minOffset = offset;
        } else {
            this.minOffset += (offset - this.minOffset) * 0.0005;
        }
        if (offset - this.minOffset > MAX_LAG_MS) {
            this.lateFrames++;
        } else {
            this.lateFrames = 0;
        }
        return this.lateFrames >= LAG_FRAMES_BEFORE_SKIP;
    }

    /** New encoding session (start, rotation...). */
    handleSession(codec, width, height) {
        this.codec = codec;
        this.config = null;
        this.waitingKeyframe = true;
        this.minOffset = null;
        this.lateFrames = 0;
        if (width !== this.width || height !== this.height) {
            this.width = width;
            this.height = height;
            this.canvas.width = width;
            this.canvas.height = height;
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, width, height);
            if (this.callbacks.onSize) {
                this.callbacks.onSize(width, height);
            }
        }
    }

    async handleConfig(data) {
        // copy: the buffer belongs to the websocket message
        this.config = data.slice();
        const str = codecString(this.codec, this.config);
        if (!this.decoder || this.decoder.state === 'closed' || str !== this.codecString) {
            await this.createDecoder(str);
        }
    }

    async createDecoder(str) {
        this.closeDecoder();
        this.codecString = str;
        if (!this.supported) {
            this.fail('Ovaj browser ne podržava WebCodecs. Koristi Chrome ili Edge (i otvori http://localhost).');
            return;
        }
        const config = {
            codec: str,
            optimizeForLatency: true,
            hardwareAcceleration: this.hardware,
        };
        try {
            const support = await VideoDecoder.isConfigSupported(config);
            if (!support.supported) {
                config.hardwareAcceleration = 'no-preference';
                const retry = await VideoDecoder.isConfigSupported(config);
                if (!retry.supported) {
                    this.fail('Browser ne može da dekodira ' + str + (this.codec === 'h265' ? ' (probaj H.264 u podešavanjima)' : ''));
                    return;
                }
            }
        } catch (e) {
            // isConfigSupported may throw on invalid strings: try anyway
        }
        this.decoder = new VideoDecoder({
            output: (frame) => this.onFrame(frame),
            error: (e) => this.onDecoderError(e),
        });
        try {
            this.decoder.configure(config);
        } catch (e) {
            this.fail('Greška dekodera: ' + e.message);
            return;
        }
        this.waitingKeyframe = true;
        if (this.callbacks.onRequestKeyframe) {
            this.callbacks.onRequestKeyframe();
        }
    }

    handleFrame(type, pts, data) {
        if (!this.decoder || this.decoder.state !== 'configured') {
            return;
        }
        const isKey = type === PACKET_KEY;
        if (this.isLate(pts)) {
            // backlog: drop everything until a fresh key frame
            this.waitingKeyframe = true;
            this.skipped++;
            this.requestKeyframe();
            return;
        }
        if (this.waitingKeyframe) {
            if (!isKey) {
                this.requestKeyframe();
                return;
            }
            this.waitingKeyframe = false;
        }
        if (this.decoder.decodeQueueSize > 20) {
            // the decoder cannot keep up: restart from the next key frame
            this.decoder.reset();
            this.decoder.configure({ codec: this.codecString, optimizeForLatency: true, hardwareAcceleration: this.hardware });
            this.waitingKeyframe = true;
            this.requestKeyframe();
            return;
        }
        let chunkData = data;
        if (isKey && this.config && !containsSps(this.codec, data)) {
            // in-band parameters are required by the decoder (Annex B, no description)
            chunkData = new Uint8Array(this.config.length + data.length);
            chunkData.set(this.config, 0);
            chunkData.set(data, this.config.length);
        }
        try {
            this.decoder.decode(new EncodedVideoChunk({
                type: isKey ? 'key' : 'delta',
                timestamp: Number(pts),
                data: chunkData,
            }));
        } catch (e) {
            this.onDecoderError(e);
        }
    }

    onFrame(frame) {
        try {
            if (frame.displayWidth === this.canvas.width && frame.displayHeight === this.canvas.height) {
                this.ctx.drawImage(frame, 0, 0);
            } else {
                this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
            }
        } finally {
            frame.close();
        }
        this.framesDecoded++;
        this.frameCounter++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = Math.round(this.frameCounter * 1000 / (now - this.lastFpsTime));
            this.frameCounter = 0;
            this.lastFpsTime = now;
        }
        if (this.callbacks.onFrame) {
            this.callbacks.onFrame();
        }
    }

    onDecoderError(e) {
        console.warn('[video] decoder error', e);
        // recreate the decoder and wait for a key frame
        if (this.codecString) {
            const str = this.codecString;
            this.codecString = null;
            this.createDecoder(str);
        }
    }

    fail(message) {
        this.error = message;
        if (this.callbacks.onError) {
            this.callbacks.onError(message);
        }
    }

    getFps() {
        if (performance.now() - this.lastFpsTime > 2000) {
            return 0;
        }
        return this.fps;
    }

    closeDecoder() {
        if (this.decoder && this.decoder.state !== 'closed') {
            try {
                this.decoder.close();
            } catch (e) {
                // ignore
            }
        }
        this.decoder = null;
    }

    destroy() {
        this.closeDecoder();
    }
}
