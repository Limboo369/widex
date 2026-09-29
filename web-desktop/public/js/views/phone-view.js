/**
 * Phone window: video stream, toolbar, desktop input (mouse = finger) and game mode (key mapping).
 */
import { h, toast, formatBitrate, isTextInput } from '../util/dom.js';
import { icon, iconText } from '../ui/icons.js';
import { VideoPlayer } from '../stream/video.js';
import { androidKeycode, metaState, keyName, AKEY } from '../input/keycodes.js';
import { GameMapper } from '../input/game-mapper.js';
import { KeymapEditor, renderMarkers } from '../input/keymap-editor.js';
import { api } from '../api.js';

const MOUSE_POINTER_ID = 1;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class PhoneView {
    constructor(app) {
        this.app = app;
        this.gameMode = false;
        this.cursorMode = false;
        this.pointerLocked = false;
        this.wantPointerLock = false;
        this.showMarkers = localStorage.getItem('widex.showMarkers') !== '0';
        this.profile = null;
        this.profilePackage = null;
        this.pressed = new Set();
        this.mouseDown = false;
        this.keysDown = new Set();
        this.clipboardSeq = 1;

        this.build();

        this.player = new VideoPlayer(this.canvas, {
            onSize: () => this.layout(),
            onRequestKeyframe: () => this.app.send({ t: 'keyframe' }),
            onError: (message) => this.showMessage('⚠️ Problem sa videom', message),
            onFrame: () => {
                this.app.phoneApps?.onVideoFrame();
                if (!this.firstFrameShown) {
                    this.firstFrameShown = true;
                    this.hideMessage();
                }
            },
        });

        this.mapper = new GameMapper({
            send: (msg) => this.app.send(msg),
            getVideoSize: () => ({ width: this.player.width, height: this.player.height }),
            onPressedChange: (index, pressed) => {
                if (pressed) {
                    this.pressed.add(index);
                } else {
                    this.pressed.delete(index);
                }
                const el = this.layer.querySelector('.km-control[data-index="' + index + '"]');
                if (el) {
                    el.classList.toggle('pressed', pressed);
                }
            },
        });

        this.editor = new KeymapEditor({
            stage: this.stage,
            layer: this.layer,
            presets: this.app.presets,
            onSave: (profile) => this.saveProfile(profile),
            onClose: () => {
                this.renderMarkers();
                this.updateHud();
            },
        });

        this.installInput();
        this.statsTimer = setInterval(() => this.updateStats(), 1000);
        this.showMessage('Povezivanje...', 'Čekam sliku sa telefona.', true);
    }

    // ------------------------------------------------------------------ DOM

    build() {
        const tool = (icon, label, title, onclick) => {
            const button = h('button.tool-btn', { title, onclick }, icon, label ? h('span', label) : null);
            return button;
        };
        this.btnGame = tool('🎮', 'Igra', 'Režim igre: tastatura i miš kao kontrole (F8)', () => this.toggleGameMode());
        this.btnKeymap = tool('⌨️', 'Mapiranje', 'Podesi tastere za ovu igru (F9)', () => this.openEditor());
        this.btnMarkers = tool('👁', '', 'Prikaži/sakrij oznake tastera preko igre', () => this.toggleMarkers());
        this.btnScreen = tool('💡', '', 'Ugasi/upali ekran telefona (igra nastavlja da radi)', () => this.toggleScreen());
        this.btnAudio = tool('🔊', '', 'Zvuk sa telefona', () => this.app.toggleMute());
        this.btnFullscreen = tool('⛶', '', 'Ceo ekran (F10)', () => this.toggleFullscreen());
        this.statsEl = h('div.stream-stats');

        this.toolbar = h('div.phone-toolbar',
            tool('◀', '', 'Nazad (desni klik)', () => this.pressKey(AKEY.BACK)),
            tool('●', '', 'Početni ekran (srednji klik)', () => this.pressKey(AKEY.HOME)),
            tool('▢', '', 'Nedavne aplikacije', () => this.pressKey(AKEY.APP_SWITCH)),
            tool('🔔', '', 'Obaveštenja', () => this.app.send({ t: 'notifications' })),
            tool('⟳', '', 'Rotiraj telefon', () => this.app.send({ t: 'rotate' })),
            this.btnScreen,
            this.btnAudio,
            h('div.sep'),
            this.btnGame,
            this.btnKeymap,
            this.btnMarkers,
            h('div.sep'),
            this.btnFullscreen,
            this.statsEl);

        this.canvas = h('canvas.phone-canvas', { width: 1280, height: 720 });
        this.layer = h('div.keymap-layer');
        this.hud = h('div.game-hud.hidden');
        this.messageTitle = h('h3');
        this.messageText = h('p');
        this.messageSpinner = h('div.spinner');
        this.messageActions = h('div.row', { style: { justifyContent: 'center' } });
        this.messageEl = h('div.stage-message', this.messageSpinner, this.messageTitle, this.messageText, this.messageActions);
        this.stage = h('div.phone-stage', { tabindex: '0' }, this.canvas, this.layer, this.hud, this.messageEl);
        this.element = h('div.phone-view', this.toolbar, this.stage);

        this.resizeObserver = new ResizeObserver(() => this.layout());
        this.resizeObserver.observe(this.stage);
        this.updateButtons();
    }

    /**
     * @param {Array} actions [{label, onClick, primary}]
     */
    showMessage(title, text, spinner = false, actions = []) {
        this.messageTitle.replaceChildren(iconText(title));
        this.messageText.textContent = text || '';
        this.messageSpinner.classList.toggle('hidden', !spinner);
        this.messageActions.textContent = '';
        for (const action of actions) {
            this.messageActions.appendChild(h('button.btn' + (action.primary ? '.btn-primary' : ''), { onclick: action.onClick }, action.label));
        }
        this.messageEl.classList.remove('hidden');
    }

    hideMessage() {
        this.messageEl.classList.add('hidden');
    }

    /** Rectangle of the video inside the canvas element (object-fit: contain), in client coordinates. */
    contentRect() {
        const r = this.canvas.getBoundingClientRect();
        const vw = this.canvas.width;
        const vh = this.canvas.height;
        const scale = Math.min(r.width / vw, r.height / vh) || 1;
        const width = vw * scale;
        const height = vh * scale;
        return { left: r.left + (r.width - width) / 2, top: r.top + (r.height - height) / 2, width, height };
    }

    layout() {
        const stageRect = this.stage.getBoundingClientRect();
        const rect = this.contentRect();
        Object.assign(this.layer.style, {
            left: (rect.left - stageRect.left) + 'px',
            top: (rect.top - stageRect.top) + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
        });
        if (this.editor && this.editor.isOpen) {
            this.editor.refresh();
        } else {
            this.renderMarkers();
        }
    }

    renderMarkers() {
        if (this.editor && this.editor.isOpen) {
            return;
        }
        if (this.gameMode && this.showMarkers && this.profile) {
            renderMarkers(this.layer, this.profile, { pressed: this.pressed });
        } else {
            this.layer.textContent = '';
        }
    }

    toVideo(e) {
        const rect = this.contentRect();
        const vw = this.player.width || this.canvas.width;
        const vh = this.player.height || this.canvas.height;
        const x = (e.clientX - rect.left) / rect.width * vw;
        const y = (e.clientY - rect.top) / rect.height * vh;
        return {
            x: clamp(x, 0, vw - 1),
            y: clamp(y, 0, vh - 1),
            inside: x >= 0 && y >= 0 && x < vw && y < vh,
            w: vw,
            h: vh,
        };
    }

    // ------------------------------------------------------------------ stream

    onSessionPacket(codec, width, height) {
        this.player.handleSession(codec, width, height);
        this.layout();
    }

    onVideoPacket(type, pts, payload) {
        if (type === 1) {
            this.player.handleConfig(payload);
        } else {
            this.player.handleFrame(type, pts, payload);
        }
    }

    onStreamStopped(reason) {
        if (this.gameMode) {
            this.toggleGameMode(false);
        }
        this.exitGameInput();
        this.firstFrameShown = false;
        this.showMessage('Veza sa telefonom je prekinuta', reason || '', false, [
            { label: '🔄 Poveži ponovo', primary: true, onClick: () => this.app.reconnect() },
            { label: '📶 Povezivanje', onClick: () => this.app.openConnect() },
        ]);
        this.updateButtons();
    }

    onStreamStarting() {
        this.firstFrameShown = false;
        this.showMessage('Povezivanje...', 'Čekam sliku sa telefona.', true);
    }

    updateStats() {
        const s = this.app.stats || {};
        const parts = [];
        parts.push('<b>' + this.player.getFps() + '</b> FPS');
        if (s.videoKbps !== undefined) {
            parts.push('<b>' + formatBitrate(s.videoKbps) + '</b>');
        }
        if (this.player.width) {
            parts.push(this.player.width + '×' + this.player.height);
        }
        if (this.app.ping !== null && this.app.ping !== undefined) {
            parts.push('ping <b>' + this.app.ping + '</b> ms');
        }
        this.statsEl.innerHTML = parts.join(' · ');
    }

    updateButtons() {
        this.btnGame.classList.toggle('active', this.gameMode);
        this.btnMarkers.classList.toggle('active', this.showMarkers);
        const screenOn = this.app.session ? this.app.session.screenOn !== false : true;
        this.btnScreen.classList.toggle('warn', !screenOn);
        this.btnScreen.title = screenOn ? 'Ugasi ekran telefona (igra nastavlja da radi)' : 'Upali ekran telefona';
        this.btnAudio.replaceChildren(icon(this.app.muted ? 'muted' : 'volume'));
    }

    // ------------------------------------------------------------------ commands

    pressKey(keycode) {
        this.app.send({ t: 'key', a: 'down', code: keycode });
        this.app.send({ t: 'key', a: 'up', code: keycode });
    }

    toggleScreen() {
        const on = this.app.session ? this.app.session.screenOn === false : false;
        this.app.send({ t: 'power', on });
    }

    toggleMarkers() {
        this.showMarkers = !this.showMarkers;
        localStorage.setItem('widex.showMarkers', this.showMarkers ? '1' : '0');
        this.renderMarkers();
        this.updateButtons();
    }

    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            return;
        }
        this.element.requestFullscreen({ navigationUI: 'hide' }).then(() => {
            // capture Esc, Ctrl+W... while in fullscreen (Chrome/Edge)
            if (navigator.keyboard && navigator.keyboard.lock) {
                navigator.keyboard.lock().catch(() => {});
            }
            this.stage.focus();
        }).catch((e) => toast('Ceo ekran nije dozvoljen: ' + e.message, 'warn'));
    }

    // ------------------------------------------------------------------ game mode

    async toggleGameMode(force) {
        const enable = force === undefined ? !this.gameMode : force;
        if (enable === this.gameMode) {
            return;
        }
        if (enable) {
            await this.ensureProfile();
            this.gameMode = true;
            this.cursorMode = !!(this.profile && this.profile.startInCursorMode);
            this.mapper.setProfile(this.profile);
            this.stage.classList.add('game-active');
            if (!this.cursorMode) {
                this.requestPointerLock();
            }
        } else {
            this.gameMode = false;
            this.exitGameInput();
            this.stage.classList.remove('game-active');
        }
        this.renderMarkers();
        this.updateHud();
        this.updateButtons();
        this.app.onGameModeChanged(this.gameMode);
    }

    exitGameInput() {
        this.mapper.releaseAll();
        this.cursorMode = false;
        this.wantPointerLock = false;
        if (document.pointerLockElement === this.stage) {
            document.exitPointerLock();
        }
        this.releaseDesktopInput();
    }

    requestPointerLock() {
        this.wantPointerLock = true;
        this.pointerLockAttempt = (this.pointerLockAttempt || 0) + 1;
        let promise;
        try {
            // raw mouse movement (no Windows acceleration), better for aiming
            promise = this.stage.requestPointerLock({ unadjustedMovement: true });
        } catch (e) {
            promise = null;
        }
        if (promise && promise.catch) {
            promise.catch(() => {
                try {
                    const fallback = this.stage.requestPointerLock();
                    if (fallback && fallback.catch) {
                        fallback.catch(() => {});
                    }
                } catch (e) {
                    // ignore
                }
            });
        }
    }

    setCursorMode(enabled) {
        if (!this.gameMode) {
            return;
        }
        this.cursorMode = enabled;
        this.mapper.releaseCamera();
        if (enabled) {
            this.wantPointerLock = false;
            if (document.pointerLockElement === this.stage) {
                document.exitPointerLock();
            }
        } else {
            this.releaseDesktopInput();
            this.requestPointerLock();
        }
        this.updateHud();
    }

    async ensureProfile() {
        const pkg = this.app.foregroundPackage();
        if (this.profile && this.profilePackage === pkg) {
            return;
        }
        await this.loadProfileFor(pkg);
    }

    async loadProfileFor(pkg) {
        const saved = new Set(this.app.profiles.map((p) => p.package));
        let profile = null;
        if (pkg && saved.has(pkg)) {
            profile = await api.profile(pkg);
        }
        if (!profile && saved.has('default')) {
            profile = await api.profile('default');
        }
        if (!profile) {
            const preset = this.app.presets.find((p) => p.id === 'fps') || this.app.presets[0];
            profile = preset ? JSON.parse(JSON.stringify(preset)) : { name: 'Prazan', controls: [] };
            profile.isPreset = true;
        }
        this.profile = profile;
        this.profilePackage = pkg;
        if (this.gameMode) {
            this.mapper.setProfile(profile);
            this.renderMarkers();
            this.updateHud();
        }
    }

    async onForegroundChanged(pkg) {
        if (this.editor.isOpen) {
            return;
        }
        if (this.gameMode && pkg && pkg !== this.profilePackage) {
            await this.loadProfileFor(pkg);
            toast('Profil tastera: ' + (this.profile.name || pkg), 'info', 2500);
        }
    }

    async openEditor() {
        if (this.editor.isOpen) {
            return;
        }
        if (!this.player.width) {
            toast('Sačekaj da se pojavi slika sa telefona', 'warn');
            return;
        }
        if (document.pointerLockElement === this.stage) {
            this.wantPointerLock = false;
            document.exitPointerLock();
        }
        this.mapper.releaseAll();
        await this.ensureProfile();
        const pkg = this.app.foregroundPackage();
        const label = this.app.appLabel(pkg) || pkg || 'podrazumevani profil';
        this.editor.open(this.profile, 'Mapiranje: ' + label);
        this.updateHud();
    }

    async saveProfile(profile) {
        const pkg = this.app.foregroundPackage() || 'default';
        delete profile.isPreset;
        const saved = await api.saveProfile(pkg, profile);
        this.profile = saved;
        this.profilePackage = this.app.foregroundPackage();
        this.mapper.setProfile(saved);
        this.app.onProfilesChanged();
    }

    updateHud() {
        const hud = this.hud;
        clearTimeout(this.hudTimer);
        hud.classList.remove('faded');
        if (!this.gameMode || this.editor.isOpen) {
            hud.classList.add('hidden');
            return;
        }
        hud.classList.remove('hidden');
        const cursorKey = keyName(this.mapper.getCursorKey());
        if (this.cursorMode) {
            hud.replaceChildren(iconText('🖱️ Kursor slobodan — pritisni ' + cursorKey + ' za povratak u igru'));
        } else if (!this.pointerLocked) {
            hud.replaceChildren(iconText('🎮 Klikni na sliku da miš kontroliše igru'));
        } else {
            hud.replaceChildren(iconText('🎮 ' + (this.profile ? this.profile.name : '') + ' — ' + cursorKey + ' kursor · F9 mapiranje · F8 izlaz'));
            this.hudTimer = setTimeout(() => hud.classList.add('faded'), 3500);
        }
    }

    // ------------------------------------------------------------------ input

    isActive() {
        if (this.editor.isOpen) {
            return false;
        }
        if (document.fullscreenElement === this.element || document.pointerLockElement === this.stage) {
            return true;
        }
        return this.app.isPhoneWindowActive();
    }

    installInput() {
        const stage = this.stage;

        stage.addEventListener('contextmenu', (e) => e.preventDefault());

        // Mouse buttons: "mousedown"/"mouseup" are fired for every button, even when another one is already
        // pressed (pointer events report such "chorded" presses as pointermove): needed for fire + aim.
        stage.addEventListener('mousedown', (e) => {
            if (this.editor.isOpen || e.target.closest('.keymap-toolbar, .keymap-panel')) {
                return;
            }
            e.preventDefault();
            if (this.gameMode && !this.cursorMode) {
                if (this.pointerLocked) {
                    this.mapper.keyDown('Mouse' + e.button);
                }
                return;
            }
            if (e.button !== 0) {
                this.desktopButton(e.button, true);
            }
        });
        stage.addEventListener('mouseup', (e) => {
            if (e.button === 3 || e.button === 4) {
                // must not navigate back/forward in the browser
                e.preventDefault();
            }
            if (this.editor.isOpen) {
                return;
            }
            if (this.gameMode && !this.cursorMode) {
                if (this.pointerLocked) {
                    this.mapper.keyUp('Mouse' + e.button);
                }
                return;
            }
            if (e.button !== 0) {
                this.desktopButton(e.button, false);
            }
        });

        stage.addEventListener('pointerdown', (e) => {
            if (this.editor.isOpen || e.target.closest('.keymap-toolbar, .keymap-panel')) {
                return;
            }
            stage.focus();
            this.app.resumeAudio();
            if (this.gameMode && !this.cursorMode) {
                if (!this.pointerLocked) {
                    this.requestPointerLock();
                }
                return;
            }
            if (e.button === 0) {
                this.desktopPointerDown(e);
            }
        });

        stage.addEventListener('pointermove', (e) => {
            if (this.editor.isOpen) {
                return;
            }
            if (this.pointerLocked) {
                if (this.gameMode && !this.cursorMode) {
                    // pointerrawupdate would give more events, but mousemove is enough (coalesced per frame)
                    this.mapper.mouseMove(e.movementX, e.movementY);
                }
                return;
            }
            if (document.fullscreenElement === this.element) {
                const reveal = e.clientY < 12 || e.target.closest('.phone-toolbar');
                this.toolbar.classList.toggle('reveal', !!reveal);
            }
            if (this.mouseDown) {
                const p = this.toVideo(e);
                this.app.send({ t: 'touch', a: 'move', id: MOUSE_POINTER_ID, x: p.x, y: p.y, w: p.w, h: p.h });
            }
        });

        const pointerUp = (e) => {
            if (this.editor.isOpen) {
                return;
            }
            if (this.gameMode && !this.cursorMode) {
                return;
            }
            if (e.button === 0 || e.type === 'pointercancel') {
                this.desktopPointerUp(e);
            }
        };
        stage.addEventListener('pointerup', pointerUp);
        stage.addEventListener('pointercancel', pointerUp);
        stage.addEventListener('auxclick', (e) => e.preventDefault());

        stage.addEventListener('wheel', (e) => {
            if (this.editor.isOpen) {
                return;
            }
            e.preventDefault();
            if (this.gameMode && !this.cursorMode && this.pointerLocked) {
                this.mapper.wheel(e.deltaY);
                return;
            }
            const p = this.toVideo(e);
            let factor = 1 / 100;
            if (e.deltaMode === 1) {
                factor = 1 / 3;
            } else if (e.deltaMode === 2) {
                factor = 1;
            }
            let vs = clamp(-e.deltaY * factor, -8, 8);
            let hs = clamp(e.deltaX * factor, -8, 8);
            if (e.shiftKey && !hs) {
                hs = -vs;
                vs = 0;
            }
            this.app.send({ t: 'scroll', x: p.x, y: p.y, w: p.w, h: p.h, hs, vs });
        }, { passive: false });

        document.addEventListener('pointerlockchange', () => {
            const locked = document.pointerLockElement === stage;
            this.pointerLocked = locked;
            stage.classList.toggle('pointer-locked', locked);
            if (!locked) {
                this.mapper.releaseAll();
                if (this.gameMode && this.wantPointerLock && !this.cursorMode) {
                    // lost with Esc: stay in game mode, clicking the video locks again
                    this.wantPointerLock = false;
                }
            }
            this.updateHud();
        });
        document.addEventListener('pointerlockerror', () => {
            // one message per attempt (the request with raw movement may fail before the fallback)
            if (this.gameMode && this.pointerLockErrorShown !== this.pointerLockAttempt) {
                this.pointerLockErrorShown = this.pointerLockAttempt;
                this.updateHud();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const fullscreen = document.fullscreenElement === this.element;
            this.btnFullscreen.classList.toggle('active', fullscreen);
            this.toolbar.classList.remove('reveal');
            if (!fullscreen && navigator.keyboard && navigator.keyboard.unlock) {
                navigator.keyboard.unlock();
            }
            setTimeout(() => this.layout(), 50);
        });

        window.addEventListener('keydown', (e) => this.onKey(e, true));
        window.addEventListener('keyup', (e) => this.onKey(e, false));
        window.addEventListener('blur', () => {
            // Alt+Tab etc.: release everything
            this.mapper.releaseAll();
            this.releaseDesktopInput();
        });

        document.addEventListener('paste', (e) => {
            if (!this.isActive() || isTextInput(document.activeElement)) {
                return;
            }
            const text = e.clipboardData && e.clipboardData.getData('text/plain');
            if (text) {
                e.preventDefault();
                this.app.send({ t: 'setclipboard', text, paste: true, seq: this.clipboardSeq++ });
            }
        });
    }

    /** Left button = finger. */
    desktopPointerDown(e) {
        const p = this.toVideo(e);
        if (!p.inside) {
            return;
        }
        this.mouseDown = true;
        this.stage.setPointerCapture(e.pointerId);
        this.app.send({ t: 'touch', a: 'down', id: MOUSE_POINTER_ID, x: p.x, y: p.y, w: p.w, h: p.h });
    }

    desktopPointerUp(e) {
        if (this.mouseDown) {
            const p = this.toVideo(e);
            this.mouseDown = false;
            this.app.send({ t: 'touch', a: 'up', id: MOUSE_POINTER_ID, x: p.x, y: p.y, w: p.w, h: p.h });
        }
    }

    /** Other buttons: right = back, middle = home, "back" side button = back, "forward" side button = recent apps. */
    desktopButton(button, down) {
        const action = down ? 'down' : 'up';
        if (button === 2 || button === 3) {
            this.app.send({ t: 'back', a: action });
        } else if (button === 1) {
            this.app.send({ t: 'key', a: action, code: AKEY.HOME });
        } else if (button === 4) {
            this.app.send({ t: 'key', a: action, code: AKEY.APP_SWITCH });
        }
    }

    releaseDesktopInput() {
        if (this.mouseDown) {
            this.mouseDown = false;
            this.app.send({ t: 'touch', a: 'up', id: MOUSE_POINTER_ID, x: 0, y: 0, w: this.player.width, h: this.player.height });
        }
        for (const code of this.keysDown) {
            const keycode = androidKeycode(code);
            if (keycode) {
                this.app.send({ t: 'key', a: 'up', code: keycode });
            }
        }
        this.keysDown.clear();
    }

    onKey(e, down) {
        if (!this.isActive() || isTextInput(e.target)) {
            return;
        }
        const code = e.code;

        // shortcuts of the app
        if (down && !e.repeat) {
            if (code === 'F8') {
                e.preventDefault();
                this.toggleGameMode();
                return;
            }
            if (code === 'F9') {
                e.preventDefault();
                this.openEditor();
                return;
            }
            if (code === 'F10' || code === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }
        }
        if (code === 'F8' || code === 'F9' || code === 'F10' || code === 'F11') {
            e.preventDefault();
            return;
        }

        if (this.gameMode) {
            this.onGameKey(e, down);
        } else {
            this.onDesktopKey(e, down);
        }
    }

    onGameKey(e, down) {
        const code = e.code;
        e.preventDefault();
        if (down && !e.repeat && code === this.mapper.getCursorKey()) {
            this.setCursorMode(!this.cursorMode);
            return;
        }
        if (code === 'Escape') {
            // only received with the keyboard locked (fullscreen): free the mouse
            if (down && !e.repeat) {
                this.setCursorMode(true);
            }
            return;
        }
        if (down) {
            this.app.resumeAudio();
            this.mapper.keyDown(code);
        } else {
            this.mapper.keyUp(code);
        }
    }

    onDesktopKey(e, down) {
        const code = e.code;
        const ctrl = e.ctrlKey || e.metaKey;
        const altGraph = e.getModifierState && e.getModifierState('AltGraph');

        if (down && ctrl && !e.altKey) {
            if (code === 'KeyV') {
                // handled by the "paste" event (reads the PC clipboard)
                return;
            }
            if (code === 'KeyC' || code === 'KeyX') {
                e.preventDefault();
                this.app.send({ t: 'getclipboard', copy: code === 'KeyC' ? 'copy' : 'cut' });
                return;
            }
        }

        const printable = e.key && e.key.length === 1 && ((!ctrl && !e.altKey) || altGraph);
        if (printable) {
            e.preventDefault();
            if (down) {
                this.app.resumeAudio();
                this.app.send({ t: 'text', text: e.key });
            }
            return;
        }

        if (code === 'Escape') {
            e.preventDefault();
            this.app.send({ t: 'back', a: down ? 'down' : 'up' });
            return;
        }

        const keycode = androidKeycode(code);
        if (!keycode) {
            return;
        }
        e.preventDefault();
        if (down) {
            this.keysDown.add(code);
        } else {
            this.keysDown.delete(code);
        }
        this.app.send({ t: 'key', a: down ? 'down' : 'up', code: keycode, meta: metaState(e), repeat: e.repeat ? 1 : 0 });
    }

    destroy() {
        clearInterval(this.statsTimer);
        this.resizeObserver.disconnect();
        this.editor.close();
        this.exitGameInput();
        this.player.destroy();
    }
}
