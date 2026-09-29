/**
 * Start menu: apps installed on the phone (with icons), search, launch.
 */
import { $, h, toast } from '../util/dom.js';
import { api } from '../api.js';

export class AppsMenu {
    constructor(app) {
        this.app = app;
        this.menu = $('#start-menu');
        this.grid = $('#app-grid');
        this.message = $('#apps-message');
        this.search = $('#app-search');
        this.showSystem = $('#show-system-apps');
        this.apps = [];
        this.serial = null;
        this.loading = false;
        this.showSystem.checked = localStorage.getItem('widex.showSystemApps') === '1';

        this.search.addEventListener('input', () => this.render());
        this.search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = this.grid.querySelector('.app-card');
                if (first) {
                    first.click();
                }
            } else if (e.key === 'Escape') {
                this.hide();
            }
        });
        this.showSystem.addEventListener('change', () => {
            localStorage.setItem('widex.showSystemApps', this.showSystem.checked ? '1' : '0');
            this.render();
        });
        $('#btn-refresh-apps').addEventListener('click', () => this.load(true));
        $('#btn-start-screen').addEventListener('click', () => {
            this.app.togglePhoneScreen();
        });
        $('#btn-start-disconnect').addEventListener('click', () => {
            this.hide();
            this.app.stopSession();
        });

        document.addEventListener('pointerdown', (e) => {
            if (!this.menu.classList.contains('hidden') && !this.menu.contains(e.target) && !e.target.closest('#start-btn, [data-action="apps"]')) {
                this.hide();
            }
        });
    }

    isOpen() {
        return !this.menu.classList.contains('hidden');
    }

    toggle() {
        if (this.isOpen()) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.menu.classList.remove('hidden');
        $('#start-btn').setAttribute('aria-expanded', 'true');
        this.search.value = '';
        this.search.focus();
        const serial = this.app.currentSerial();
        if (serial && (serial !== this.serial || !this.apps.length)) {
            this.load(false);
        } else {
            this.render();
        }
    }

    hide() {
        this.menu.classList.add('hidden');
        $('#start-btn').setAttribute('aria-expanded', 'false');
    }

    async load(refresh) {
        const serial = this.app.currentSerial();
        if (!serial) {
            this.apps = [];
            this.render();
            return;
        }
        if (this.loading) {
            return;
        }
        this.loading = true;
        this.message.replaceChildren(h('span.spinner'), ' Učitavam aplikacije sa telefona...');
        try {
            const data = await api.apps(serial, refresh);
            if (this.app.currentSerial() !== serial) {
                this.loading = false;
                return;
            }
            this.apps = data.apps;
            this.serial = serial;
            this.app.phoneApps.refreshMetadata();
        } catch (e) {
            this.message.textContent = 'Greška: ' + e.message;
            this.loading = false;
            return;
        }
        this.loading = false;
        this.render();
    }

    labelOf(pkg) {
        const app = this.apps.find((a) => a.package === pkg);
        return app ? app.label : null;
    }

    render() {
        this.grid.textContent = '';
        const serial = this.app.currentSerial();
        if (!serial) {
            this.message.replaceChildren(h('div.apps-empty',
                h('div.view-intro-icon', '📱'), h('h3', 'Tvoje aplikacije stižu s telefonom.'),
                h('p', 'Poveži uređaj i otvori svoje igre i aplikacije ovdje.'),
                h('button.btn.btn-primary', { onclick: () => { this.hide(); this.app.openConnect(); } }, '📶 Poveži telefon')));
            return;
        }
        const query = this.search.value.trim().toLowerCase();
        const profiles = new Set(this.app.profiles.map((p) => p.package));
        const list = this.apps.filter((a) => {
            if (!this.showSystem.checked && a.system && !query) {
                return false;
            }
            return !query || a.label.toLowerCase().includes(query) || a.package.toLowerCase().includes(query);
        });
        // games with a saved key mapping first
        list.sort((a, b) => (profiles.has(b.package) ? 1 : 0) - (profiles.has(a.package) ? 1 : 0));
        for (const app of list) {
            const icon = app.icon
                ? h('img', { src: 'data:image/png;base64,' + app.icon, alt: '', draggable: 'false' })
                : h('div.app-letter', app.label.charAt(0).toUpperCase());
            const card = h('button.app-card', { title: app.package },
                icon,
                h('span', app.label),
                profiles.has(app.package) ? h('span.badge-profile', '🎮 mapirano') : null);
            card.addEventListener('click', () => this.launch(app));
            this.grid.appendChild(card);
        }
        this.message.textContent = list.length ? '' : (this.apps.length ? 'Nema rezultata.' : '');
    }

    async launch(app) {
        this.hide();
        if (await this.app.phoneApps.launch(app)) {
            toast('Pokrećem ' + app.label, 'info', 2000);
        }
    }
}
