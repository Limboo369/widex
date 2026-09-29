/**
 * Key mapping overlay (markers over the video) and editor.
 */
import { h, toast } from '../util/dom.js';
import { keyName } from './keycodes.js';

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

export function cloneProfile(profile) {
    return JSON.parse(JSON.stringify(profile || { name: 'Novi profil', mouse: { sensitivity: 1 }, cursorKey: 'Backquote', controls: [] }));
}

/**
 * Render the markers of a profile into the layer.
 */
export function renderMarkers(layer, profile, { selected = -1, pressed = new Set() } = {}) {
    layer.textContent = '';
    if (!profile || !Array.isArray(profile.controls)) {
        return [];
    }
    const layerHeight = layer.clientHeight || 1;
    return profile.controls.map((def, index) => {
        let el;
        if (def.type === 'joystick') {
            const diameter = Math.max(24, 2 * (def.radius || 0.1) * layerHeight);
            el = h('div.km-control.km-joystick',
                h('span.km-key.km-up', keyName(def.up)),
                h('span.km-key.km-down', keyName(def.down)),
                h('span.km-key.km-left', keyName(def.left)),
                h('span.km-key.km-right', keyName(def.right)),
                h('span.km-center'));
            el.style.width = diameter + 'px';
            el.style.height = diameter + 'px';
            el.title = 'Džojstik' + (def.sprint ? ' (trčanje: ' + keyName(def.sprint) + ')' : '');
        } else if (def.type === 'camera') {
            const zone = 2 * (def.zone || 0.3) * layerHeight;
            const zoneEl = h('div.km-zone');
            zoneEl.style.width = zone + 'px';
            zoneEl.style.height = zone + 'px';
            el = h('div.km-control.km-camera', '🖱️', zoneEl);
            el.title = 'Kamera (pomeranje miša)';
        } else {
            el = h('div.km-control.km-button', keyName(def.key), def.label ? h('span.km-label', def.label) : null);
            el.title = (def.label || 'Dugme') + ' — ' + keyName(def.key) + (def.mode === 'tap' ? ' (dodir)' : ' (drži)');
        }
        el.style.left = (def.x * 100) + '%';
        el.style.top = (def.y * 100) + '%';
        el.dataset.index = String(index);
        if (index === selected) {
            el.classList.add('selected');
        }
        if (pressed.has(index)) {
            el.classList.add('pressed');
        }
        layer.appendChild(el);
        return el;
    });
}

export class KeymapEditor {
    /**
     * @param {object} options {stage, layer, onSave(profile), onClose(), presets: [], onPreview()}
     */
    constructor(options) {
        this.stage = options.stage;
        this.layer = options.layer;
        this.onSave = options.onSave;
        this.onClose = options.onClose;
        this.presets = options.presets || [];
        this.profile = null;
        this.selected = -1;
        this.isOpen = false;
        this.dirty = false;
        this.capturing = null;
    }

    open(profile, title) {
        this.profile = cloneProfile(profile);
        if (!this.profile.mouse) {
            this.profile.mouse = { sensitivity: 1 };
        }
        this.title = title;
        this.selected = -1;
        this.dirty = false;
        this.isOpen = true;
        this.layer.classList.add('editing');
        this.buildToolbar();
        this.panel = h('div.keymap-panel.glass-panel');
        this.stage.appendChild(this.panel);
        this.render();
        this.layerDown = (e) => this.onLayerPointerDown(e);
        this.layer.addEventListener('pointerdown', this.layerDown);
        this.keyHandler = (e) => this.onKey(e);
        window.addEventListener('keydown', this.keyHandler, true);
        this.contextHandler = (e) => e.preventDefault();
        this.layer.addEventListener('contextmenu', this.contextHandler);
    }

    close() {
        if (!this.isOpen) {
            return;
        }
        this.cancelCapture();
        this.isOpen = false;
        this.layer.classList.remove('editing');
        this.layer.removeEventListener('pointerdown', this.layerDown);
        this.layer.removeEventListener('contextmenu', this.contextHandler);
        window.removeEventListener('keydown', this.keyHandler, true);
        if (this.toolbar) {
            this.toolbar.remove();
        }
        if (this.panel) {
            this.panel.remove();
        }
        this.layer.textContent = '';
        if (this.onClose) {
            this.onClose();
        }
    }

