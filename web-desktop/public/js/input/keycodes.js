/**
 * PC keyboard (KeyboardEvent.code) -> Android KeyEvent keycodes, and key names for the UI.
 */

export const AKEY = {
    HOME: 3,
    BACK: 4,
    DPAD_UP: 19,
    DPAD_DOWN: 20,
    DPAD_LEFT: 21,
    DPAD_RIGHT: 22,
    VOLUME_UP: 24,
    VOLUME_DOWN: 25,
    POWER: 26,
    ENTER: 66,
    DEL: 67,
    ESCAPE: 111,
    FORWARD_DEL: 112,
    MENU: 82,
    APP_SWITCH: 187,
    WAKEUP: 224,
    COPY: 278,
    PASTE: 279,
    CUT: 277,
};

const CODE_TO_KEYCODE = {
    Escape: 111,
    Backspace: 67,
    Tab: 61,
    Enter: 66,
    NumpadEnter: 160,
    Space: 62,
    ShiftLeft: 59,
    ShiftRight: 60,
    ControlLeft: 113,
    ControlRight: 114,
    AltLeft: 57,
    AltRight: 58,
    MetaLeft: 117,
    MetaRight: 118,
    CapsLock: 115,
    ArrowUp: 19,
    ArrowDown: 20,
    ArrowLeft: 21,
    ArrowRight: 22,
    Home: 122,
    End: 123,
    PageUp: 92,
    PageDown: 93,
    Insert: 124,
    Delete: 112,
    Minus: 69,
    Equal: 70,
    BracketLeft: 71,
    BracketRight: 72,
    Backslash: 73,
    Semicolon: 74,
    Quote: 75,
    Comma: 55,
    Period: 56,
    Slash: 76,
    Backquote: 68,
    IntlBackslash: 73,
    NumpadAdd: 157,
    NumpadSubtract: 156,
    NumpadMultiply: 155,
    NumpadDivide: 154,
    NumpadDecimal: 158,
    NumLock: 143,
    ScrollLock: 116,
    Pause: 121,
    PrintScreen: 120,
    ContextMenu: 82,
    AudioVolumeUp: 24,
    AudioVolumeDown: 25,
    AudioVolumeMute: 164,
    MediaPlayPause: 85,
    MediaTrackNext: 87,
    MediaTrackPrevious: 88,
    MediaStop: 86,
};

export function androidKeycode(code) {
    if (CODE_TO_KEYCODE[code] !== undefined) {
        return CODE_TO_KEYCODE[code];
    }
    let m = /^Key([A-Z])$/.exec(code);
    if (m) {
        return 29 + (m[1].charCodeAt(0) - 65); // KEYCODE_A = 29
    }
    m = /^Digit(\d)$/.exec(code);
    if (m) {
        return 7 + parseInt(m[1], 10); // KEYCODE_0 = 7
    }
    m = /^Numpad(\d)$/.exec(code);
    if (m) {
        return 144 + parseInt(m[1], 10); // KEYCODE_NUMPAD_0 = 144
    }
    m = /^F(\d{1,2})$/.exec(code);
    if (m && +m[1] >= 1 && +m[1] <= 12) {
        return 130 + parseInt(m[1], 10); // KEYCODE_F1 = 131
    }
    return 0;
}

// Android meta state flags
const META_SHIFT_ON = 0x1;
const META_ALT_ON = 0x2;
const META_ALT_LEFT_ON = 0x10;
const META_SHIFT_LEFT_ON = 0x40;
const META_CTRL_ON = 0x1000;
const META_CTRL_LEFT_ON = 0x2000;
const META_META_ON = 0x10000;
const META_META_LEFT_ON = 0x20000;
const META_CAPS_LOCK_ON = 0x100000;

export function metaState(event) {
    let meta = 0;
    if (event.shiftKey) {
        meta |= META_SHIFT_ON | META_SHIFT_LEFT_ON;
    }
    if (event.altKey) {
        meta |= META_ALT_ON | META_ALT_LEFT_ON;
    }
    if (event.ctrlKey) {
        meta |= META_CTRL_ON | META_CTRL_LEFT_ON;
    }
    if (event.metaKey) {
        meta |= META_META_ON | META_META_LEFT_ON;
    }
    if (event.getModifierState && event.getModifierState('CapsLock')) {
        meta |= META_CAPS_LOCK_ON;
    }
    return meta;
}

const KEY_NAMES = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Tab: 'Tab',
    CapsLock: 'Caps',
    Enter: 'Enter',
    Backspace: '⌫',
    Escape: 'Esc',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Mouse0: 'L-Click',
    Mouse1: 'Wheel click',
    Mouse2: 'R-Click',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5',
    WheelUp: 'Wheel ↑',
    WheelDown: 'Wheel ↓',
};

export function keyName(code) {
    if (!code) {
        return '—';
    }
    if (KEY_NAMES[code]) {
        return KEY_NAMES[code];
    }
    let m = /^Key([A-Z])$/.exec(code);
    if (m) {
        return m[1];
    }
    m = /^Digit(\d)$/.exec(code);
    if (m) {
        return m[1];
    }
    m = /^Numpad(.+)$/.exec(code);
    if (m) {
        return 'Num ' + m[1];
    }
    return code;
}
