/**
 * Settings window: stream quality, audio, phone behavior, display mode, diagnostics.
 */
import { h, toast } from '../util/dom.js';
import { api } from '../api.js';
import { APP_NAME } from '../brand.js';

function select(options, value) {
    const el = h('select.input', options.map(([v, label]) => h('option', { value: String(v) }, label)));
    el.value = String(value);
    if (el.value !== String(value)) {
        el.appendChild(h('option', { value: String(value) }, String(value)));
        el.value = String(value);
    }
    return el;
}

function checkbox(checked) {
    return h('input', { type: 'checkbox', checked: !!checked });
}

export class SettingsView {
    constructor(app) {
        this.app = app;
        this.build();
    }

    build() {
        const o = this.app.config.session;
        const encoders = (this.app.device && this.app.device.encoders) || [];

        this.maxSize = select([[1280, '1280 (faster)'], [1600, '1600'], [1920, '1920 (recommended)'], [2400, '2400'], [0, 'Full phone resolution']], o.maxSize);
        this.bitRate = select([[4000000, '4 Mb/s'], [8000000, '8 Mb/s'], [12000000, '12 Mb/s (recommended)'], [16000000, '16 Mb/s'],
            [24000000, '24 Mb/s'], [32000000, '32 Mb/s'], [50000000, '50 Mb/s']], o.bitRate);
        this.maxFps = select([[30, '30'], [60, '60 (recommended)'], [90, '90'], [120, '120']], o.maxFps);
        this.codec = select([['h264', 'H.264 (most compatible)'], ['h265', 'H.265 / HEVC (less data, if the PC supports it)']], o.codec);
        this.encoder = select([['', 'Automatic'], ...encoders.map((name) => [name, name])], o.encoderName || '');
        this.audio = checkbox(o.audio !== false);
        this.screenOff = checkbox(o.turnScreenOff);
        this.stayAwake = checkbox(o.stayAwake !== false);
        this.mode = select([['mirror', 'Mirror the phone screen (for games)'], ['desktop', 'Separate desktop screen (experimental)']],
            o.newDisplay ? 'desktop' : 'mirror');
        this.desktopSize = select([['1920x1080/240', '1920×1080'], ['1600x900/220', '1600×900'], ['2560x1440/320', '2560×1440'],
            ['1280x720/180', '1280×720']], o.newDisplay || '1920x1080/240');
        this.audioLatency = select([[40, '40 ms (lowest latency)'], [60, '60 ms (recommended)'], [100, '100 ms'], [160, '160 ms (most stable)']],
            this.app.audioLatency);
        this.volume = h('input.volume-slider', { type: 'range', 'data-volume-control': '', 'aria-label': 'Volume', min: '0', max: '1', step: '0.01', value: String(this.app.volume) });
        this.volume.style.setProperty('--volume-progress', Math.round(this.app.volume * 100) + '%');
        this.volume.addEventListener('input', () => this.app.setVolume(parseFloat(this.volume.value)));
        this.audioLatency.addEventListener('change', () => this.app.setAudioLatency(parseInt(this.audioLatency.value, 10)));

        const desktopRow = h('div.field', h('label', 'Desktop screen size'), this.desktopSize);
        const updateMode = () => desktopRow.classList.toggle('hidden', this.mode.value !== 'desktop');
        this.mode.addEventListener('change', updateMode);
        updateMode();

        this.startFullscreen = checkbox(this.app.config.startFullscreen);
        this.startFullscreen.addEventListener('change', () => this.app.setStartFullscreen(this.startFullscreen.checked));

        this.logs = h('div.logs.hidden');
        this.infoEl = h('div.small.muted');

        this.element = h('div.view',
            h('div.view-intro', h('div.view-intro-icon', '⚙️'),
                h('div', h('h2', 'Made to fit you.'), h('p', 'Picture, sound and controls the way you like them.'))),
            h('div.section',
                h('h3', '🎞️ Picture'),
                h('div.row',
                    h('div.field', h('label', 'Resolution (long side)'), this.maxSize),
                    h('div.field', h('label', 'Bitrate'), this.bitRate),
                    h('div.field', h('label', 'Max FPS'), this.maxFps)),
                h('div.row',
                    h('div.field', h('label', 'Codec'), this.codec),
                    h('div.field', h('label', 'Phone encoder'), this.encoder)),
                h('p.small.muted', 'If the picture stutters, lower the bitrate or resolution. If it is blurry, raise the bitrate. Use 5 GHz Wi-Fi for the lowest latency.')),
            h('div.section',
                h('h3', '🔊 Sound'),
                h('label.check', this.audio, h('span.check-text', 'Stream sound from the phone', h('small', 'Android 12+. The phone is muted meanwhile.'))),
                h('div.row',
                    h('div.field', h('label', 'Buffer (audio delay)'), this.audioLatency),
                    h('div.field', h('label', 'Volume'), this.volume))),
            h('div.section',
                h('h3', '📱 Phone'),
                h('label.check', this.screenOff, h('span.check-text', 'Turn the phone screen off when connecting',
                    h('small', 'The game keeps running; the screen comes back when you disconnect (or press the power button).'))),
                h('label.check', this.stayAwake, h('span.check-text', 'Keep the phone awake while connected')),
                h('div.row',
                    h('div.field', h('label', 'Mode'), this.mode),
                    desktopRow),
                h('p.small.muted', 'Separate desktop creates an extra (virtual) screen on the phone; apps from the Start menu open on it. ',
                    'On a Pixel it works best with Developer options → "Enable freeform windows" and "Force desktop mode".')),
            h('div.section',
                h('h3', '🖥️ Display'),
                h('label.check', this.startFullscreen, h('span.check-text', 'Start in fullscreen',
                    h('small', APP_NAME + ' opens over the whole screen (F11 to exit). Fullscreen for a single app is separate: F10.')))),
            h('div.row',
                h('button.btn.btn-primary.btn-lg', { onclick: () => this.apply(true) }, 'Save and reconnect'),
                h('button.btn.btn-lg', { onclick: () => this.apply(false) }, 'Save only')),
            h('div.section',
                h('div.section-title', h('h3', '🧰 Diagnostics'),
                    h('button.btn.btn-sm', { onclick: () => this.toggleLogs() }, 'Show log')),
                this.infoEl,
                this.logs));
        this.loadInfo();
    }