    buildToolbar() {
        const presetSelect = h('select.input', { style: { height: '30px', maxWidth: '190px' } },
            h('option', { value: '' }, 'Šablon...'),
            this.presets.map((p) => h('option', { value: p.id }, p.name)));
        presetSelect.addEventListener('change', () => {
            const preset = this.presets.find((p) => p.id === presetSelect.value);
            presetSelect.value = '';
            if (preset) {
                const keepName = this.profile.name;
                this.profile = cloneProfile(preset);
                this.profile.name = keepName || preset.name;
                delete this.profile.id;
                delete this.profile.order;
                delete this.profile.description;
                this.selected = -1;
                this.dirty = true;
                this.render();
                toast('Učitan šablon "' + preset.name + '" — pomeri dugmad da se poklope sa igrom', 'info');
            }
        });
        this.toolbar = h('div.keymap-toolbar.glass-panel',
            h('b', { style: { marginRight: '6px' } }, '⌨️ ' + (this.title || 'Mapiranje')),
            h('button.btn.btn-sm', { onclick: () => this.addControl('button') }, '+ Dugme'),
            h('button.btn.btn-sm', { onclick: () => this.addControl('joystick') }, '+ Džojstik'),
            h('button.btn.btn-sm', { onclick: () => this.addControl('camera') }, '+ Kamera'),
            presetSelect,
            h('button.btn.btn-sm.btn-primary', { onclick: () => this.save() }, '💾 Sačuvaj'),
            h('button.btn.btn-sm', { onclick: () => this.requestClose() }, 'Zatvori'));
        this.stage.appendChild(this.toolbar);
    }

    requestClose() {
        if (this.dirty && !confirm('Imaš nesačuvane izmene. Zatvoriti bez čuvanja?')) {
            return;
        }
        this.close();
    }

    async save() {
        try {
            await this.onSave(cloneProfile(this.profile));
            this.dirty = false;
            toast('Mapiranje sačuvano', 'ok');
        } catch (e) {
            toast('Čuvanje nije uspelo: ' + e.message, 'error');
        }
    }

    render() {
        if (!this.isOpen) {
            return;
        }
        const elements = renderMarkers(this.layer, this.profile, { selected: this.selected });
        elements.forEach((el, index) => {
            el.addEventListener('pointerdown', (e) => this.onMarkerPointerDown(e, index));
        });
        this.renderPanel();
    }

    refresh() {
        if (this.isOpen) {
            this.render();
        }
    }

    addControl(type) {
        let def;
        if (type === 'joystick') {
            if (this.profile.controls.some((c) => c.type === 'joystick')) {
                toast('Već postoji džojstik (možeš dodati još jedan za druge tastere)', 'warn');
            }
            def = { type: 'joystick', x: 0.16, y: 0.72, radius: 0.11, up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', sprintScale: 1.6 };
        } else if (type === 'camera') {
            if (this.profile.controls.some((c) => c.type === 'camera')) {
                toast('Kamera već postoji — koristi se samo jedna', 'warn');
                return;
            }
            def = { type: 'camera', x: 0.63, y: 0.42, sensitivity: 1, zone: 0.3, releaseDelay: 300 };
        } else {
            def = { type: 'button', x: 0.5, y: 0.5, key: '', mode: 'hold', label: '' };
        }
        this.profile.controls.push(def);
        this.selected = this.profile.controls.length - 1;
        this.dirty = true;
        this.render();
        if (type === 'button') {
            this.startCapture((key) => {
                def.key = key;
                this.dirty = true;
                this.render();
            });
        }
    }

    deleteSelected() {
        if (this.selected < 0) {
            return;
        }
        this.profile.controls.splice(this.selected, 1);
        this.selected = -1;
        this.dirty = true;
        this.render();
    }

    onLayerPointerDown(e) {
        if (e.target === this.layer) {
            this.selected = -1;
            this.render();
        }
    }

    onMarkerPointerDown(e, index) {
        if (this.capturing) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.selected = index;
        const def = this.profile.controls[index];
        const target = e.currentTarget;
        const rect = this.layer.getBoundingClientRect();
        target.setPointerCapture(e.pointerId);
        let moved = false;
        const move = (ev) => {
            moved = true;
            def.x = Math.round(clamp01((ev.clientX - rect.left) / rect.width) * 1000) / 1000;
            def.y = Math.round(clamp01((ev.clientY - rect.top) / rect.height) * 1000) / 1000;
            target.style.left = (def.x * 100) + '%';
            target.style.top = (def.y * 100) + '%';
            this.dirty = true;
        };
        const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            this.render();
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
        if (!moved) {
            for (const el of this.layer.querySelectorAll('.km-control')) {
                el.classList.toggle('selected', el === target);
            }
            this.renderPanel();
        }
    }

    onKey(e) {
        if (this.capturing) {
            return;
        }
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
            return;
        }
        if ((e.code === 'Delete' || e.code === 'Backspace') && this.selected >= 0) {
            e.preventDefault();
            e.stopPropagation();
            this.deleteSelected();
        } else if (e.code === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.requestClose();
        }
    }

