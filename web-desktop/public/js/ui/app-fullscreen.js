/**
 * Wi-Dex over the whole screen (F11): the whole desktop goes fullscreen, like any Windows app.
 * Not the same as an Android app window in fullscreen (F10), which shows only the phone screen;
 * that one stacks on top of this, so leaving it returns to Wi-Dex in fullscreen.
 */
import { toast } from '../util/dom.js';

export class AppFullscreen {
    constructor() {
        this.onChange = null;
        // Wi-Dex itself is fullscreen (an app window may be fullscreen on top of it)
        this.active = false;
        // capture: runs before the phone view, so F11 never reaches the game
        window.addEventListener('keydown', (e) => this.onKey(e), true);
        window.addEventListener('keyup', (e) => {
            if (e.code === 'F11') {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === document.documentElement) {
                if (navigator.keyboard && navigator.keyboard.lock) {
                    // Esc goes to the phone (Back), as in the app fullscreen; F11 leaves
                    navigator.keyboard.lock().catch(() => {});
                }
                if (!this.active) {
                    this.active = true;
                    toast('Wi-Dex is fullscreen. Press F11 to exit.', 'info', 3000);
                }
            } else if (!document.fullscreenElement) {
                this.active = false;
            }
            document.body.classList.toggle('widex-fullscreen', this.active);
            if (this.onChange) {
                this.onChange(this.active);
            }
        });
    }

    onKey(e) {
        if (e.code !== 'F11') {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) {
            this.toggle();
        }
    }

    async toggle() {
        if (document.fullscreenElement) {
            await this.exit();
        } else {
            await this.enter();
        }
    }

    async enter() {
        try {
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        } catch (e) {
            toast('Fullscreen is not allowed: ' + e.message, 'warn');
        }
    }

    /** Leaves every fullscreen level (an app window on top of Wi-Dex too). */
    async exit() {
        for (let i = 0; i < 3 && document.fullscreenElement; i++) {
            await document.exitFullscreen().catch(() => {});
        }
    }

    /** "Start in fullscreen" in the browser: the browser needs a click or key press first. */
    enterOnFirstInput() {
        const once = () => {
            window.removeEventListener('pointerdown', once, true);
            window.removeEventListener('keydown', once, true);
            if (!document.fullscreenElement) {
                this.enter();
            }
        };
        window.addEventListener('pointerdown', once, true);
        window.addEventListener('keydown', once, true);
    }
}
