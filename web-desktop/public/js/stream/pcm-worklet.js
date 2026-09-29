/**
 * AudioWorklet: plays raw PCM (s16le interleaved stereo) received from the phone, with a small jitter buffer.
 */
class PcmPlayer extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const opts = (options && options.processorOptions) || {};
        this.channels = opts.channels || 2;
        this.setTarget(opts.targetMs || 60);
        this.capacity = sampleRate * 2; // 2 seconds (frames)
        this.buffer = new Float32Array(this.capacity * this.channels);
        this.readPos = 0;
        this.writePos = 0;
        this.available = 0;
        this.buffering = true;
        this.underruns = 0;
        this.dropped = 0;
        this.reportCounter = 0;
        this.port.onmessage = (event) => {
            const data = event.data;
            if (data instanceof ArrayBuffer) {
                this.push(new Int16Array(data));
            } else if (data && data.type === 'target') {
                this.setTarget(data.value);
            } else if (data && data.type === 'reset') {
                this.readPos = this.writePos = this.available = 0;
                this.buffering = true;
            }
        };
    }

    setTarget(ms) {
        this.target = Math.round(sampleRate * ms / 1000);
        // above this, drop the oldest samples to limit the latency
        this.max = this.target + Math.round(sampleRate * 0.08);
    }

    push(samples) {
        const frames = Math.floor(samples.length / this.channels);
        const ch = this.channels;
        for (let i = 0; i < frames; ++i) {
            const base = this.writePos * ch;
            for (let c = 0; c < ch; ++c) {
                this.buffer[base + c] = samples[i * ch + c] / 32768;
            }
            this.writePos = (this.writePos + 1) % this.capacity;
        }
        this.available += frames;
        if (this.available > this.capacity) {
            // overflow: keep the newest samples
            const excess = this.available - this.capacity;
            this.readPos = (this.readPos + excess) % this.capacity;
            this.available = this.capacity;
        }
        if (this.available > this.max) {
            const drop = this.available - this.target;
            this.readPos = (this.readPos + drop) % this.capacity;
            this.available -= drop;
            this.dropped += drop;
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const n = output[0].length;
        const ch = this.channels;
        if (this.buffering) {
            if (this.available >= this.target) {
                this.buffering = false;
            } else {
                for (const channel of output) {
                    channel.fill(0);
                }
                return true;
            }
        }
        if (this.available < n) {
            this.underruns++;
            this.buffering = true;
            for (const channel of output) {
                channel.fill(0);
            }
            return true;
        }
        for (let i = 0; i < n; ++i) {
            const base = this.readPos * ch;
            for (let c = 0; c < output.length; ++c) {
                output[c][i] = this.buffer[base + Math.min(c, ch - 1)];
            }
            this.readPos = (this.readPos + 1) % this.capacity;
        }
        this.available -= n;
        if (++this.reportCounter >= 375) { // ~1 s
            this.reportCounter = 0;
            this.port.postMessage({ type: 'stats', bufferedMs: Math.round(this.available * 1000 / sampleRate), underruns: this.underruns, dropped: this.dropped });
        }
        return true;
    }
}

registerProcessor('pcm-player', PcmPlayer);
