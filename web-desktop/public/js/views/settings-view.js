/**
 * Settings window: stream quality, audio, phone behavior, display mode, diagnostics.
 */
import { h, toast } from '../util/dom.js';
import { api } from '../api.js';

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

        this.maxSize = select([[1280, '1280 (brže)'], [1600, '1600'], [1920, '1920 (preporučeno)'], [2400, '2400'], [0, 'Puna rezolucija telefona']], o.maxSize);
        this.bitRate = select([[4000000, '4 Mb/s'], [8000000, '8 Mb/s'], [12000000, '12 Mb/s (preporučeno)'], [16000000, '16 Mb/s'],
            [24000000, '24 Mb/s'], [32000000, '32 Mb/s'], [50000000, '50 Mb/s']], o.bitRate);
        this.maxFps = select([[30, '30'], [60, '60 (preporučeno)'], [90, '90'], [120, '120']], o.maxFps);
        this.codec = select([['h264', 'H.264 (najkompatibilnije)'], ['h265', 'H.265 / HEVC (manje podataka, ako PC podržava)']], o.codec);
        this.encoder = select([['', 'Automatski'], ...encoders.map((name) => [name, name])], o.encoderName || '');
        this.audio = checkbox(o.audio !== false);
        this.screenOff = checkbox(o.turnScreenOff);
        this.stayAwake = checkbox(o.stayAwake !== false);
        this.mode = select([['mirror', 'Ogledalo ekrana telefona (za igre)'], ['desktop', 'Poseban desktop ekran (eksperimentalno)']],
            o.newDisplay ? 'desktop' : 'mirror');
        this.desktopSize = select([['1920x1080/240', '1920×1080'], ['1600x900/220', '1600×900'], ['2560x1440/320', '2560×1440'],
            ['1280x720/180', '1280×720']], o.newDisplay || '1920x1080/240');
        this.audioLatency = select([[40, '40 ms (najmanje kašnjenje)'], [60, '60 ms (preporučeno)'], [100, '100 ms'], [160, '160 ms (najstabilnije)']],
            this.app.audioLatency);
        this.volume = h('input.volume-slider', { type: 'range', 'data-volume-control': '', 'aria-label': 'Jačina zvuka', min: '0', max: '1', step: '0.01', value: String(this.app.volume) });
        this.volume.style.setProperty('--volume-progress', Math.round(this.app.volume * 100) + '%');
        this.volume.addEventListener('input', () => this.app.setVolume(parseFloat(this.volume.value)));
        this.audioLatency.addEventListener('change', () => this.app.setAudioLatency(parseInt(this.audioLatency.value, 10)));

        const desktopRow = h('div.field', h('label', 'Veličina desktop ekrana'), this.desktopSize);
        const updateMode = () => desktopRow.classList.toggle('hidden', this.mode.value !== 'desktop');
        this.mode.addEventListener('change', updateMode);
        updateMode();

        this.startFullscreen = checkbox(this.app.config.startFullscreen);
        this.startFullscreen.addEventListener('change', () => this.app.setStartFullscreen(this.startFullscreen.checked));

        this.logs = h('div.logs.hidden');
        this.infoEl = h('div.small.muted');

        this.element = h('div.view',
            h('div.view-intro', h('div.view-intro-icon', '⚙️'),
                h('div', h('h2', 'Po tvojoj mjeri.'), h('p', 'Slika, zvuk i kontrole za tvoj način rada.'))),
            h('div.section',
                h('h3', '🎞️ Slika'),
                h('div.row',
                    h('div.field', h('label', 'Rezolucija (duža strana)'), this.maxSize),
                    h('div.field', h('label', 'Protok (bitrate)'), this.bitRate),
                    h('div.field', h('label', 'Maks. FPS'), this.maxFps)),
                h('div.row',
                    h('div.field', h('label', 'Kodek'), this.codec),
                    h('div.field', h('label', 'Enkoder na telefonu'), this.encoder)),
                h('p.small.muted', 'Ako slika seče: smanji protok ili rezoluciju. Ako je mutna: povećaj protok. Za najmanje kašnjenje koristi Wi-Fi 5 GHz.')),
            h('div.section',
                h('h3', '🔊 Zvuk'),
                h('label.check', this.audio, h('span.check-text', 'Prenos zvuka sa telefona', h('small', 'Android 12+. Dok traje, telefon je nem.'))),
                h('div.row',
                    h('div.field', h('label', 'Bafer (kašnjenje zvuka)'), this.audioLatency),
                    h('div.field', h('label', 'Jačina'), this.volume))),
            h('div.section',
                h('h3', '📱 Telefon'),
                h('label.check', this.screenOff, h('span.check-text', 'Ugasi ekran telefona pri povezivanju',
                    h('small', 'Igra radi i dalje; ekran se vraća kad prekineš vezu (ili pritisni dugme za napajanje).'))),
                h('label.check', this.stayAwake, h('span.check-text', 'Ne dozvoli telefonu da zaspi dok je povezan')),
                h('div.row',
                    h('div.field', h('label', 'Režim'), this.mode),
                    desktopRow),
                h('p.small.muted', 'Poseban desktop pravi dodatni (virtuelni) ekran na telefonu; aplikacije iz menija Start se otvaraju na njemu. ',
                    'Na Pixel-u najbolje radi uz Opcije za programere → „Omogući prozore promenljive veličine“ i „Nametni režim računara“.')),
            h('div.section',
                h('h3', '🖥️ Display'),
                h('label.check', this.startFullscreen, h('span.check-text', 'Start in fullscreen',
                    h('small', 'Wi-Dex opens over the whole screen (F11 to exit). Fullscreen for a single app is separate: F10.')))),
            h('div.row',
                h('button.btn.btn-primary.btn-lg', { onclick: () => this.apply(true) }, 'Sačuvaj i ponovo poveži'),
                h('button.btn.btn-lg', { onclick: () => this.apply(false) }, 'Samo sačuvaj')),
            h('div.section',
                h('div.section-title', h('h3', '🧰 Dijagnostika'),
                    h('button.btn.btn-sm', { onclick: () => this.toggleLogs() }, 'Prikaži log')),
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
        toast('Podešavanja sačuvana', 'ok', 2500);
        if (restart && this.app.session) {
            this.app.startSession(this.app.session.serial);
        }
    }

    async loadInfo() {
        try {
            const info = this.app.info || await api.info();
            this.infoEl.replaceChildren(
                h('div', 'Wi-Dex ', info.version, ' · server ', info.serverVersion),
                h('div', 'adb: ', h('code', info.adb), info.adbVersion ? ' (' + info.adbVersion + ')' : ' — ', info.adbVersion ? '' : h('b', 'nije pronađen!')),
                h('div', 'Podaci (profili, podešavanja): ', h('code', info.dataDir)));
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
        this.logs.textContent = lines.join('\n') || '(prazno)';
        this.logs.classList.remove('hidden');
        this.logs.scrollTop = this.logs.scrollHeight;
    }
}
