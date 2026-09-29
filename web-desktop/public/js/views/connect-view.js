/**
 * Connection window: devices, wireless pairing (Android 11+ "Wireless debugging"), quality, start.
 */
import { h, toast } from '../util/dom.js';
import { api } from '../api.js';

export const QUALITY_PRESETS = [
    { id: 'fast', label: 'Brzo (manje kašnjenje)', maxSize: 1280, bitRate: 8000000, maxFps: 60 },
    { id: 'balanced', label: 'Balans (preporučeno)', maxSize: 1920, bitRate: 12000000, maxFps: 60 },
    { id: 'quality', label: 'Kvalitet', maxSize: 2400, bitRate: 20000000, maxFps: 60 },
    { id: 'smooth', label: 'Glatko 90 FPS', maxSize: 1920, bitRate: 16000000, maxFps: 90 },
];

export function presetFor(options) {
    const found = QUALITY_PRESETS.find((p) => p.maxSize === options.maxSize && p.bitRate === options.bitRate && p.maxFps === options.maxFps);
    return found ? found.id : 'custom';
}

function hostOf(address) {
    const i = address.lastIndexOf(':');
    return i > 0 ? address.substring(0, i) : address;
}

export class ConnectView {
    constructor(app) {
        this.app = app;
        this.devices = [];
        this.mdns = [];
        this.busy = false;
        this.pairedHost = null;
        this.build();
    }

