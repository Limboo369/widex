/**
 * First-run setup guide: a step-by-step wizard that gets a phone ready for Beam
 * (Developer options, USB or wireless debugging, the permission prompt, drivers),
 * with a live connection check. Reopen it from Help or the Beam menu.
 */
import { h, toast } from '../util/dom.js';
import { api } from '../api.js';
import { APP_NAME } from '../brand.js';

export const SETUP_DONE_KEY = 'beam.setupDone';

const DRIVER_URL = 'https://developer.android.com/studio/run/win-usb';
const OEM_DRIVERS_URL = 'https://developer.android.com/studio/run/oem-usb';

function hostOf(address) {
    const i = address.lastIndexOf(':');
    return i > 0 ? address.substring(0, i) : address;
}

export function isSetupDone() {
    try {
        return localStorage.getItem(SETUP_DONE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function markSetupDone() {
    try {
        localStorage.setItem(SETUP_DONE_KEY, '1');
    } catch (e) {
        // private storage: the guide just shows again next time
    }
}

export class SetupView {
    constructor(app) {
        this.app = app;
        this.isMac = !!(app.info && app.info.platform === 'darwin');
        this.computer = this.isMac ? 'Mac' : 'PC';
        this.method = 'usb';
        this.index = 0;
        this.devices = [];
        this.mdns = [];
        this.pairedHost = null;
        this.build();
    }

    // ------------------------------------------------------------------ steps

    steps() {
        const usb = this.method === 'usb';
        const list = [
            { id: 'welcome', title: 'Welcome', render: () => this.welcomeStep() },
            { id: 'developer', title: 'Developer options', render: () => this.developerStep() },
        ];
        if (usb) {
            list.push({ id: 'usb', title: 'USB debugging', render: () => this.usbStep() });
            list.push({ id: 'cable', title: 'Plug in and allow', render: () => this.cableStep() });
        } else {
            list.push({ id: 'wireless', title: 'Wireless debugging', render: () => this.wirelessStep() });
            list.push({ id: 'pair', title: 'Pair', render: () => this.pairStep() });
        }
        list.push({ id: 'check', title: 'Check connection', render: () => this.checkStep() });
        return list;
    }

    welcomeStep() {
        const option = (method, icon, title, text) => h('button.setup-choice' + (this.method === method ? '.selected' : ''), {
            type: 'button',
            'aria-pressed': String(this.method === method),
            onclick: () => {
                this.method = method;
                this.render();
            },
        }, h('span.setup-choice-icon', icon), h('span', h('b', title), h('small', text)));
        return [
            h('h2', 'Set up your phone for ' + APP_NAME),
            h('p', APP_NAME + ' shows your Android phone on your ' + this.computer + ' over Android\'s debugging connection (adb). ' +
                'It takes about two minutes, and you only do it once.'),
            h('div.notice.info', 'Nothing to install on the phone. ' + APP_NAME + ' sends its small helper to the phone by itself ' +
                'each time it connects.'),
            h('h3', 'How do you want to connect?'),
            h('div.setup-choices',
                option('usb', '🔌', 'USB cable', 'Easiest and most stable. Works on Android 5 and newer.'),
                option('wifi', '📶', 'Wi-Fi', 'No cable. Needs Android 11 or newer and the same Wi-Fi network.')),
        ];
    }

    developerStep() {
        return [
            h('h2', 'Turn on Developer options'),
            h('ol.steps',
                h('li', 'On the phone, open ', h('b', 'Settings'), ' → ', h('b', 'About phone'), '.'),
                h('li', 'Tap ', h('b', 'Build number'), ' seven times. Enter your PIN if the phone asks.'),
                h('li', 'You will see ', h('i', '"You are now a developer!"'), '.')),
            h('p.small.muted', 'Samsung: Settings → About phone → Software information → Build number. ' +
                'Xiaomi: Settings → About phone → tap MIUI / OS version. If you already see "Developer options" in Settings → System, skip this step.'),
        ];
    }

    usbStep() {
        return [
            h('h2', 'Turn on USB debugging'),
            h('ol.steps',
                h('li', 'Open ', h('b', 'Settings'), ' → ', h('b', 'System'), ' → ', h('b', 'Developer options'), '.'),
                h('li', 'Turn on ', h('b', 'USB debugging'), ' and confirm with OK.'),
                h('li', 'Optional, for games: in the same list turn on ', h('b', 'Stay awake'),
                    ' so the phone does not lock while it charges.')),
            h('p.small.muted', 'Xiaomi phones also need "USB debugging (Security settings)" turned on, or taps from the ' +
                this.computer + ' will not work.'),
        ];
    }

    cableStep() {
        const driver = this.isMac
            ? h('div.notice.info', 'No driver is needed on a Mac. If macOS asks ', h('i', '"Allow accessory to connect?"'),
                ', click ', h('b', 'Allow'), '.')
            : h('div.notice.info',
                h('b', 'Windows driver: '), 'most phones work right away. If the phone never shows up below, install the ',
                h('a', { href: DRIVER_URL, target: '_blank', rel: 'noopener' }, 'Google USB Driver'),
                ' (Pixel, Nexus) or your phone maker\'s driver (',
                h('a', { href: OEM_DRIVERS_URL, target: '_blank', rel: 'noopener' }, 'Samsung, Xiaomi, OnePlus and others'),
                '), then unplug and plug the cable in again.');
        return [
            h('h2', 'Plug in the cable and allow the ' + this.computer),
            h('ol.steps',
                h('li', 'Connect the phone to the ' + this.computer + ' with a USB cable that carries data (some cables only charge).'),
                h('li', 'Unlock the phone. It asks ', h('i', '"Allow USB debugging?"'), '.'),
                h('li', 'Check ', h('b', 'Always allow from this computer'), ' and tap ', h('b', 'Allow'), '.')),
            driver,
            this.liveBox(),
        ];
    }

    wirelessStep() {
        return [
            h('h2', 'Turn on Wireless debugging'),
            h('ol.steps',
                h('li', 'Connect the phone and the ' + this.computer + ' to the ', h('b', 'same Wi-Fi network'), '.'),
                h('li', 'Open ', h('b', 'Settings'), ' → ', h('b', 'System'), ' → ', h('b', 'Developer options'), '.'),
                h('li', 'Turn on ', h('b', 'Wireless debugging'), ' and tap ', h('b', 'Allow'), ' for this network.')),
            h('p.small.muted', 'After the phone restarts, Wireless debugging turns off. Turn it on again; you do not need to pair again.'),
        ];
    }

    pairStep() {
        if (!this.pairAddress) {
            this.pairAddress = h('input.input', { 'aria-label': 'Pairing IP address and port', placeholder: 'e.g. 192.168.1.40:37123', style: { flex: '2' } });
            this.pairCode = h('input.input.code', { 'aria-label': 'Pairing code', placeholder: '123456', maxlength: '6', inputmode: 'numeric', style: { flex: '1', minWidth: '110px' } });
            this.pairButton = h('button.btn.btn-primary', { onclick: () => this.pair() }, '🔗 Pair');
            this.pairStatus = h('div.small.muted');
            this.pairCode.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.pair();
                }
            });
        }
        return [
            h('h2', 'Pair the phone with this ' + this.computer),
            h('ol.steps',
                h('li', 'On the phone, tap the words ', h('b', 'Wireless debugging'), ' (not the switch) → ',
                    h('b', 'Pair device with pairing code'), '.'),
                h('li', 'Type the 6-digit code here. The address fills in by itself when ' + APP_NAME +
                    ' finds the phone; if not, copy the IP address & Port shown under the code.')),
            h('div.row', this.pairAddress, this.pairCode, this.pairButton),
            this.pairStatus,
            this.liveBox(),
        ];
    }

    checkStep() {
        return [
            h('h2', 'Check the connection'),
            h('p', APP_NAME + ' checks every few seconds. When the phone shows ', h('span.tag.ok', 'Ready'), ', you are done.'),
            this.liveBox(true),
        ];
    }

    // ------------------------------------------------------------------ live status

    liveBox(detailed = false) {
        this.live = h('div.setup-live');
        this.liveDetailed = detailed;
        this.renderLive();
        return this.live;
    }

    /** What the connection looks like right now, and what to do about it. */
    diagnose() {
        const ready = this.devices.find((d) => d.state === 'device');
        if (ready) {
            return { state: 'ok', device: ready, title: (ready.model || ready.serial) + ' is ready', text: 'Everything is set up. Click Finish to start.' };
        }
        if (this.devices.some((d) => d.state === 'unauthorized')) {
            return {
                state: 'warn',
                title: 'Waiting for permission on the phone',
                text: 'Unlock the phone and tap Allow on "Allow USB debugging?". No prompt? Unplug the cable, ' +
                    'or in Developer options tap "Revoke USB debugging authorizations" and plug in again.',
            };
        }
        const offline = this.devices.find((d) => d.state !== 'device');
        if (offline) {
            return {
                state: 'warn',
                title: 'The phone is ' + offline.state,
                text: 'Unplug the cable and plug it in again (or turn Wireless debugging off and on). Restarting the phone helps if it stays like this.',
            };
        }
        if (this.adbError) {
            return { state: 'bad', title: 'The Android connection tool (adb) did not start', text: this.adbError + '. Restart ' + APP_NAME + ' and try again.' };
        }
        if (this.method === 'wifi') {
            return {
                state: 'wait',
                title: 'No phone yet',
                text: 'Check that both are on the same Wi-Fi, that Wireless debugging is on, and that you paired the phone. ' +
                    'Turning Wireless debugging off and on often helps.',
            };
        }
        return {
            state: 'wait',
            title: 'No phone yet',
            text: this.isMac
                ? 'Check that USB debugging is on, the phone is unlocked and the cable carries data (try another cable or port). ' +
                    'If the notification says "Charging this device via USB", tap it and choose "File transfer".'
                : 'Check that USB debugging is on, the phone is unlocked and the cable carries data (try another cable or port). ' +
                    'If the notification says "Charging this device via USB", tap it and choose "File transfer". Still nothing? Install the USB driver (see the step before).',
        };
    }

    renderLive() {
        if (!this.live) {
            return;
        }
        const d = this.diagnose();
        const icon = { ok: '✅', warn: '⚠️', bad: '❌', wait: '⟳' }[d.state];
        this.live.className = 'setup-live ' + d.state;
        this.live.replaceChildren(
            h('div.setup-live-icon' + (d.state === 'wait' ? '.spin' : ''), icon),
            h('div', h('b', d.title), (this.liveDetailed || d.state !== 'wait') ? h('p.small', d.text) : h('p.small', 'Looking for your phone...')));
        if (this.nextButton && this.current().id === 'check') {
            this.nextButton.disabled = d.state !== 'ok';
        }
    }

    startPolling() {
        this.refresh();
        clearInterval(this.timer);
        this.timer = setInterval(() => this.refresh(), 2000);
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
            this.adbError = null;
            this.onDiscovery();
        } catch (e) {
            this.adbError = e.message;
        } finally {
            this.refreshing = false;
            this.renderLive();
        }
    }

    onDiscovery() {
        if (this.pairAddress && !this.pairAddress.value) {
            const pairing = this.mdns.find((s) => s.type === 'pairing');
            if (pairing) {
                this.pairAddress.value = pairing.address;
                this.pairStatus.textContent = '✅ Found a phone waiting to pair. Enter the code.';
            }
        }
        if (this.pairedHost) {
            const connected = new Set(this.devices.map((d) => d.serial));
            const match = this.mdns.find((s) => s.type === 'connect' && hostOf(s.address) === this.pairedHost && !connected.has(s.address));
            if (match) {
                this.pairedHost = null;
                api.connect(match.address)
                    .then(() => {
                        this.app.config.lastAddress = match.address;
                        this.refresh();
                    })
                    .catch((e) => {
                        this.pairStatus.textContent = '❌ Paired, but could not connect: ' + e.message;
                    });
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
            this.pairCode.value = '';
            this.pairedHost = hostOf(address);
            this.refresh();
        } catch (e) {
            this.pairStatus.textContent = '❌ ' + e.message + '. Check the code (it changes each time the dialog opens) and try again.';
        } finally {
            this.pairButton.disabled = false;
        }
    }

    // ------------------------------------------------------------------ layout

    current() {
        return this.steps()[this.index];
    }

    build() {
        this.progress = h('ol.setup-progress');
        this.body = h('div.setup-body');
        this.backButton = h('button.btn', { onclick: () => this.go(-1) }, 'Back');
        this.nextButton = h('button.btn.btn-primary', { onclick: () => this.go(1) }, 'Next');
        this.skipButton = h('button.btn.btn-sm.setup-skip', { onclick: () => this.close() }, 'Skip for now');
        this.element = h('div.view.setup-view',
            this.progress,
            this.body,
            h('div.setup-footer', this.skipButton, h('div.row', this.backButton, this.nextButton)));
        this.render();
    }

    render() {
        const steps = this.steps();
        this.index = Math.min(this.index, steps.length - 1);
        this.live = null;
        this.progress.replaceChildren(...steps.map((s, i) => h('li' + (i < this.index ? '.done' : i === this.index ? '.active' : ''),
            h('span.setup-dot', i < this.index ? '✓' : String(i + 1)), h('span.setup-step-name', s.title))));
        this.body.replaceChildren(...[].concat(steps[this.index].render()));
        this.backButton.disabled = this.index === 0;
        const last = this.index === steps.length - 1;
        this.nextButton.textContent = last ? 'Finish' : this.index === 0 ? 'Get started' : 'Next';
        this.nextButton.disabled = false;
        this.renderLive();
        this.body.scrollTop = 0;
    }

    go(delta) {
        const steps = this.steps();
        if (delta > 0 && this.index === steps.length - 1) {
            this.finish();
            return;
        }
        this.index = Math.max(0, Math.min(steps.length - 1, this.index + delta));
        this.render();
    }

    finish() {
        const ready = this.devices.find((d) => d.state === 'device');
        markSetupDone();
        this.close();
        if (ready) {
            this.app.startSession(ready.serial);
        } else {
            this.app.openConnect();
        }
    }

    close() {
        markSetupDone();
        this.app.windows.close('setup');
    }
}
