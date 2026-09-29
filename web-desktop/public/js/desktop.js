/**
 * Wi-Dex Window Manager & Desktop System UI
 */
class WindowManager {
    constructor() {
        this.container = document.getElementById('window-container');
        this.windows = new Map();
        this.highestZ = 100;
        this.activeWindow = null;
    }

    createWindow({ id, title, icon, width = 960, height = 580, contentElement }) {
        if (this.windows.has(id)) {
            this.focusWindow(id);
            return this.windows.get(id);
        }

        const win = document.createElement('div');
        win.className = 'window glass-panel focused';
        win.id = `win-${id}`;
        win.style.width = `${width}px`;
        win.style.height = `${height}px`;
        
        // Centered initial position
        const posX = Math.max(40, (window.innerWidth - width) / 2 + (this.windows.size * 20));
        const posY = Math.max(40, (window.innerHeight - height - 60) / 2 + (this.windows.size * 20));
        win.style.left = `${posX}px`;
        win.style.top = `${posY}px`;
        win.style.zIndex = ++this.highestZ;

        win.innerHTML = `
            <div class="window-header">
                <div class="window-title">
                    <span>${icon || '📱'}</span>
                    <span>${title}</span>
                </div>
                <div class="window-controls">
                    <button class="win-btn win-min" title="Minimize"></button>
                    <button class="win-btn win-max" title="Maximize"></button>
                    <button class="win-btn win-close" title="Close"></button>
                </div>
            </div>
            <div class="window-body"></div>
        `;

        const body = win.querySelector('.window-body');
        if (contentElement) {
            body.appendChild(contentElement);
        }

        this.container.appendChild(win);
        const winObj = { id, element: win, isMaximized: false, prevRect: null };
        this.windows.set(id, winObj);

        // Bind events
        this.setupWindowEvents(winObj);
        this.focusWindow(id);
        this.updateTaskbar();

        return winObj;
    }

    setupWindowEvents(winObj) {
        const { element, id } = winObj;
        const header = element.querySelector('.window-header');
        const closeBtn = element.querySelector('.win-close');
        const minBtn = element.querySelector('.win-min');
        const maxBtn = element.querySelector('.win-max');

        // Focus window on click
        element.addEventListener('mousedown', () => this.focusWindow(id));

        // Close window
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWindow(id);
        });

        // Maximize / Restore
        maxBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMaximize(id);
        });

        // Minimize
        minBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            element.style.display = 'none';
            this.updateTaskbar();
        });

        // Dragging logic
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (winObj.isMaximized) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = element.offsetLeft;
            initialTop = element.offsetTop;
            this.focusWindow(id);
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${initialLeft + dx}px`;
            element.style.top = `${initialTop + dy}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    focusWindow(id) {
        const winObj = this.windows.get(id);
        if (!winObj) return;

        this.windows.forEach(w => w.element.classList.remove('focused'));
        winObj.element.classList.add('focused');
        winObj.element.style.zIndex = ++this.highestZ;
        winObj.element.style.display = 'flex';
        this.activeWindow = id;
        this.updateTaskbar();
    }

    closeWindow(id) {
        const winObj = this.windows.get(id);
        if (!winObj) return;
        winObj.element.remove();
        this.windows.delete(id);
        this.updateTaskbar();
    }

    toggleMaximize(id) {
        const winObj = this.windows.get(id);
        if (!winObj) return;

        const el = winObj.element;
        if (!winObj.isMaximized) {
            winObj.prevRect = {
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height
            };
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.width = '100vw';
            el.style.height = 'calc(100vh - 60px)';
            winObj.isMaximized = true;
        } else {
            el.style.left = winObj.prevRect.left;
            el.style.top = winObj.prevRect.top;
            el.style.width = winObj.prevRect.width;
            el.style.height = winObj.prevRect.height;
            winObj.isMaximized = false;
        }
    }

    updateTaskbar() {
        const taskbarApps = document.getElementById('taskbar-apps');
        taskbarApps.innerHTML = '';

        this.windows.forEach((winObj, id) => {
            const item = document.createElement('div');
            item.className = `taskbar-item ${this.activeWindow === id && winObj.element.style.display !== 'none' ? 'active' : ''}`;
            item.innerHTML = `<span>📱</span> <span>Window (${id})</span>`;
            item.addEventListener('click', () => {
                if (winObj.element.style.display === 'none') {
                    this.focusWindow(id);
                } else if (this.activeWindow === id) {
                    winObj.element.style.display = 'none';
                    this.updateTaskbar();
                } else {
                    this.focusWindow(id);
                }
            });
            taskbarApps.appendChild(item);
        });
    }
}
