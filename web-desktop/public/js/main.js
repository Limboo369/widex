/**
 * Beam web desktop: application controller.
 */
import { $, $$, h, toast } from './util/dom.js';
import { api } from './api.js';
import { WindowManager } from './ui/windows.js';
import { PhoneTaskbar } from './ui/phone-taskbar.js';
import { icon, mountIcons } from './ui/icons.js';
import { StreamConnection } from './stream/connection.js';
import { AudioPlayer } from './stream/audio.js';
import { PhoneView } from './views/phone-view.js';
import { ConnectView } from './views/connect-view.js';
import { SettingsView } from './views/settings-view.js';
import { AppsMenu } from './views/apps-menu.js';
import { createHelpView } from './views/help-view.js';
import { SetupView, isSetupDone } from './views/setup-view.js';
import { AppFullscreen } from './ui/app-fullscreen.js';
import { APP_NAME } from './brand.js';

const PACKET_SESSION = 0;
const CODEC_H265 = 0x68323635;

class App {
    constructor() {
        this.info = null;
        this.config = { session: {} };
        this.presets = [];
        this.profiles = [];
        this.session = null;
        this.device = null;
        this.conn = null;
        this.stats = {};
        this.ping = null;
        this.foreground = null;
        this.phoneView = null;
        this.connectView = null;
        this.videoDisplayId = 0;
        this.audio = new AudioPlayer();
        this.muted = localStorage.getItem('beam.muted') === '1';
        this.volume = parseFloat(localStorage.getItem('beam.volume') || '1');
        this.audioLatency = parseInt(localStorage.getItem('beam.audioLatency') || '60', 10);
        this.audio.setMuted(this.muted);
        this.audio.setVolume(this.volume);
        this.audio.setTargetLatency(this.audioLatency);
        this.starting = false;
    }

    async init() {
        mountIcons();
        this.windows = new WindowManager($('#window-container'), $('#taskbar-windows'));
        this.appsMenu = new AppsMenu(this);
        this.phoneApps = new PhoneTaskbar(this, $('#taskbar-phone-apps'));
        this.windows.onTaskbarUpdate = () => {
            this.phoneApps.render();
            const phone = this.windows.get('phone');
            if (this.phoneView) {
                this.phoneView.setToolbarVisible(!!phone && !phone.minimized);
            }
        };
        this.windows.onPhoneMinimizeRequest = () => this.phoneApps.minimize();
        this.installDesktop();
        this.installBrandMenu();
        this.startClock();

        try {
            [this.info, this.config] = await Promise.all([api.info(), api.config()]);
            const profileData = await api.profiles();
            this.presets = profileData.presets;
            this.profiles = profileData.profiles;
        } catch (e) {
            toast(e.message, 'error', 10000);
            return;
        }
        if (this.config.startFullscreen && !new URLSearchParams(location.search).has('app')) {
            // the Windows app goes fullscreen by itself (app/main.js); the browser waits for a click
            this.fullscreen.enterOnFirstInput();
        }
        if (!this.info.adbVersion) {
            toast('adb was not found. Install the Android SDK Platform-Tools (or Android Studio).', 'error', 15000);
        }
        if (typeof window.VideoDecoder !== 'function') {
            toast('This browser does not support WebCodecs. Use Chrome or Edge at http://localhost', 'error', 15000);
        }

        // resume an existing session (page reloaded), or connect to the last phone
        let resumed = false;
        try {
            const { sessions } = await api.sessions();
            const running = sessions.find((s) => s.state === 'running');
            if (running) {
                this.attach(running);
                resumed = true;
            }
        } catch (e) {
            // ignore
        }
        if (!resumed) {
            this.openConnect();
            if (!isSetupDone() || new URLSearchParams(location.search).has('setup')) {
                this.openSetup();
            }
            this.autoStart();
        }
        setInterval(() => this.sendPing(), 2000);
        document.addEventListener('pointerdown', () => this.resumeAudio(), true);
        document.addEventListener('keydown', () => this.resumeAudio(), true);
    }

