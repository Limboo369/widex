/**
 * Plays the sound of the phone (raw PCM from the server) through an AudioWorklet.
 */
export class AudioPlayer {
    constructor() {
        this.ctx = null;
        this.node = null;
        this.gain = null;
        this.ready = false;
        this.starting = null;
        this.volume = 1;
        this.muted = false;
        this.targetMs = 60;
        this.sampleRate = 48000;
        this.channels = 2;
        this.stats = null;
    }

    async init(sampleRate = 48000, channels = 2) {
        if (this.ctx && this.sampleRate === sampleRate && this.channels === channels) {
            return;
        }
        if (this.starting) {
            return this.starting;
        }
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.starting = (async () => {
            await this.close();
            const ctx = new AudioContext({ sampleRate, latencyHint: 'interactive' });
            await ctx.audioWorklet.addModule('js/stream/pcm-worklet.js');
            const node = new AudioWorkletNode(ctx, 'pcm-player', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                processorOptions: { targetMs: this.targetMs, channels },
            });
            node.port.onmessage = (event) => {
                if (event.data && event.data.type === 'stats') {
                    this.stats = event.data;
                }
            };
            const gain = ctx.createGain();
            gain.gain.value = this.muted ? 0 : this.volume;
            node.connect(gain).connect(ctx.destination);
            this.ctx = ctx;
            this.node = node;
            this.gain = gain;
            this.ready = true;
        })();
        try {
            await this.starting;
        } finally {
            this.starting = null;
        }
    }

    /** Must be called from a user gesture (browsers block audio until the user interacts). */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    isSuspended() {
        return !this.ctx || this.ctx.state !== 'running';
    }

    push(arrayBuffer) {
        if (this.ready && this.node) {
            this.node.port.postMessage(arrayBuffer, [arrayBuffer]);
        }
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.gain) {
            this.gain.gain.value = this.muted ? 0 : volume;
        }
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.gain) {
            this.gain.gain.value = muted ? 0 : this.volume;
        }
    }

    setTargetLatency(ms) {
        this.targetMs = ms;
        if (this.node) {
            this.node.port.postMessage({ type: 'target', value: ms });
        }
    }

    async close() {
        this.ready = false;
        if (this.node) {
            this.node.disconnect();
            this.node = null;
        }
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch (e) {
                // ignore
            }
            this.ctx = null;
        }
    }
}