    collect() {
        return {
            maxSize: parseInt(this.maxSize.value, 10),
            bitRate: parseInt(this.bitRate.value, 10),
            maxFps: parseInt(this.maxFps.value, 10),
            codec: this.codec.value,
            encoderName: this.encoder.value,
            audio: this.audio.checked,
            turnScreenOff: this.screenOff.checked,
            stayAwake: this.stayAwake.checked,
            newDisplay: this.mode.value === 'desktop' ? this.desktopSize.value : '',
        };
    }

    async apply(restart) {
        const session = Object.assign({}, this.app.config.session, this.collect());
        await this.app.updateSessionConfig(session);
        toast('Settings saved', 'ok', 2500);
        if (restart && this.app.session) {
            this.app.startSession(this.app.session.serial);
        }
    }

    async loadInfo() {
        try {
            const info = this.app.info || await api.info();
            this.infoEl.replaceChildren(
                h('div', APP_NAME + ' ', info.version, ' · server ', info.serverVersion),
                h('div', 'adb: ', h('code', info.adb), info.adbVersion ? ' (' + info.adbVersion + ')' : ' — ', info.adbVersion ? '' : h('b', 'not found!')),
                h('div', 'Data (profiles, settings): ', h('code', info.dataDir)));
        } catch (e) {
            this.infoEl.textContent = e.message;
        }
    }

    async toggleLogs() {
        if (!this.logs.classList.contains('hidden')) {
            this.logs.classList.add('hidden');
            return;
        }
        const data = await api.sessionLogs(this.app.session ? this.app.session.id : '');
        const lines = data.logs.length ? data.logs : data.server;
        this.logs.textContent = lines.join('\n') || '(empty)';
        this.logs.classList.remove('hidden');
        this.logs.scrollTop = this.logs.scrollHeight;
    }
}
