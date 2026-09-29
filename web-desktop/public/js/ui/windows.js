/**
 * Desktop window manager: draggable, resizable, maximizable windows with a taskbar.
 */
import { h } from '../util/dom.js';

const STORAGE_KEY = 'widex.windows';

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
        const header = h('div.window-header',
            h('div.window-title', h('span', options.icon || '🗔'), titleText),
            h('div.window-controls',
                h('button.win-btn.win-min', { title: 'Umanji' }, '—'),
                h('button.win-btn.win-max', { title: 'Uvećaj' }, '▢'),
                h('button.win-btn.win-close', { title: 'Zatvori' }, '✕')));
        const body = h('div.window-body');
        const resize = h('div.window-resize');
        const element = h('div.window.glass-panel', { id: 'win-' + options.id }, header, body, resize);
        element.style.left = left + 'px';
        element.style.top = top + 'px';
        element.style.width = width + 'px';
        element.style.height = height + 'px';
        if (options.content) {
            body.appendChild(options.content);
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
            setTitle: (title) => {
                win.title = title;
                titleText.textContent = title;
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
            this.minimize(id);
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
            const item = h('div.taskbar-item', { title: win.title }, h('span', win.icon), h('span', win.title));
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
                    this.minimize(win.id);
                } else {
                    this.focus(win.id);
                }
            });
            this.taskbar.appendChild(item);
        }
    }
}