    build() {
        this.deviceList = h('div.device-list');
        this.deviceNotice = h('div');

        this.pairAddress = h('input.input', { 'aria-label': 'IP adresa i port za uparivanje', placeholder: 'npr. 192.168.1.40:37123', style: { flex: '2' } });
        this.pairCode = h('input.input.code', { 'aria-label': 'Kod za uparivanje', placeholder: '123456', maxlength: '6', inputmode: 'numeric', style: { flex: '1', minWidth: '110px' } });
        this.pairButton = h('button.btn.btn-primary', { onclick: () => this.pair() }, '🔗 Upari');
        this.pairStatus = h('div.small.muted');
        this.pairCode.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.pair();
            }
        });

        this.connectAddress = h('input.input', { 'aria-label': 'IP adresa i port za povezivanje', placeholder: 'npr. 192.168.1.40:41235', value: this.app.config.lastAddress || '', style: { flex: '2' } });
        this.connectButton = h('button.btn', { onclick: () => this.connect(this.connectAddress.value) }, '📶 Poveži');
        this.discovered = h('div.device-list');
        this.connectAddress.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.connect(this.connectAddress.value);
            }
        });

        const options = this.app.config.session;
        this.quality = h('select.input',
            QUALITY_PRESETS.map((p) => h('option', { value: p.id }, p.label)),
            h('option', { value: 'custom' }, 'Prilagođeno (Podešavanja)'));
        this.quality.value = presetFor(options);
        this.quality.addEventListener('change', () => this.saveQuick());
        this.audio = h('input', { type: 'checkbox', checked: options.audio !== false });
        this.audio.addEventListener('change', () => this.saveQuick());
        this.screenOff = h('input', { type: 'checkbox', checked: !!options.turnScreenOff });
        this.screenOff.addEventListener('change', () => this.saveQuick());

        this.element = h('div.view.connect-view',
            h('div.view-intro', h('div.view-intro-icon', '📶'),
                h('div', h('h2', 'Tvoj telefon, na računaru.'), h('p', 'Jedna veza za igre, aplikacije i sve između.'))),
            h('div.section',
                h('div.section-title', h('h3', '📱 Telefon'), h('button.btn.btn-sm', { onclick: () => this.refresh() }, '⟳ Osveži')),
                this.deviceNotice,
                this.deviceList),
            h('div.section',
                h('div.section-title', h('h3', '⚙️ Pre pokretanja')),
                h('div.row',
                    h('div.field', h('label', 'Kvalitet slike'), this.quality)),
                h('label.check', this.audio, h('span.check-text', 'Zvuk telefona na računaru',
                    h('small', 'Dok je Wi-Dex povezan, zvuk ide na PC (telefon je nem).'))),
                h('label.check', this.screenOff, h('span.check-text', 'Ugasi ekran telefona tokom igranja',
                    h('small', 'Igra nastavlja da radi, telefon se manje greje i štedi bateriju.')))),
            h('details.section',
                h('summary', h('h3', '📶 Prvo povezivanje · Upari telefon')),
                h('ol.steps',
                    h('li', 'Na telefonu uključi ', h('b', 'Opcije za programere'), ': Podešavanja → O telefonu → 7 puta dodirni ',
                        h('b', 'Broj verzije'), ' (Build number).'),
                    h('li', 'Podešavanja → Sistem → Opcije za programere → uključi ', h('b', 'Bežično otklanjanje grešaka'),
                        ' (Wireless debugging). Telefon i računar moraju biti na istoj Wi-Fi mreži.'),
                    h('li', 'Dodirni ', h('b', 'Bežično otklanjanje grešaka'), ' → ', h('b', 'Upari uređaj pomoću koda za uparivanje'),
                        ' (Pair device with pairing code).'),
                    h('li', 'Unesi 6-cifreni kod ovde. Adresa se obično sama pojavi; ako ne, prepiši ', h('i', 'IP adresu i port'),
                        ' sa tog prozora na telefonu.')),
                h('div.row', this.pairAddress, this.pairCode, this.pairButton),
                this.pairStatus),
            h('details.section',
                h('summary', h('h3', '🔌 Već upareno? Poveži se ručno')),
                h('p.small', 'Na ekranu „Bežično otklanjanje grešaka“ piše ', h('i', 'IP adresa i port'),
                    ' (port se menja kad ponovo uključiš opciju). Telefon se obično poveže i sam.'),
                h('div.row', this.connectAddress, this.connectButton),
                this.discovered,
                h('p.small.muted', 'Može i preko USB kabla: uključi „USB otklanjanje grešaka“ i poveži kabl.')));
    }

    saveQuick() {
        const preset = QUALITY_PRESETS.find((p) => p.id === this.quality.value);
        const session = Object.assign({}, this.app.config.session, {
            audio: this.audio.checked,
            turnScreenOff: this.screenOff.checked,
        });
        if (preset) {
            session.maxSize = preset.maxSize;
            session.bitRate = preset.bitRate;
            session.maxFps = preset.maxFps;
        }
        this.app.updateSessionConfig(session);
    }

    startPolling() {
        this.refresh();
        clearInterval(this.timer);
        this.timer = setInterval(() => this.refresh(), 2500);
    }

    stopPolling() {
        clearInterval(this.timer);
        this.timer = null;
    }

    async refresh() {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        try {
            const data = await api.devices();
            this.devices = data.devices;
            this.mdns = data.mdns;
            this.renderDevices();
            this.renderDiscovered();
        } catch (e) {
            this.deviceNotice.replaceChildren(h('div.notice.error', 'Ne mogu da pokrenem adb: ' + e.message));
        } finally {
            this.refreshing = false;
        }
    }

    renderDevices() {
        const session = this.app.session;
        this.deviceList.textContent = '';
        const usable = this.devices.filter((d) => d.state === 'device');
        if (!this.devices.length) {
            this.deviceNotice.replaceChildren(h('div.notice.info',
                'Nijedan telefon nije povezan. Uključi „Bežično otklanjanje grešaka“ na telefonu (koraci ispod).'));
        } else if (this.devices.some((d) => d.state === 'unauthorized')) {
            this.deviceNotice.replaceChildren(h('div.notice.warn',
                'Na ekranu telefona prihvati poruku „Dozvoliti otklanjanje grešaka?“ (označi „Uvek dozvoli sa ovog računara“).'));
        } else {
            this.deviceNotice.textContent = '';
        }

        for (const device of this.devices) {
            const running = session && session.serial === device.serial && session.state === 'running';
            const icon = device.transport === 'wifi' ? '📶' : device.transport === 'emulator' ? '🖥️' : '🔌';
            let stateTag;
            if (running) {
                stateTag = h('span.tag.ok', 'Aktivno');
            } else if (device.state === 'device') {
                stateTag = h('span.tag.info', 'Spreman');
            } else if (device.state === 'unauthorized') {
                stateTag = h('span.tag.warn', 'Čeka dozvolu');
            } else {
                stateTag = h('span.tag.bad', device.state);
            }
            const actions = h('div.row', { style: { flexWrap: 'nowrap' } });
            if (running) {
                actions.appendChild(h('button.btn.btn-sm', { onclick: () => this.app.openPhone() }, 'Prikaži'));
                actions.appendChild(h('button.btn.btn-sm.btn-danger', { onclick: () => this.app.stopSession() }, 'Zaustavi'));
            } else if (device.state === 'device') {
                actions.appendChild(h('button.btn.btn-success', {
                    disabled: this.busy,
                    onclick: () => this.app.startSession(device.serial),
                }, '▶ Pokreni'));
            }
            if (device.transport === 'wifi') {
                actions.appendChild(h('button.btn.btn-sm', {
                    title: 'Prekini bežičnu vezu',
                    onclick: async () => {
                        await api.disconnect(device.serial).catch(() => {});
                        this.refresh();
                    },
                }, '✕'));
            }
            this.deviceList.appendChild(h('div.device-item',
                h('div.device-icon', icon),
                h('div.device-info',
                    h('div.device-name', device.model || device.serial, ' ', stateTag),
                    h('div.device-serial', device.serial)),
                actions));
        }
        if (!usable.length && this.devices.length === 0) {
            this.deviceList.appendChild(h('div.small.muted', 'Tražim telefone...'));
        }
    }

    renderDiscovered() {
        const pairing = this.mdns.filter((s) => s.type === 'pairing');
        if (pairing.length && !this.pairAddress.value) {
            this.pairAddress.value = pairing[0].address;
            this.pairStatus.textContent = '✅ Pronađen telefon koji čeka uparivanje: ' + pairing[0].address + ' — unesi kod.';
            this.pairCode.closest('details').open = true;
            this.pairCode.focus();
        }

        const connected = new Set(this.devices.map((d) => d.serial));
        const connectable = this.mdns.filter((s) => s.type === 'connect' && !connected.has(s.address) && !connected.has(s.name + '._adb-tls-connect._tcp'));
        this.discovered.textContent = '';
        for (const service of connectable) {
            this.discovered.appendChild(h('div.device-item',
                h('div.device-icon', '📡'),
                h('div.device-info',
                    h('div.device-name', 'Pronađen na mreži'),
                    h('div.device-serial', service.address)),
                h('button.btn.btn-sm.btn-primary', { onclick: () => this.connect(service.address) }, 'Poveži')));
        }

        // just paired: connect automatically to the same phone
        if (this.pairedHost) {
            const match = connectable.find((s) => hostOf(s.address) === this.pairedHost);
            if (match) {
                this.pairedHost = null;
                this.connect(match.address);
            }
        }
    }

    async pair() {
        const address = this.pairAddress.value.trim();
        const code = this.pairCode.value.trim();
        if (!/^\d{6}$/.test(code)) {
            toast('Kod za uparivanje ima 6 cifara', 'warn');
            return;
        }
        if (!/:\d+$/.test(address)) {
            toast('Unesi adresu za uparivanje u obliku IP:port (piše na telefonu, ispod koda)', 'warn');
            return;
        }
        this.pairButton.disabled = true;
        this.pairStatus.textContent = 'Uparujem...';
        try {
            await api.pair(address, code);
            this.pairStatus.textContent = '✅ Upareno! Povezujem se...';
            toast('Telefon je uparen', 'ok');
            this.pairCode.value = '';
            this.pairedHost = hostOf(address);
            this.pairAddress.value = '';
            setTimeout(() => {
                if (this.pairedHost) {
                    this.pairStatus.textContent = '✅ Upareno. Ako se telefon ne pojavi gore, unesi „IP adresu i port“ sa ekrana Bežično otklanjanje grešaka i klikni Poveži.';
                }
            }, 8000);
            this.refresh();
        } catch (e) {
            this.pairStatus.textContent = '❌ ' + e.message;
            toast('Uparivanje nije uspelo: ' + e.message, 'error', 7000);
        } finally {
            this.pairButton.disabled = false;
        }
    }

    async connect(address) {
        address = String(address || '').trim();
        if (!address) {
            toast('Unesi IP adresu i port', 'warn');
            return;
        }
        if (!/:\d+$/.test(address)) {
            toast('Dodaj i port (npr. 192.168.1.40:41235) — piše na ekranu Bežično otklanjanje grešaka', 'warn', 6000);
            return;
        }
        this.connectButton.disabled = true;
        try {
            await api.connect(address);
            this.connectAddress.value = address;
            this.app.config.lastAddress = address;
            toast('Povezano: ' + address, 'ok');
            await this.refresh();
        } catch (e) {
            toast('Povezivanje nije uspelo: ' + e.message, 'error', 7000);
        } finally {
            this.connectButton.disabled = false;
        }
    }

    setBusy(busy) {
        this.busy = busy;
        this.renderDevices();
    }
}