    // ------------------------------------------------------------------ key capture

    startCapture(callback, button) {
        this.cancelCapture();
        const finish = (key) => {
            this.cancelCapture();
            if (key) {
                callback(key);
            } else {
                this.renderPanel();
            }
        };
        const onKeyDown = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.code === 'Escape') {
                finish(null);
            } else {
                finish(e.code);
            }
        };
        const onMouseDown = (e) => {
            if (e.target.closest && e.target.closest('.keymap-panel, .keymap-toolbar')) {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            finish('Mouse' + e.button);
        };
        const onWheel = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
        };
        window.addEventListener('keydown', onKeyDown, true);
        this.stage.addEventListener('pointerdown', onMouseDown, true);
        this.stage.addEventListener('wheel', onWheel, { capture: true, passive: false });
        this.capturing = () => {
            window.removeEventListener('keydown', onKeyDown, true);
            this.stage.removeEventListener('pointerdown', onMouseDown, true);
            this.stage.removeEventListener('wheel', onWheel, true);
        };
        if (button) {
            button.classList.add('listening');
            button.textContent = 'Pritisni taster...';
        } else {
            toast('Pritisni taster (ili klikni mišem na video) za novo dugme. Esc = otkaži', 'info', 3000);
        }
    }

    cancelCapture() {
        if (this.capturing) {
            this.capturing();
            this.capturing = null;
        }
    }

    // ------------------------------------------------------------------ properties panel

    keyButton(def, prop) {
        const button = h('button.btn.btn-sm.key-capture', keyName(def[prop]));
        button.addEventListener('click', () => {
            this.startCapture((key) => {
                def[prop] = key;
                this.dirty = true;
                this.render();
            }, button);
        });
        return button;
    }

    slider(label, value, min, max, step, onInput, format = (v) => v) {
        const output = h('output', format(value));
        const input = h('input', { type: 'range', min, max, step, value });
        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            output.textContent = format(v);
            onInput(v);
            this.dirty = true;
        });
        input.addEventListener('change', () => this.render());
        return h('div.field', h('label', label), h('div.slider-row', input, output));
    }

    renderPanel() {
        const panel = this.panel;
        panel.textContent = '';
        const profile = this.profile;

        if (this.selected < 0 || !profile.controls[this.selected]) {
            panel.appendChild(h('h4', 'Profil'));
            const name = h('input.input', { value: profile.name || '' });
            name.addEventListener('input', () => {
                profile.name = name.value;
                this.dirty = true;
            });
            panel.appendChild(h('div.field', h('label', 'Naziv'), name));
            panel.appendChild(this.slider('Osetljivost miša', profile.mouse.sensitivity || 1, 0.1, 5, 0.05,
                (v) => { profile.mouse.sensitivity = v; }, (v) => v.toFixed(2)));
            const invert = h('input', { type: 'checkbox', checked: !!profile.mouse.invertY });
            invert.addEventListener('change', () => {
                profile.mouse.invertY = invert.checked;
                this.dirty = true;
            });
            panel.appendChild(h('label.check', invert, h('span', 'Obrni vertikalno (Y) kretanje miša')));
            panel.appendChild(h('div.field', h('label', 'Taster za kursor (oslobađa miš za klik po meniju)'),
                this.keyButton(profile, 'cursorKey')));
            panel.appendChild(h('p.small.muted',
                'Klikni na oznaku da je izmeniš, prevuci je da je pomeriš. Postavi oznake tačno iznad dugmadi u igri. ',
                h('br'), 'Delete = obriši izabranu, Esc = zatvori.'));
            return;
        }

        const def = profile.controls[this.selected];
        if (def.type === 'button') {
            panel.appendChild(h('h4', 'Dugme'));
            panel.appendChild(h('div.field', h('label', 'Taster'), this.keyButton(def, 'key')));
            const mode = h('select.input',
                h('option', { value: 'hold', selected: def.mode !== 'tap' }, 'Drži (dok je taster pritisnut)'),
                h('option', { value: 'tap', selected: def.mode === 'tap' }, 'Dodir (kratak klik)'));
            mode.addEventListener('change', () => {
                def.mode = mode.value;
                this.dirty = true;
            });
            panel.appendChild(h('div.field', h('label', 'Način'), mode));
            const label = h('input.input', { value: def.label || '', placeholder: 'npr. Skok' });
            label.addEventListener('input', () => {
                def.label = label.value;
                this.dirty = true;
            });
            label.addEventListener('change', () => this.render());
            panel.appendChild(h('div.field', h('label', 'Opis (opciono)'), label));
        } else if (def.type === 'joystick') {
            panel.appendChild(h('h4', 'Džojstik (kretanje)'));
            panel.appendChild(h('div.row',
                h('div.field', h('label', 'Napred'), this.keyButton(def, 'up')),
                h('div.field', h('label', 'Nazad'), this.keyButton(def, 'down'))));
            panel.appendChild(h('div.row',
                h('div.field', h('label', 'Levo'), this.keyButton(def, 'left')),
                h('div.field', h('label', 'Desno'), this.keyButton(def, 'right'))));
            panel.appendChild(h('div.field', h('label', 'Trčanje (dalje pomeranje džojstika)'), this.keyButton(def, 'sprint')));
            panel.appendChild(this.slider('Poluprečnik', def.radius || 0.1, 0.03, 0.3, 0.005,
                (v) => { def.radius = v; }, (v) => Math.round(v * 100) + '%'));
            panel.appendChild(this.slider('Trčanje: koliko dalje', def.sprintScale || 1.6, 1, 2.5, 0.05,
                (v) => { def.sprintScale = v; }, (v) => v.toFixed(2) + '×'));
            panel.appendChild(h('p.small.muted', 'Postavi centar na sredinu džojstika u igri.'));
        } else if (def.type === 'camera') {
            panel.appendChild(h('h4', 'Kamera (miš)'));
            panel.appendChild(this.slider('Osetljivost', def.sensitivity || 1, 0.1, 5, 0.05,
                (v) => { def.sensitivity = v; }, (v) => v.toFixed(2)));
            panel.appendChild(this.slider('Veličina zone', def.zone || 0.3, 0.1, 0.5, 0.01,
                (v) => { def.zone = v; }, (v) => Math.round(v * 100) + '%'));
            panel.appendChild(this.slider('Pusti prst posle mirovanja', def.releaseDelay || 300, 80, 1500, 10,
                (v) => { def.releaseDelay = v; }, (v) => v + ' ms'));
            panel.appendChild(h('p.small.muted', 'Postavi na prazan deo ekrana (bez dugmadi), gde prevlačenje prstom okreće kameru.'));
        }
        panel.appendChild(h('div.row',
            h('button.btn.btn-sm.btn-danger', { onclick: () => this.deleteSelected() }, '🗑 Obriši'),
            h('button.btn.btn-sm', {
                onclick: () => {
                    this.selected = -1;
                    this.render();
                },
            }, 'Gotovo')));
    }
}
