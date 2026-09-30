/** Open the window only after Android confirms the target app and its stream paints a fresh frame. */
export class AppVisualGate {
    constructor(pkg, requestFrame, { settleMs = 150, timeoutMs = 4500 } = {}) {
        this.package = pkg;
        this.confirmed = false;
        this.readyForFrame = false;
        this.done = false;
        this.requestFrame = requestFrame;
        this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
        this.timeout = setTimeout(() => this.finish(new Error('The phone has not shown the new app yet. Click its tab to try again.')), timeoutMs);
        this.settleMs = settleMs;
    }

    onForeground(pkg) {
        if (this.done) return;
        if (pkg !== this.package) {
            this.confirmed = false;
            this.readyForFrame = false;
            clearTimeout(this.settle);
            return;
        }
        if (this.confirmed) return;
        this.confirmed = true;
        this.settle = setTimeout(() => {
            if (this.done || !this.confirmed) return;
            this.readyForFrame = true;
            this.requestFrame();
        }, this.settleMs);
    }

    onFrame() {
        if (this.confirmed && this.readyForFrame) this.finish();
    }

    finish(error) {
        if (this.done) return;
        this.done = true;
        clearTimeout(this.timeout);
        clearTimeout(this.settle);
        if (error) this.reject(error); else this.resolve();
    }

    cancel() { this.finish(new Error('Disconnected.')); }
}
