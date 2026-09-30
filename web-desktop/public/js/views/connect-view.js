/**
 * Connection window: devices, wireless pairing (Android 11+ "Wireless debugging"), quality, start.
 */
import { h, toast } from '../util/dom.js';
import { api } from '../api.js';
import { APP_NAME } from '../brand.js';

export const QUALITY_PRESETS = [
    { id: 'fast', label: 'Fast (lower latency)', maxSize: 1280, bitRate: 8000000, maxFps: 60 },
    { id: 'balanced', label: 'Balanced (recommended)', maxSize: 1920, bitRate: 12000000, maxFps: 60 },
    { id: 'quality', label: 'Quality', maxSize: 2400, bitRate: 20000000, maxFps: 60 },
    { id: 'smooth', label: 'Smooth 90 FPS', maxSize: 1920, bitRate: 16000000, maxFps: 90 },
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

        this.pairAddress = h('input.input', { 'aria-label': 'IP address and port for pairing', placeholder: 'e.g. 192.168.1.40:37123', style: { flex: '2' } });
        this.pairCode = h('input.input.code', { 'aria-label': 'Pairing code', placeholder: '123456', maxlength: '6', inputmode: 'numeric', style: { flex: '1', minWidth: '110px' } });
        this.pairButton = h('button.btn.btn-primary', { onclick: () => this.pair() }, '🔗 Pair');
        this.pairStatus = h('div.small.muted');
        this.pairCode.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.pair();
            }
        });

        this.connectAddress = h('input.input', { 'aria-label': 'IP address and port to connect', placeholder: 'e.g. 192.168.1.40:41235', value: this.app.config.lastAddress || '', style: { flex: '2' } });
        this.connectButton = h('button.btn', { onclick: () => this.connect(this.connectAddress.value) }, '📶 Connect');
        this.discovered = h('div.device-list');
        this.connectAddress.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.connect(this.connectAddress.value);
            }
        });

        const options = this.app.config.session;
        this.quality = h('select.input',
            QUALITY_PRESETS.map((p) => h('option', { value: p.id }, p.label)),
            h('option', { value: 'custom' }, 'Custom (Settings)'));
        this.quality.value = presetFor(options);
        this.quality.addEventListener('change', () => this.saveQuick());
        this.audio = h('input', { type: 'checkbox', checked: options.audio !== false });
        this.audio.addEventListener('change', () => this.saveQuick());
        this.screenOff = h('input', { type: 'checkbox', checked: !!options.turnScreenOff });
        this.screenOff.addEventListener('change', () => this.saveQuick());

        this.element = h('div.view.connect-view',
            h('div.view-intro', h('div.view-intro-icon', '📶'),
                h('div', h('h2', 'Your phone, on your PC.'), h('p', 'One connection for games, apps and everything in between.'))),
            h('div.section',
                h('div.section-title', h('h3', '📱 Phone'), h('button.btn.btn-sm', { onclick: () => this.refresh() }, '⟳ Refresh')),
                this.deviceNotice,
                this.deviceList),
            h('div.section',
                h('div.section-title', h('h3', '⚙️ Before you start')),
                h('div.row',
                    h('div.field', h('label', 'Picture quality'), this.quality)),
                h('label.check', this.audio, h('span.check-text', 'Phone sound on the PC',
                    h('small', 'While ' + APP_NAME + ' is connected, sound plays on the PC (the phone is muted).'))),
                h('label.check', this.screenOff, h('span.check-text', 'Turn the phone screen off while playing',
                    h('small', 'The game keeps running, the phone stays cooler and saves battery.')))),
            h('details.section',
                h('summary', h('h3', '📶 First time · Pair your phone')),
                h('ol.steps',
                    h('li', 'On the phone, turn on ', h('b', 'Developer options'), ': Settings → About phone → tap ',
                        h('b', 'Build number'), ' 7 times.'),
                    h('li', 'Settings → System → Developer options → turn on ', h('b', 'Wireless debugging'),
                        '. The phone and the PC must be on the same Wi-Fi network.'),
                    h('li', 'Tap ', h('b', 'Wireless debugging'), ' → ', h('b', 'Pair device with pairing code'), '.'),
                    h('li', 'Enter the 6-digit code here. The address usually appears by itself; if not, copy the ', h('i', 'IP address & Port'),
                        ' from that screen on the phone.')),
                h('div.row', this.pairAddress, this.pairCode, this.pairButton),
                this.pairStatus),
            h('details.section',
                h('summary', h('h3', '🔌 Already paired? Connect manually')),
                h('p.small', 'The "Wireless debugging" screen shows the ', h('i', 'IP address & Port'),
                    ' (the port changes when you turn the option on again). The phone usually connects by itself.'),
                h('div.row', this.connectAddress, this.connectButton),
                this.discovered,
                h('p.small.muted', 'A USB cable works too: turn on "USB debugging" and plug it in.')));
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
            this.deviceNotice.replaceChildren(h('div.notice.error', 'Could not start adb: ' + e.message));
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
                'No phone is connected. Turn on "Wireless debugging" on the phone (steps below).'));
        } else if (this.devices.some((d) => d.state === 'unauthorized')) {
            this.deviceNotice.replaceChildren(h('div.notice.warn',
                'On the phone, accept "Allow USB debugging?" (check "Always allow from this computer").'));
        } else {
            this.deviceNotice.textContent = '';
        }

        for (const device of this.devices) {
            const running = session && session.serial === device.serial && session.state === 'running';
            const icon = device.transport === 'wifi' ? '📶' : device.transport === 'emulator' ? '🖥️' : '🔌';
            let stateTag;
            if (running) {
                stateTag = h('span.tag.ok', 'Active');
            } else if (device.state === 'device') {
                stateTag = h('span.tag.info', 'Ready');
            } else if (device.state === 'unauthorized') {
                stateTag = h('span.tag.warn', 'Waiting for permission');
            } else {
                stateTag = h('span.tag.bad', device.state);
            }
            const actions = h('div.row', { style: { flexWrap: 'nowrap' } });
            if (running) {
                actions.appendChild(h('button.btn.btn-sm', { onclick: () => this.app.openPhone() }, 'Show'));
                actions.appendChild(h('button.btn.btn-sm.btn-danger', { onclick: () => this.app.stopSession() }, 'Stop'));
            } else if (device.state === 'device') {
                actions.appendChild(h('button.btn.btn-success', {
                    disabled: this.busy,
                    onclick: () => this.app.startSession(device.serial),
                }, '▶ Start'));
            }
            if (device.transport === 'wifi') {
                actions.appendChild(h('button.btn.btn-sm', {
                    title: 'Disconnect wireless',
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
            this.deviceList.appendChild(h('div.small.muted', 'Looking for phones...'));
        }
    }

    renderDiscovered() {
        const pairing = this.mdns.filter((s) => s.type === 'pairing');
        if (pairing.length && !this.pairAddress.value) {
            this.pairAddress.value = pairing[0].address;
            this.pairStatus.textContent = '✅ Found a phone waiting to pair: ' + pairing[0].address + '. Enter the code.';
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
                    h('div.device-name', 'Found on the network'),
                    h('div.device-serial', service.address)),
                h('button.btn.btn-sm.btn-primary', { onclick: () => this.connect(service.address) }, 'Connect')));
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
            toast('The pairing code has 6 digits', 'warn');
            return;
        }
        if (!/:\d+$/.test(address)) {
            toast('Enter the pairing address as IP:port (shown on the phone, under the code)', 'warn');
            return;
        }
        this.pairButton.disabled = true;
        this.pairStatus.textContent = 'Pairing...';
        try {
            await api.pair(address, code);
            this.pairStatus.textContent = '✅ Paired! Connecting...';
            toast('Phone paired', 'ok');
            this.pairCode.value = '';
            this.pairedHost = hostOf(address);
            this.pairAddress.value = '';
            setTimeout(() => {
                if (this.pairedHost) {
                    this.pairStatus.textContent = '✅ Paired. If the phone does not show up above, enter the "IP address & Port" from the Wireless debugging screen and click Connect.';
                }
            }, 8000);
            this.refresh();
        } catch (e) {
            this.pairStatus.textContent = '❌ ' + e.message;
            toast('Pairing failed: ' + e.message, 'error', 7000);
        } finally {
            this.pairButton.disabled = false;
        }
    }

    async connect(address) {
        address = String(address || '').trim();
        if (!address) {
            toast('Enter the IP address and port', 'warn');
            return;
        }
        if (!/:\d+$/.test(address)) {
            toast('Add the port too (e.g. 192.168.1.40:41235). It is shown on the Wireless debugging screen.', 'warn', 6000);
            return;
        }
        this.connectButton.disabled = true;
        try {
            await api.connect(address);
            this.connectAddress.value = address;
            this.app.config.lastAddress = address;
            toast('Connected: ' + address, 'ok');
            await this.refresh();
        } catch (e) {
            toast('Could not connect: ' + e.message, 'error', 7000);
        } finally {
            this.connectButton.disabled = false;
        }
    }

    setBusy(busy) {
        this.busy = busy;
        this.renderDevices();
    }
}
