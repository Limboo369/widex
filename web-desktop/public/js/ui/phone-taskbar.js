import { h, toast } from '../util/dom.js';
import { api } from '../api.js';
import { icon } from './icons.js';
import { AppVisualGate } from './app-visual-gate.js';

const STORAGE_KEY = 'widex.phoneApps';

/** Shortcuts to apps opened during this phone session; all share the existing stream. */
export class PhoneTaskbar {
    constructor(app, container) {
        this.app = app;
        this.container = container;
        this.items = new Map();
        this.closedPackages = new Set();
        this.sessionId = null;
        this.pending = null;
        this.unreadyPackage = null;
    }

    attach(session) {
        if (this.sessionId === session.id) return;
        this.items.clear();
        this.closedPackages.clear();
        this.sessionId = session.id;
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && saved.sessionId === session.id && saved.serial === session.serial && Array.isArray(saved.items)) {
                for (const pkg of Array.isArray(saved.closedPackages) ? saved.closedPackages : []) {
                    if (typeof pkg === 'string' && /^[\w.$]+$/.test(pkg)) this.closedPackages.add(pkg);
                }
                for (const item of saved.items) {
                    if (item && typeof item.package === 'string' && /^[\w.$]+$/.test(item.package) && !this.closedPackages.has(item.package)) {
                        this.items.set(item.package, { package: item.package, label: String(item.label || item.package), component: item.component });
                    }
                }
            }
        } catch (_) { /* Ignore unavailable storage or invalid old data. */ }
        this.update();
    }

    save() {
        try {
            if (this.sessionId) localStorage.setItem(STORAGE_KEY, JSON.stringify({
                sessionId: this.sessionId, serial: this.app.session.serial,
                items: [...this.items.values()].map(({ package: pkg, label, component }) => ({ package: pkg, label, component })),
                closedPackages: [...this.closedPackages],
            }));
        } catch (_) { /* The taskbar still works when storage is unavailable. */ }
    }

    clear() {
        this.visualGate?.cancel();
        this.visualGate = null;
        this.unreadyPackage = null;
        this.app.windows.cancelDockAnimation?.('phone');
        this.items.clear();
        this.closedPackages.clear();
        this.sessionId = null;
        this.pending = null;
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { }
        this.update();
    }

    remember(item) {
        if (!this.sessionId || !item || !item.package || this.closedPackages.has(item.package)) return;
        this.items.set(item.package, { ...this.items.get(item.package), ...item });
        this.save();
        this.update();
    }

    onForeground(pkg) {
        this.visualGate?.onForeground(pkg);
        const item = this.app.appsMenu.apps.find(candidate => candidate.package === pkg);
        // Don't fill the dock with launchers and system surfaces just because Android focuses them.
        if (item && (!item.system || this.items.has(pkg))) this.remember(item);
        else this.render();
    }

    closeCurrent() {
        const pkg = this.app.foregroundPackage() || this.pending?.package;
        // Cancel any delayed switch so closing the window cannot reopen it a moment later.
        this.pending = null;
        this.visualGate?.cancel();
        this.visualGate = null;
        this.unreadyPackage = null;
        this.app.windows.cancelDockAnimation?.('phone');
        if (pkg) {
            this.items.delete(pkg);
            this.closedPackages.add(pkg);
        }
        this.save();
        this.update();
    }

    refreshMetadata() {
        for (const item of this.app.appsMenu.apps) {
            if (this.items.has(item.package)) this.items.set(item.package, { ...this.items.get(item.package), ...item });
        }
        this.onForeground(this.app.foregroundPackage());
    }

    update() {
        this.app.windows.hidePhoneTaskbarItem = this.items.size > 0;
        this.app.windows.updateTaskbar();
        if (!this.app.windows.onTaskbarUpdate) this.render();
    }

    targetFor(pkg) {
        return [...this.container.children].find(button => button.dataset?.package === pkg)
            || document.getElementById('start-btn');
    }

    onVideoFrame() { this.visualGate?.onFrame(); }

    async waitForVisual(pkg) {
        // The isolated browser harness provides its own simulated frame readiness.
        if (this.app.waitForAppVisual) return this.app.waitForAppVisual(pkg);
        const gate = new AppVisualGate(pkg, () => this.app.send({ t: 'keyframe' }));
        this.visualGate = gate;
        gate.onForeground(this.app.foregroundPackage());
        try { await gate.promise; }
        finally { if (this.visualGate === gate) this.visualGate = null; }
    }

    async minimize() {
        const phone = this.app.windows.get('phone');
        if (this.pending || !phone || phone.minimized) return false;
        const operation = { sessionId: this.sessionId, package: this.app.foregroundPackage() };
        this.pending = operation;
        this.render();
        try {
            const animated = await this.app.windows.animateDock?.('phone', this.targetFor(operation.package));
            if (!animated && this.app.windows.get('phone') === phone) this.app.windows.minimize('phone');
            return true;
        } finally {
            if (this.pending === operation) { this.pending = null; this.render(); }
        }
    }

    activate(item) {
        const phone = this.app.windows.get('phone');
        if (this.app.foregroundPackage() === item.package && this.app.windows.active === 'phone' && phone && !phone.minimized) {
            return this.minimize();
        }
        return this.launch(item);
    }

    async launch(item) {
        const session = this.app.session;
        if (!session || session.state !== 'running') {
            toast('Prvo poveži telefon', 'warn');
            return false;
        }
        if (this.pending) return false;
        const operation = { sessionId: session.id, package: item.package };
        const phone = this.app.windows.get('phone');
        const switching = this.app.foregroundPackage() !== item.package;
        const opening = switching || !phone || phone.minimized;
        let collapsed = false;
        let launched = false;
        this.pending = operation;
        this.render();
        try {
            if (switching && phone && !phone.minimized && this.app.windows.animateDock) {
                collapsed = await this.app.windows.animateDock('phone', this.targetFor(this.app.foregroundPackage()));
                // Reduced motion and fullscreen can skip the effect, but the old stream must still be hidden.
                if (!collapsed && this.app.windows.get('phone') === phone && !(document.fullscreenElement && document.fullscreenElement !== document.documentElement)) {
                    this.app.windows.minimize('phone');
                    collapsed = true;
                }
            }
            if (this.pending !== operation || this.sessionId !== operation.sessionId || this.app.session?.id !== operation.sessionId) return false;
            const displayId = session.options?.newDisplay && this.app.videoDisplayId ? this.app.videoDisplayId : 0;
            if (switching) {
                await api.launchApp(session.serial, item.component || item.package, displayId);
                launched = true;
            }
            // A response from an old connection must never reopen its app in a new session.
            if (this.pending !== operation || this.sessionId !== operation.sessionId || this.app.session?.id !== operation.sessionId) return false;
            if (switching) this.unreadyPackage = item.package;
            this.closedPackages.delete(item.package);
            this.remember(item);
            if (switching || this.unreadyPackage === item.package) {
                await this.waitForVisual(item.package);
                this.unreadyPackage = null;
            }
            if (this.pending !== operation || this.sessionId !== operation.sessionId || this.app.session?.id !== operation.sessionId) return false;
            this.app.openPhone();
            this.app.windows.get('phone')?.setTitle?.((this.app.device?.model || 'Telefon') + ' — ' + item.label);
            if (opening && this.app.windows.animateDock) {
                await this.app.windows.animateDock('phone', this.targetFor(item.package), true);
            }
            return this.pending === operation && this.sessionId === operation.sessionId && this.app.session?.id === operation.sessionId;
        } catch (error) {
            if (this.pending === operation && this.sessionId === operation.sessionId) {
                if (collapsed && !launched) {
                    this.app.openPhone();
                    await this.app.windows.animateDock('phone', this.targetFor(this.app.foregroundPackage()), true);
                }
                toast('Ne mogu da otvorim ' + item.label + ': ' + error.message, 'error');
            }
            return false;
        } finally {
            if (this.pending === operation) {
                this.pending = null;
                this.render();
            }
        }
    }

    render() {
        this.container.replaceChildren();
        const phone = this.app.windows.get('phone');
        for (const item of this.items.values()) {
            const image = item.icon
                ? h('img.phone-taskbar-icon', { src: 'data:image/png;base64,' + item.icon, alt: '', draggable: false })
                : h('span.phone-taskbar-fallback', icon('grid'));
            const active = this.app.foregroundPackage() === item.package && this.app.windows.active === 'phone' && phone && !phone.minimized;
            const button = h('button.taskbar-item.phone-taskbar-item', {
                title: 'Otvori ' + item.label, 'aria-label': 'Otvori ' + item.label,
                'aria-pressed': String(!!active), disabled: !!this.pending,
                dataset: { package: item.package }, onclick: () => this.activate(item),
            }, image, h('span', item.label));
            button.classList.toggle('active', !!active);
            button.classList.toggle('pending', this.pending?.package === item.package);
            this.container.appendChild(button);
        }
    }
}