    async autoStart() {
        const last = this.config.lastDevice;
        try {
            let { devices } = await api.devices();
            if (!devices.some((d) => d.state === 'device') && this.config.lastAddress) {
                // wireless: try the last address (the port may have changed)
                await api.connect(this.config.lastAddress).catch(() => {});
                devices = (await api.devices()).devices;
            }
            const ready = devices.filter((d) => d.state === 'device');
            const target = ready.find((d) => d.serial === last) || (ready.length === 1 && last ? ready[0] : null);
            if (target) {
                toast('Connecting to ' + (target.model || target.serial) + '...', 'info', 3000);
                this.startSession(target.serial);
            }
        } catch (e) {
            // the connect window shows the problem
        }
    }

    // ------------------------------------------------------------------ desktop

    installDesktop() {
        for (const icon of $$('.desktop-icon')) {
            icon.addEventListener('click', () => this.onDesktopAction(icon.dataset.action));
        }
        $('#start-btn').addEventListener('click', () => this.appsMenu.toggle());
        $('#tray-game').addEventListener('click', () => {
            if (this.phoneView) {
                this.openPhone();
                this.phoneView.toggleGameMode();
            } else {
                toast('Connect your phone first', 'warn');
            }
        });
        const audioButton = $('#tray-audio');
        const volumePanel = $('#volume-panel');
        const hideVolume = () => {
            volumePanel.classList.add('hidden');
            audioButton.setAttribute('aria-expanded', 'false');
        };
        audioButton.addEventListener('click', () => {
            const opening = volumePanel.classList.contains('hidden');
            volumePanel.classList.toggle('hidden', !opening);
            audioButton.setAttribute('aria-expanded', String(opening));
            if (opening) {
                this.appsMenu.hide();
                $('#volume-slider').focus();
            }
        });
        $('#volume-slider').addEventListener('input', (event) => {
            this.setVolume(Number(event.target.value));
            if (this.muted && this.volume > 0) this.toggleMute();
        });
        $('#volume-mute').addEventListener('click', () => this.toggleMute());
        document.addEventListener('pointerdown', (event) => {
            if (!volumePanel.contains(event.target) && !audioButton.contains(event.target)) hideVolume();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !volumePanel.classList.contains('hidden')) {
                event.preventDefault();
                event.stopPropagation();
                hideVolume();
                audioButton.focus();
            }
        });
        $('#tray-ping').addEventListener('click', () => this.openConnect());
        $('#tray-battery').addEventListener('click', () => this.openPhone());
        this.updateTray();
    }

    /** The Beam menu at the left of the top bar, and Beam over the whole screen (F11). */
    installBrandMenu() {
        this.fullscreen = new AppFullscreen();
        const button = $('#brand-menu-btn');
        const menu = $('#brand-menu');
        const fullscreenButton = $('#btn-beam-fullscreen');
        const setOpen = (open) => {
            menu.classList.toggle('hidden', !open);
            button.setAttribute('aria-expanded', String(open));
        };
        const update = (on) => {
            const label = on ? 'Exit fullscreen' : APP_NAME + ' fullscreen';
            fullscreenButton.title = label + ' (F11)';
            fullscreenButton.setAttribute('aria-label', label);
            fullscreenButton.classList.toggle('active', on);
            fullscreenButton.replaceChildren(icon(on ? 'beam-fullscreen-exit' : 'beam-fullscreen'));
            $('#brand-fullscreen-label').textContent = label;
        };
        this.fullscreen.onChange = update;
        button.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));
        fullscreenButton.addEventListener('click', () => this.fullscreen.toggle());
        menu.addEventListener('click', (event) => {
            const item = event.target.closest('[data-brand]');
            if (!item) {
                return;
            }
            setOpen(false);
            if (item.dataset.brand === 'fullscreen') {
                this.fullscreen.toggle();
            } else {
                this.onDesktopAction(item.dataset.brand);
            }
        });
        document.addEventListener('pointerdown', (event) => {
            if (!menu.contains(event.target) && !button.contains(event.target)) {
                setOpen(false);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                button.focus();
            }
        });
    }

    async setStartFullscreen(on) {
        try {
            this.config = await api.saveConfig({ startFullscreen: !!on });
        } catch (e) {
            toast('Could not save the settings: ' + e.message, 'error');
        }
    }

    onDesktopAction(action) {
        switch (action) {
            case 'phone':
                this.openPhone();
                break;
            case 'apps':
                this.appsMenu.toggle();
                break;
            case 'keymap':
                if (!this.phoneView) {
                    toast('Connect your phone and open a game first', 'warn');
                    return;
                }
                this.openPhone();
                this.phoneView.openEditor();
                break;
            case 'connect':
                this.openConnect();
                break;
            case 'settings':
                this.openSettings();
                break;
            case 'help':
                this.openHelp();
                break;
            case 'setup':
                this.openSetup();
                break;
            default:
                break;
        }
    }

    startClock() {
        const clock = $('#clock');
        const update = () => {
            clock.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            $('#desktop-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
        };
        update();
        setInterval(update, 5000);
    }

    updateTray() {
        const gameOn = this.phoneView && this.phoneView.gameMode;
        $('#tray-game').classList.toggle('on', !!gameOn);
        $('#tray-game-text').textContent = gameOn ? 'On' : 'Off';
        $('#tray-audio-text').textContent = this.muted ? 'Muted' : Math.round(this.volume * 100) + '%';
        $('#tray-audio-icon').replaceChildren(icon(this.muted ? 'muted' : 'volume'));
        $('#volume-value').textContent = Math.round(this.volume * 100) + '%';
        $('#volume-mute-icon').replaceChildren(icon(this.muted ? 'muted' : 'volume'));
        $('#volume-mute-label').textContent = this.muted ? 'Unmute' : 'Mute';
        $('#volume-mute').setAttribute('aria-pressed', String(this.muted));
        $('#volume-hint').textContent = this.muted || this.volume === 0 ? 'Sound is muted' : 'Sound is on';
        for (const control of $$('[data-volume-control]')) {
            control.value = String(this.volume);
            control.style.setProperty('--volume-progress', Math.round(this.volume * 100) + '%');
            control.setAttribute('aria-valuetext', Math.round(this.volume * 100) + '%');
        }
        $('#tray-ping-text').textContent = this.ping !== null ? this.ping + ' ms' : '--';
        const battery = this.session && this.session.battery;
        $('#tray-battery-text').textContent = battery ? battery.level + '%' : '--';
        $('#tray-battery').title = battery && battery.charging ? 'Phone battery · Charging' : 'Phone battery';

        const name = this.device ? (this.device.manufacturer + ' ' + this.device.model) : 'No phone connected';
        $('#start-device-name').textContent = name;
        const status = $('#start-device-status');
        const connected = this.session && this.session.state === 'running';
        $('#desktop-connection-status').textContent = connected ? name + ' · Connected' : 'Ready to connect';
        $('#desktop-status-dot').classList.toggle('connected', !!connected);
        if (this.session && this.session.state === 'running') {
            status.textContent = 'Connected' + (this.device ? ' · Android ' + this.device.release : '');
            status.className = 'tag ok';
        } else {
            status.textContent = 'Not connected';
            status.className = 'tag';
        }
    }

    // ------------------------------------------------------------------ windows

    isPhoneWindowActive() {
        return this.windows.active === 'phone';
    }

    openPhone() {
        if (!this.phoneView) {
            if (!this.session) {
                this.openConnect();
                toast('Connect your phone first', 'warn');
            }
            return;
        }
        if (this.windows.has('phone')) {
            this.windows.focus('phone');
            return;
        }
        const bounds = this.windows.getBounds();
        this.windows.open({
            id: 'phone',
            title: this.phoneTitle(),
            icon: '📱',
            width: Math.min(1280, bounds.width - 140),
            height: Math.min(800, bounds.height - 40),
            content: this.phoneView.element,
            overlayHeader: true,
            onResize: () => this.phoneView && this.phoneView.layout(),
            onClose: () => {
                if (this.phoneView && this.phoneView.gameMode) {
                    this.phoneView.toggleGameMode(false);
                }
                this.phoneApps.closeCurrent();
                // Other dock apps continue sharing this phone connection.
                return true;
            },
        });
        setTimeout(() => {
            if (this.phoneView) {
                this.phoneView.fitWindow();
                this.phoneView.layout();
            }
        }, 0);
    }

    phoneTitle() {
        const model = this.device ? this.device.model : 'Phone';
        const app = this.foreground ? (this.appLabel(this.foreground.package) || this.foreground.package) : '';
        return model + (app ? ' — ' + app : '');
    }

    openConnect() {
        if (!this.connectView) {
            this.connectView = new ConnectView(this);
        }
        if (!this.windows.has('connect')) {
            this.windows.open({
                id: 'connect',
                title: 'Connect a phone',
                icon: '📶',
                width: 640,
                height: 720,
                content: this.connectView.element,
                onClose: () => {
                    this.connectView.stopPolling();
                    return true;
                },
            });
        } else {
            this.windows.focus('connect');
        }
        this.connectView.startPolling();
    }

    openSettings() {
        if (this.windows.has('settings')) {
            this.windows.focus('settings');
            return;
        }
        const view = new SettingsView(this);
        this.windows.open({ id: 'settings', title: 'Settings', icon: '⚙️', width: 640, height: 720, content: view.element });
    }

    openHelp() {
        if (this.windows.has('help')) {
            this.windows.focus('help');
            return;
        }
        this.windows.open({ id: 'help', title: 'Help', icon: '❔', width: 640, height: 700, content: createHelpView(() => this.openSetup()) });
    }

    openSetup() {
        if (this.windows.has('setup')) {
            this.windows.focus('setup');
            return;
        }
        const view = new SetupView(this);
        this.windows.open({
            id: 'setup',
            title: 'Set up your phone',
            icon: '📱',
            width: 680,
            height: 640,
            content: view.element,
            onClose: () => {
                view.stopPolling();
                return true;
            },
        });
        view.startPolling();
    }

    // ------------------------------------------------------------------ session

    currentSerial() {
        return this.session && this.session.state === 'running' ? this.session.serial : null;
    }

    async updateSessionConfig(session) {
        this.config.session = session;
        try {
            this.config = await api.saveConfig({ session });
        } catch (e) {
            toast('Could not save the settings: ' + e.message, 'error');
        }
    }

    async startSession(serial, { quiet = false } = {}) {
        if (this.starting) {
            return false;
        }
        this.starting = true;
        this.lastSerial = serial;
        if (this.connectView) {
            this.connectView.setBusy(true);
        }
        this.detach();
        this.ensurePhoneView();
        this.phoneView.onStreamStarting();
        this.openPhone();
        try {
            const { session } = await api.startSession(serial, this.config.session);
            this.attach(session);
            if (this.windows.has('connect')) {
                this.windows.close('connect');
            }
            return true;
        } catch (e) {
            this.phoneView.onStreamStopped(e.message);
            if (!quiet) {
                toast('Could not start: ' + e.message, 'error', 10000);
                this.openConnect();
            }
            return false;
        } finally {
            this.starting = false;
            if (this.connectView) {
                this.connectView.setBusy(false);
            }
        }
    }

    /** Manual reconnection (button on the phone window). */
    async reconnect() {
        const serial = this.lastSerial || this.config.lastDevice;
        if (!serial) {
            this.openConnect();
            return;
        }
        await this.autoReconnect(serial, 3);
    }

    /**
     * After an unexpected disconnection (Wi-Fi hiccup...): wait for the phone to be back in adb, then restart.
     */
    async autoReconnect(serial, attempts = 6) {
        if (this.reconnecting) {
            return;
        }
        this.reconnecting = true;
        try {
            for (let attempt = 1; attempt <= attempts && !this.session; ++attempt) {
                this.phoneView.showMessage('Reconnecting...', 'Attempt ' + attempt + ' of ' + attempts, true);
                await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1000 : 3000));
                let devices = [];
                try {
                    devices = (await api.devices()).devices;
                } catch (e) {
                    continue;
                }
                let device = devices.find((d) => d.serial === serial && d.state === 'device');
                if (!device && /:\d+$/.test(serial)) {
                    // wireless device identified by IP:port: ask adb to reconnect
                    await api.connect(serial).catch(() => {});
                    devices = (await api.devices().catch(() => ({ devices: [] }))).devices;
                    device = devices.find((d) => d.serial === serial && d.state === 'device');
                }
                if (!device) {
                    continue;
                }
                if (await this.startSession(serial, { quiet: true })) {
                    toast('Reconnected', 'ok');
                    return;
                }
            }
            if (!this.session) {
                this.phoneView.onStreamStopped('The phone is not reachable. Check Wi-Fi and that "Wireless debugging" is on.');
            }
        } finally {
            this.reconnecting = false;
        }
    }

    async stopSession() {
        if (!this.session) {
            return;
        }
        const id = this.session.id;
        this.detach();
        try {
            await api.stopSession(id);
        } catch (e) {
            // ignore
        }
        if (this.phoneView) {
            this.phoneView.onStreamStopped('Disconnected.');
        }
        this.updateTray();
        this.openConnect();
    }

    ensurePhoneView() {
        if (!this.phoneView) {
            this.phoneView = new PhoneView(this);
        }
    }

    attach(session) {
        this.session = session;
        this.lastSerial = session.serial;
        this.lastStopReason = null;
        this.device = session.device || this.device;
        this.foreground = session.foreground || null;
        this.phoneApps.attach(session);
        this.ensurePhoneView();
        this.phoneView.onStreamStarting();
        this.openPhone();

        const conn = new StreamConnection(session.id, {
            onOpen: () => {},
            onClose: (reason) => {
                if (this.conn !== conn) {
                    return;
                }
                this.conn = null;
                this.session = null;
                this.foreground = null;
                this.phoneApps.clear();
                this.stats = {};
                this.ping = null;
                this.updateTray();
                const stopReason = this.lastStopReason || reason;
                const unexpected = ['server-exited', 'video-closed', 'control-closed'].includes(stopReason);
                if (unexpected) {
                    this.autoReconnect(session.serial);
                } else {
                    this.phoneView.onStreamStopped(reason === 'connection-lost' ? 'Lost the connection to the ' + APP_NAME + ' server.' : 'The session has ended.');
                }
            },
            onJson: (msg) => this.onJson(msg),
            onVideo: (type, pts, payload) => this.onVideo(type, pts, payload),
            onAudio: (type, pts, buffer) => this.onAudio(type, pts, buffer),
        });
        this.conn = conn;
        conn.connect();
        this.updateTray();
    }

    detach() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.phoneView && this.phoneView.gameMode) {
            this.phoneView.toggleGameMode(false);
        }
        this.session = null;
        this.foreground = null;
        this.phoneApps.clear();
        this.appsMenu.apps = [];
        this.appsMenu.serial = null;
        this.ping = null;
        this.stats = {};
    }

    send(msg) {
        if (this.conn) {
            this.conn.send(msg);
        }
    }

    onJson(msg) {
        switch (msg.type) {
            case 'session':
                this.session = msg.session;
                this.device = msg.session.device || this.device;
                this.updateTray();
                if (this.phoneView) {
                    this.phoneView.updateButtons();
                }
                break;
            case 'event':
                this.onDeviceEvent(msg.event);
                break;
            case 'stats':
                this.stats = msg.stats;
                break;
            case 'battery':
                if (this.session) {
                    this.session.battery = msg.battery;
                }
                this.updateTray();
                break;
            case 'clipboard':
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(msg.text).then(
                        () => toast('Copied from the phone', 'ok', 1500),
                        () => toast('The browser did not allow copying', 'warn'));
                }
                break;
            case 'stopped':
                this.lastStopReason = msg.reason;
                if (msg.reason === 'idle') {
                    toast('The session was stopped because no window was open.', 'warn', 8000);
                } else if (msg.reason && !['user', 'restart', 'shutdown'].includes(msg.reason)) {
                    toast('Lost the connection to the phone. Trying again...', 'warn', 5000);
                }
                break;
            default:
                break;
        }
    }

    onDeviceEvent(event) {
        switch (event.event) {
            case 'hello':
                this.device = event;
                this.updateTray();
                // app names (window title, key mapping) and icons for the start menu
                this.appsMenu.load(false).then(() => {
                    const win = this.windows.get('phone');
                    if (win) {
                        win.setTitle(this.phoneTitle());
                    }
                });
                break;
            case 'foreground': {
                const pkg = event.package || null;
                const changed = !this.foreground || this.foreground.package !== pkg;
                this.foreground = pkg ? { package: pkg, component: event.component } : null;
                this.phoneApps.onForeground(pkg);
                if (changed && this.phoneView) {
                    this.phoneView.onForegroundChanged(pkg);
                }
                const win = this.windows.get('phone');
                if (win) {
                    win.setTitle(this.phoneTitle());
                }
                break;
            }
            case 'screen':
                if (this.session && event.ok) {
                    this.session.screenOn = event.on;
                }
                if (!event.ok) {
                    toast('The phone did not allow changing the screen', 'warn');
                }
                if (this.phoneView) {
                    this.phoneView.updateButtons();
                }
                break;
            case 'pong':
                this.ping = Math.max(0, Math.round(performance.now() - Number(event.payload)));
                this.updateTray();
                break;
            case 'audio_error':
                toast('Sound is not available: ' + event.message, 'warn', 6000);
                break;
            case 'error':
                toast('Phone: ' + event.message, 'error', 8000);
                break;
            case 'app_started':
                if (!event.ok) {
                    toast('The app did not start', 'warn');
                }
                break;
            default:
                break;
        }
    }

    onVideo(type, pts, payload) {
        if (!this.phoneView) {
            return;
        }
        if (type === PACKET_SESSION) {
            const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const codec = view.getUint32(0) === CODEC_H265 ? 'h265' : 'h264';
            const width = view.getUint32(4);
            const height = view.getUint32(8);
            this.videoDisplayId = payload.byteLength >= 20 ? view.getUint32(16) : 0;
            this.phoneView.onSessionPacket(codec, width, height);
            return;
        }
        this.phoneView.onVideoPacket(type, pts, payload);
    }

    onAudio(type, pts, buffer) {
        if (type === PACKET_SESSION) {
            const view = new DataView(buffer, 10);
            const sampleRate = view.getUint32(4);
            const channels = view.getUint32(8);
            this.audio.init(sampleRate, channels).then(() => {
                if (this.audio.isSuspended()) {
                    this.showAudioHint();
                }
            }).catch((e) => toast('Sound: ' + e.message, 'warn'));
            return;
        }
        this.audio.push(buffer.slice(10));
    }

    showAudioHint() {
        if (this.audioHintShown) {
            return;
        }
        this.audioHintShown = true;
        toast('Click anywhere to hear the phone', 'info', 5000);
    }

    resumeAudio() {
        this.audio.resume();
    }

    sendPing() {
        if (this.conn && this.conn.isOpen()) {
            this.send({ t: 'ping', payload: Math.round(performance.now()) });
        }
    }

    // ------------------------------------------------------------------ misc (used by the views)

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('beam.muted', this.muted ? '1' : '0');
        this.audio.setMuted(this.muted);
        this.resumeAudio();
        this.updateTray();
        if (this.phoneView) {
            this.phoneView.updateButtons();
        }
    }

    setVolume(volume) {
        if (!Number.isFinite(volume)) return;
        volume = Math.min(1, Math.max(0, volume));
        this.volume = volume;
        localStorage.setItem('beam.volume', String(volume));
        this.audio.setVolume(volume);
        this.updateTray();
    }

    setAudioLatency(ms) {
        this.audioLatency = ms;
        localStorage.setItem('beam.audioLatency', String(ms));
        this.audio.setTargetLatency(ms);
    }

    togglePhoneScreen() {
        if (this.phoneView) {
            this.phoneView.toggleScreen();
        }
    }

    foregroundPackage() {
        return this.foreground ? this.foreground.package : null;
    }

    appLabel(pkg) {
        return pkg ? this.appsMenu.labelOf(pkg) : null;
    }

    onGameModeChanged() {
        this.updateTray();
    }

    async onProfilesChanged() {
        try {
            const data = await api.profiles();
            this.profiles = data.profiles;
            this.presets = data.presets;
        } catch (e) {
            // ignore
        }
    }
}

const app = new App();
window.beam = app;
app.init();
