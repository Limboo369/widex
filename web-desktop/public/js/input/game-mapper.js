/**
 * Game mode: translate keyboard and mouse into multi-touch gestures, following a key mapping profile.
 *
 * Profile format (positions are relative to the video: 0..1, radius/zone relative to the height):
 * {
 *   name, mouse: {sensitivity, invertY}, cursorKey: "Backquote",
 *   controls: [
 *     {type: "joystick", x, y, radius, up, down, left, right, sprint, sprintScale},
 *     {type: "camera", x, y, sensitivity, zone, releaseDelay},
 *     {type: "button", x, y, key, mode: "hold" | "tap", label, drag}
 *   ]
 * }
 * A button with "drag": true is moved by the mouse while it is held (e.g. the "free look" eye button of PUBG):
 * during that time the mouse does not move the camera.
 * Keys use KeyboardEvent.code names, plus "Mouse0".."Mouse4" and "WheelUp"/"WheelDown".
 */

const TAP_DURATION_MS = 45;
const JOYSTICK_STEP_MS = 12;
const POINTER_ID_BASE = 10;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class GameMapper {
    /**
     * @param {object} options {send(msg), getVideoSize() -> {width, height}, onPressedChange(index, pressed)}
     */
    constructor(options) {
        this.send = options.send;
        this.getVideoSize = options.getVideoSize;
        this.onPressedChange = options.onPressedChange || (() => {});
        this.profile = null;
        this.controls = [];
        this.keyMap = new Map();
        this.pressedKeys = new Set();
        this.camera = null;
        this.dragControl = null;
    }

    setProfile(profile) {
        this.releaseAll();
        this.profile = profile;
        this.controls = [];
        this.keyMap = new Map();
        this.camera = null;
        this.dragControl = null;
        if (!profile || !Array.isArray(profile.controls)) {
            return;
        }
        profile.controls.forEach((def, index) => {
            const control = { def, index, id: POINTER_ID_BASE + index, down: false, timers: [] };
            this.controls.push(control);
            if (def.type === 'joystick') {
                control.dirs = { up: false, down: false, left: false, right: false, sprint: false };
                for (const dir of ['up', 'down', 'left', 'right', 'sprint']) {
                    if (def[dir]) {
                        this.bind(def[dir], { control, dir });
                    }
                }
            } else if (def.type === 'camera') {
                if (!this.camera) {
                    this.camera = control;
                }
            } else if (def.type === 'button' && def.key) {
                this.bind(def.key, { control });
            }
        });
    }

    bind(key, action) {
        if (!this.keyMap.has(key)) {
            this.keyMap.set(key, []);
        }
        this.keyMap.get(key).push(action);
    }

    isMapped(key) {
        return this.keyMap.has(key);
    }

    getCursorKey() {
        return (this.profile && this.profile.cursorKey) || 'Backquote';
    }

    // ------------------------------------------------------------------ touches

    touch(action, control, x, y) {
        const size = this.getVideoSize();
        if (!size || !size.width) {
            return;
        }
        this.send({
            t: 'touch',
            a: action,
            id: control.id,
            x: clamp(x, 0, size.width - 1),
            y: clamp(y, 0, size.height - 1),
            w: size.width,
            h: size.height,
        });
        control.lastX = x;
        control.lastY = y;
    }

    clearTimers(control) {
        for (const timer of control.timers) {
            clearTimeout(timer);
        }
        control.timers = [];
    }

    // ------------------------------------------------------------------ keys

    /** @returns {boolean} true if the key is mapped */
    keyDown(key) {
        const actions = this.keyMap.get(key);
        if (!actions) {
            return false;
        }
        if (this.pressedKeys.has(key)) {
            return true; // auto-repeat
        }
        this.pressedKeys.add(key);
        for (const action of actions) {
            const control = action.control;
            if (control.def.type === 'joystick') {
                control.dirs[action.dir] = true;
                this.updateJoystick(control);
            } else {
                this.pressButton(control);
            }
        }
        return true;
    }

    keyUp(key) {
        const actions = this.keyMap.get(key);
        if (!actions) {
            return false;
        }
        this.pressedKeys.delete(key);
        for (const action of actions) {
            const control = action.control;
            if (control.def.type === 'joystick') {
                control.dirs[action.dir] = false;
                this.updateJoystick(control);
            } else if (control.def.mode !== 'tap') {
                this.releaseButton(control);
            }
        }
        return true;
    }

    /** Mouse wheel: "WheelUp"/"WheelDown" are taps. */
    wheel(deltaY) {
        const key = deltaY < 0 ? 'WheelUp' : 'WheelDown';
        const actions = this.keyMap.get(key);
        if (!actions) {
            return false;
        }
        for (const action of actions) {
            if (action.control.def.type === 'button') {
                this.pressButton(action.control, true);
            }
        }
        return true;
    }

    // ------------------------------------------------------------------ buttons

    pressButton(control, forceTap = false) {
        if (control.down) {
            return;
        }
        const size = this.getVideoSize();
        if (!size || !size.width) {
            return;
        }
        control.down = true;
        control.x = control.def.x * size.width;
        control.y = control.def.y * size.height;
        this.touch('down', control, control.x, control.y);
        this.onPressedChange(control.index, true);
        if (control.def.mode === 'tap' || forceTap) {
            control.timers.push(setTimeout(() => this.releaseButton(control), TAP_DURATION_MS));
        } else if (control.def.drag) {
            // the mouse now moves this finger instead of the camera
            this.releaseCamera();
            this.dragControl = control;
        }
    }

    releaseButton(control) {
        this.clearTimers(control);
        if (this.dragControl === control) {
            this.dragControl = null;
        }
        if (!control.down) {
            return;
        }
        control.down = false;
        this.touch('up', control, control.lastX, control.lastY);
        this.onPressedChange(control.index, false);
    }

    // ------------------------------------------------------------------ joystick

    updateJoystick(control) {
        const size = this.getVideoSize();
        if (!size || !size.width) {
            return;
        }
        const d = control.dirs;
        const dx = (d.right ? 1 : 0) - (d.left ? 1 : 0);
        const dy = (d.down ? 1 : 0) - (d.up ? 1 : 0);
        if (!dx && !dy) {
            if (control.down) {
                this.clearTimers(control);
                control.down = false;
                this.touch('up', control, control.lastX, control.lastY);
                this.onPressedChange(control.index, false);
            }
            return;
        }
        const def = control.def;
        const scale = d.sprint && def.sprintScale ? def.sprintScale : 1;
        const radius = (def.radius || 0.1) * size.height * scale;
        const cx = def.x * size.width;
        const cy = def.y * size.height;
        const length = Math.hypot(dx, dy);
        control.targetX = cx + dx / length * radius;
        control.targetY = cy + dy / length * radius;

        if (!control.down) {
            // touch the center, then drag towards the direction in small steps (games expect a real drag)
            control.down = true;
            control.stepping = true;
            this.touch('down', control, cx, cy);
            this.onPressedChange(control.index, true);
            control.timers.push(setTimeout(() => {
                if (control.down) {
                    this.touch('move', control, (cx + control.targetX) / 2, (cy + control.targetY) / 2);
                }
            }, JOYSTICK_STEP_MS));
            control.timers.push(setTimeout(() => {
                control.stepping = false;
                if (control.down) {
                    this.touch('move', control, control.targetX, control.targetY);
                }
            }, JOYSTICK_STEP_MS * 2));
        } else if (!control.stepping) {
            this.touch('move', control, control.targetX, control.targetY);
        }
    }

    // ------------------------------------------------------------------ camera (mouse look)

    mouseMove(dx, dy) {
        if (!dx && !dy) {
            return;
        }
        const size = this.getVideoSize();
        if (!size || !size.width) {
            return;
        }
        const mouse = (this.profile && this.profile.mouse) || {};

        const drag = this.dragControl;
        if (drag && drag.down) {
            // a "drag" button is held: move its finger (clamped to the screen, no re-centering)
            const factor = (mouse.sensitivity || 1) * size.height / 1080;
            drag.x = clamp(drag.x + dx * factor, 0, size.width - 1);
            drag.y = clamp(drag.y + dy * factor * (mouse.invertY ? -1 : 1), 0, size.height - 1);
            this.touch('move', drag, drag.x, drag.y);
            return;
        }

        const camera = this.camera;
        if (!camera) {
            return;
        }
        const def = camera.def;
        const sensitivity = (mouse.sensitivity || 1) * (def.sensitivity || 1) * size.height / 1080;
        const anchorX = def.x * size.width;
        const anchorY = def.y * size.height;
        const zone = (def.zone || 0.3) * size.height;

        if (!camera.down) {
            camera.down = true;
            camera.x = anchorX;
            camera.y = anchorY;
            this.touch('down', camera, anchorX, anchorY);
            this.onPressedChange(camera.index, true);
        }
        camera.x += dx * sensitivity;
        camera.y += dy * sensitivity * (mouse.invertY ? -1 : 1);

        const outOfZone = Math.abs(camera.x - anchorX) > zone || Math.abs(camera.y - anchorY) > zone;
        const outOfScreen = camera.x < 1 || camera.y < 1 || camera.x > size.width - 2 || camera.y > size.height - 2;
        if (outOfZone || outOfScreen) {
            // the "finger" reached the border of its zone: lift it and put it back on the anchor
            this.touch('up', camera, clamp(camera.x, 0, size.width - 1), clamp(camera.y, 0, size.height - 1));
            camera.x = anchorX;
            camera.y = anchorY;
            this.touch('down', camera, anchorX, anchorY);
        } else {
            this.touch('move', camera, camera.x, camera.y);
        }

        clearTimeout(camera.idleTimer);
        camera.idleTimer = setTimeout(() => this.releaseCamera(), def.releaseDelay || 300);
    }

    releaseCamera() {
        const camera = this.camera;
        if (camera && camera.down) {
            clearTimeout(camera.idleTimer);
            camera.down = false;
            this.touch('up', camera, camera.lastX, camera.lastY);
            this.onPressedChange(camera.index, false);
        }
    }

    // ------------------------------------------------------------------

    /** Release every touch (focus lost, pointer lock lost, mode change...). */
    releaseAll() {
        this.pressedKeys.clear();
        this.dragControl = null;
        for (const control of this.controls) {
            this.clearTimers(control);
            clearTimeout(control.idleTimer);
            if (control.dirs) {
                for (const dir of Object.keys(control.dirs)) {
                    control.dirs[dir] = false;
                }
            }
            if (control.down) {
                control.down = false;
                this.touch('up', control, control.lastX, control.lastY);
                this.onPressedChange(control.index, false);
            }
        }
    }
}
