/**
 * Desktop window manager: draggable, resizable, maximizable windows with a taskbar.
 */
import { h } from '../util/dom.js';
import { icon } from './icons.js';

const STORAGE_KEY = 'beam.windows';

function loadGeometry() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

export class WindowManager {
    constructor(container, taskbar) {
        this.container = container;
        this.taskbar = taskbar;
        this.windows = new Map();
        this.zIndex = 100;
        this.active = null;
        this.geometry = loadGeometry();
    }

    saveGeometry(win) {
        if (win.minimized || !win.element.offsetWidth) {
            return;
        }
        if (win.maximized) {
            this.geometry[win.id] = Object.assign({}, this.geometry[win.id], { maximized: true });
        } else {
            const el = win.element;
            this.geometry[win.id] = {
                left: el.offsetLeft,
                top: el.offsetTop,
                width: el.offsetWidth,
                height: el.offsetHeight,
                maximized: false,
            };
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.geometry));
        } catch (e) {
            // ignore
        }
    }

    /** Size of the desktop area (falls back to the viewport if the layout is not ready yet). */
    getBounds() {
        const rect = this.container.getBoundingClientRect();
        if (rect.width >= 200 && rect.height >= 150) {
            return rect;
        }
        return { left: 0, top: 0, width: window.innerWidth || 1280, height: (window.innerHeight || 720) - 56 };
    }

    has(id) {
        return this.windows.has(id);
    }

    get(id) {
        return this.windows.get(id) || null;
    }

    /**
     * @param {object} options {id, title, icon, width, height, content (Node), onClose, onResize, maximized}
     */
    open(options) {
        const existing = this.windows.get(options.id);
        if (existing) {
            this.focus(options.id);
            return existing;
        }

        const bounds = this.getBounds();
        const saved = this.geometry[options.id];
        let width = Math.min(options.width || 720, bounds.width - 20);
        let height = Math.min(options.height || 520, bounds.height - 20);
        let left = Math.max(10, (bounds.width - width) / 2 + this.windows.size * 24);
        let top = Math.max(10, (bounds.height - height) / 2 + this.windows.size * 24);
        if (saved && !options.ignoreSaved && saved.width >= 320 && saved.height >= 200) {
            width = Math.min(saved.width, bounds.width);
            height = Math.min(saved.height, bounds.height);
            left = Math.min(Math.max(0, saved.left), Math.max(0, bounds.width - 120));
            top = Math.min(Math.max(0, saved.top), Math.max(0, bounds.height - 60));
        }
        width = Math.max(320, width);
        height = Math.max(200, height);

        const titleText = h('span.window-title-text', options.title);
        // macOS-style "traffic lights" on the left, title in the middle
        const header = h('div.window-header',
            h('div.window-controls',
                h('button.win-btn.win-close', { title: 'Close', 'aria-label': 'Close' }, icon('close')),
                h('button.win-btn.win-min', { title: 'Minimize', 'aria-label': 'Minimize' }, icon('minus')),
                h('button.win-btn.win-max', { title: 'Maximize', 'aria-label': 'Maximize' }, icon('fullscreen'))),
            h('div.window-title', h('span', options.icon || '🗔'), titleText),
            h('div.window-header-end'));
        const body = h('div.window-body');
        const resize = h('div.window-resize');
        const element = h('div.window.glass-panel', { id: 'win-' + options.id, role: 'dialog', 'aria-label': options.title }, header, body, resize);
        element.style.left = left + 'px';
        element.style.top = top + 'px';
        element.style.width = width + 'px';
        element.style.height = height + 'px';
        if (options.content) {
            body.appendChild(options.content);
        }
        if (options.overlayHeader) {
            // thin title bar over the content, shown only when the mouse reaches the top edge
            element.classList.add('overlay-header');
            element.addEventListener('pointermove', (e) => {
                if (document.pointerLockElement) {
                    return;
                }
                const top = element.getBoundingClientRect().top;
                const near = e.clientY - top < 10 || (element.classList.contains('header-reveal') && header.contains(e.target));
                element.classList.toggle('header-reveal', near);
            });
            element.addEventListener('pointerleave', () => element.classList.remove('header-reveal'));
        }
        this.container.appendChild(element);

        const win = {
            id: options.id,
            title: options.title,
            icon: options.icon || '🗔',
            element,
            body,
            titleText,
            maximized: false,
            minimized: false,
            prevRect: null,
            onClose: options.onClose,
            onResize: options.onResize,
            aspect: 0,
            setAspect: (ratio) => this.setAspect(options.id, ratio),
            setTitle: (title) => {
                win.title = title;
                titleText.textContent = title;
                win.element.setAttribute('aria-label', title);
                this.updateTaskbar();
            },
        };
        this.windows.set(options.id, win);
        this.setupEvents(win, header, resize);

        if ((saved && saved.maximized && !options.ignoreSaved) || options.maximized) {
            this.toggleMaximize(options.id, false);
        }
        if (win.onResize) {
            win.resizeObserver = new ResizeObserver(() => win.onResize());
            win.resizeObserver.observe(body);
        }
        this.focus(options.id);
        return win;
    }

    setupEvents(win, header, resize) {
        const { element, id } = win;
        element.addEventListener('pointerdown', () => this.focus(id), true);

        header.querySelector('.win-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.close(id);
        });
        header.querySelector('.win-max').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMaximize(id);
        });
        header.querySelector('.win-min').addEventListener('click', (e) => {
            e.stopPropagation();
            this.requestMinimize(id);
        });
        header.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.win-btn')) {
                this.toggleMaximize(id);
            }
        });

        // move
        header.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('.win-btn')) {
                return;
            }
            let startX = e.clientX;
            let startY = e.clientY;
            if (win.maximized) {
                // restore to the previous size under the cursor
                const ratio = (e.clientX - element.offsetLeft) / element.offsetWidth;
                this.toggleMaximize(id);
                element.style.left = (e.clientX - ratio * element.offsetWidth) + 'px';
                element.style.top = '0px';
            }
            const initialLeft = element.offsetLeft;
            const initialTop = element.offsetTop;
            header.setPointerCapture(e.pointerId);
            const bounds = this.getBounds();
            const move = (ev) => {
                const left = initialLeft + ev.clientX - startX;
                const top = Math.max(0, Math.min(bounds.height - 40, initialTop + ev.clientY - startY));
                element.style.left = Math.max(-element.offsetWidth + 120, Math.min(bounds.width - 120, left)) + 'px';
                element.style.top = top + 'px';
            };
            const up = () => {
                header.removeEventListener('pointermove', move);
                header.removeEventListener('pointerup', up);
                header.removeEventListener('pointercancel', up);
                this.saveGeometry(win);
            };
            header.addEventListener('pointermove', move);
            header.addEventListener('pointerup', up);
            header.addEventListener('pointercancel', up);
        });

        // resize
        resize.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const initialWidth = element.offsetWidth;
            const initialHeight = element.offsetHeight;
            resize.setPointerCapture(e.pointerId);
            const move = (ev) => {
                if (win.aspect) {
                    // keep the shape of the content (phone screen): no black bars
                    const width = Math.max(200, initialWidth + ev.clientX - startX);
                    element.style.width = width + 'px';
                    element.style.height = Math.max(200, width / win.aspect) + 'px';
                    return;
                }
                element.style.width = Math.max(320, initialWidth + ev.clientX - startX) + 'px';
                element.style.height = Math.max(200, initialHeight + ev.clientY - startY) + 'px';
            };
            const up = () => {
                resize.removeEventListener('pointermove', move);
                resize.removeEventListener('pointerup', up);
                resize.removeEventListener('pointercancel', up);
                this.saveGeometry(win);
            };
            resize.addEventListener('pointermove', move);
            resize.addEventListener('pointerup', up);
            resize.addEventListener('pointercancel', up);
        });
    }

    focus(id) {
        const win = this.windows.get(id);
        if (!win) {
            return;
        }
        if (win.minimized) {
            win.minimized = false;
            win.element.classList.remove('hidden');
        }
        if (this.active !== id) {
            for (const other of this.windows.values()) {
                other.element.classList.remove('focused');
            }
            win.element.classList.add('focused');
            win.element.style.zIndex = String(++this.zIndex);
            this.active = id;
        }
        this.updateTaskbar();
    }

    minimize(id) {
        const win = this.windows.get(id);
        if (!win) {
            return;
        }
        win.minimized = true;
        win.element.classList.add('hidden');
        if (this.active === id) {
            this.active = null;
        }
        this.updateTaskbar();
    }

    async requestMinimize(id) {
        if (id === 'phone' && this.onPhoneMinimizeRequest) return this.onPhoneMinimizeRequest();
        const win = this.get(id);
        if (!win || win.minimized || win.dockAnimation) return;
        const target = [...this.taskbar.children].find(button => button.dataset.windowId === id);
        if (!await this.animateDock(id, target) && this.get(id) === win) this.minimize(id);
    }

    cancelDockAnimation(id) {
        const win = this.get(id);
        if (win && win.dockAnimation) {
            win.dockAnimation.cancel();
            win.dockAnimation = null;
        }
    }

    /** Genie-inspired funnel to/from the dock. The live canvas and its geometry stay intact. */
    async animateDock(id, target, opening = false) {
        const win = this.get(id);
        if (!win || win.minimized || !target || (document.fullscreenElement && document.fullscreenElement !== document.documentElement)
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            || typeof win.element.animate !== 'function') return false;
        this.cancelDockAnimation(id);
        const from = win.element.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        if (!from.width || !from.height || !to.width || !to.height) return false;
        const dx = to.left + to.width / 2 - from.left - from.width / 2;
        const dy = to.bottom - from.bottom;
        const sx = Math.max(.025, Math.min(.4, to.width / from.width));
        const sy = Math.max(.025, Math.min(.2, to.height / from.height));
        const full = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
        const flat = { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: full, opacity: 1 };
        const neck = { transform: `translate(${dx * .34}px, ${dy * .26}px) scale(.64, .76)`, clipPath: 'polygon(0% 0%, 100% 0%, 67% 100%, 33% 100%)', opacity: .96 };
        const dock = { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, clipPath: full, opacity: 0 };
        const frames = opening
            ? [{ ...dock, offset: 0 }, { ...neck, offset: .42 }, { ...flat, transform: 'translate(0px, 0px) scale(1.012, 1.012)', offset: .84 }, { ...flat, offset: 1 }]
            : [{ ...flat, offset: 0 }, { ...flat, transform: 'translate(0px, 0px) scale(1, .97)', offset: .18 }, { ...neck, offset: .6 }, { ...dock, offset: 1 }];
        for (const frame of frames) frame.transformOrigin = '50% 100%';
        const animation = win.element.animate(frames, {
            duration: opening ? 380 : 280,
            easing: opening ? 'cubic-bezier(.16, 1, .3, 1)' : 'cubic-bezier(.42, 0, .58, 1)',
            fill: 'both',
        });
        win.dockAnimation = animation;
        try {
            await animation.finished;
            if (this.get(id) !== win || win.dockAnimation !== animation) return false;
            if (!opening) this.minimize(id);
            return true;
        } catch (_) {
            return false; // Closing the window or disconnecting can cancel the transition.
        } finally {
            animation.cancel();
            if (win.dockAnimation === animation) win.dockAnimation = null;
        }
    }

    /**
     * Fits the window to the shape of its content (width / height), keeping its height and center when possible.
     */
    setAspect(id, ratio) {
        const win = this.windows.get(id);
        if (!win || !(ratio > 0)) {
            return;
        }
        win.aspect = ratio;
        const el = win.element;
        if (win.maximized) {
            return;
        }
        const bounds = this.getBounds();
        const maxWidth = bounds.width - 20;
        const maxHeight = bounds.height - 20;
        // big enough to use: most of the desktop height (a landscape app is then limited by the width)
        let height = Math.min(Math.max(el.offsetHeight, maxHeight * 0.85), maxHeight);
        let width = height * ratio;
        if (width > maxWidth) {
            width = maxWidth;
            height = width / ratio;
        }
        const centerX = el.offsetLeft + el.offsetWidth / 2;
        const left = Math.min(Math.max(0, centerX - width / 2), Math.max(0, bounds.width - width));
        const top = Math.min(Math.max(0, el.offsetTop), Math.max(0, bounds.height - height));
        el.classList.add('fitting');
        clearTimeout(win.fitTimer);
        win.fitTimer = setTimeout(() => {
            el.classList.remove('fitting');
            this.saveGeometry(win);
        }, 300);
        Object.assign(el.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
    }

    toggleMaximize(id, save = true) {
        const win = this.windows.get(id);
        if (!win) {
            return;
        }
        const el = win.element;
        if (!win.maximized) {
            win.prevRect = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.width = '100%';
            el.style.height = '100%';
            win.maximized = true;
            el.classList.add('maximized');
        } else {
            const prev = win.prevRect || { left: '40px', top: '40px', width: '900px', height: '600px' };
            el.style.left = prev.left;
            el.style.top = prev.top;
            el.style.width = prev.width;
            el.style.height = prev.height;
            win.maximized = false;
            el.classList.remove('maximized');
        }
        if (save) {
            this.saveGeometry(win);
        }
    }

    close(id) {
        const win = this.windows.get(id);
        if (!win) {
            return;
        }
        if (win.onClose && win.onClose() === false) {
            return;
        }
        this.cancelDockAnimation(id);
        if (win.resizeObserver) {
            win.resizeObserver.disconnect();
        }
        win.element.remove();
        this.windows.delete(id);
        if (this.active === id) {
            this.active = null;
        }
        this.updateTaskbar();
    }

    updateTaskbar() {
        this.taskbar.textContent = '';
        for (const win of this.windows.values()) {
            if (win.id === 'phone' && this.hidePhoneTaskbarItem) continue;
            const item = h('button.taskbar-item', { title: win.title, 'aria-label': win.title, dataset: { windowId: win.id } }, h('span', win.icon), h('span', win.title));
            if (this.active === win.id && !win.minimized) {
                item.classList.add('active');
            }
            if (win.minimized) {
                item.classList.add('minimized');
            }
            item.addEventListener('click', () => {
                if (win.minimized) {
                    this.focus(win.id);
                } else if (this.active === win.id) {
                    this.requestMinimize(win.id);
                } else {
                    this.focus(win.id);
                }
            });
            this.taskbar.appendChild(item);
        }
        if (this.onTaskbarUpdate) this.onTaskbarUpdate();
    }
}
