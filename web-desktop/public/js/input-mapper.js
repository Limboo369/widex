/**
 * Wi-Dex Input Mapper & Game Controller Engine
 * Translates PC Mouse & Keyboard inputs into Android Accessibility Touch & Key Events.
 */
class InputMapper {
    constructor(canvasElement, sendSocketCallback) {
        this.canvas = canvasElement;
        this.sendSocket = sendSocketCallback;
        this.isGameMode = false;
        this.isPointerLocked = false;
        
        // Key bindings setup (Default mapping for WASD & FPS games)
        this.keyBindings = {
            'KeyW': { name: 'Forward', x: 0.25, y: 0.70, type: 'joystick' },
            'KeyS': { name: 'Backward', x: 0.25, y: 0.82, type: 'joystick' },
            'KeyA': { name: 'Left', x: 0.19, y: 0.76, type: 'joystick' },
            'KeyD': { name: 'Right', x: 0.31, y: 0.76, type: 'joystick' },
            'Space': { name: 'Jump', x: 0.88, y: 0.75, type: 'tap' },
            'ShiftLeft': { name: 'Run', x: 0.12, y: 0.65, type: 'tap' },
            'KeyR': { name: 'Reload', x: 0.82, y: 0.60, type: 'tap' },
            'KeyF': { name: 'Use/Interact', x: 0.75, y: 0.70, type: 'tap' }
        };

        this.activeKeys = new Set();
        this.initEventListeners();
    }

    initEventListeners() {
        // Desktop Mouse Click & Drag Mapping
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Context Menu (Right Click -> Android Back Button)
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.sendInput({ type: 'KEY_EVENT', keyCode: 'BACK' });
        });

        // Pointer Lock & Key Listeners
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.canvas);
            console.log(`[Wi-Dex Input] Pointer Lock: ${this.isPointerLocked}`);
        });

        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const xRatio = (e.clientX - rect.left) / rect.width;
        const yRatio = (e.clientY - rect.top) / rect.height;
        return {
            x: Math.max(0, Math.min(1, xRatio)),
            y: Math.max(0, Math.min(1, yRatio))
        };
    }

    handleMouseDown(e) {
        if (this.isGameMode) {
            if (!this.isPointerLocked) {
                this.canvas.requestPointerLock();
                return;
            }
            // In Game Mode: Left click = Fire (Right side of screen), Right click = Aim
            if (e.button === 0) { // Left Click
                this.sendInput({ type: 'TOUCH_DOWN', id: 'fire', x: 0.85, y: 0.85 });
            } else if (e.button === 2) { // Right Click
                this.sendInput({ type: 'TOUCH_DOWN', id: 'aim', x: 0.70, y: 0.50 });
            }
        } else {
            // Normal desktop click
            const pos = this.getCanvasCoordinates(e);
            this.sendInput({
                type: 'TOUCH_DOWN',
                id: 'primary',
                x: pos.x,
                y: pos.y,
                button: e.button
            });
        }
    }

    handleMouseUp(e) {
        if (this.isGameMode && this.isPointerLocked) {
            if (e.button === 0) {
                this.sendInput({ type: 'TOUCH_UP', id: 'fire' });
            } else if (e.button === 2) {
                this.sendInput({ type: 'TOUCH_UP', id: 'aim' });
            }
        } else {
            const pos = this.getCanvasCoordinates(e);
            this.sendInput({
                type: 'TOUCH_UP',
                id: 'primary',
                x: pos.x,
                y: pos.y
            });
        }
    }

    handleMouseMove(e) {
        if (this.isGameMode && this.isPointerLocked) {
            // Send raw delta for 3D Camera Look
            const sensitivity = 0.002;
            this.sendInput({
                type: 'CAMERA_LOOK',
                deltaX: e.movementX * sensitivity,
                deltaY: e.movementY * sensitivity
            });
        } else if (e.buttons > 0) { // Dragging mouse
            const pos = this.getCanvasCoordinates(e);
            this.sendInput({
                type: 'TOUCH_MOVE',
                id: 'primary',
                x: pos.x,
                y: pos.y
            });
        }
    }

    handleWheel(e) {
        e.preventDefault();
        this.sendInput({
            type: 'SCROLL',
            deltaY: e.deltaY > 0 ? 1 : -1
        });
    }

    handleKeyDown(e) {
        if (this.activeKeys.has(e.code)) return;
        this.activeKeys.add(e.code);

        if (this.isGameMode) {
            const binding = this.keyBindings[e.code];
            if (binding) {
                this.sendInput({
                    type: 'TOUCH_DOWN',
                    id: e.code,
                    x: binding.x,
                    y: binding.y
                });
            }
        } else {
            // Desktop Key Input
            this.sendInput({
                type: 'TEXT_KEY',
                key: e.key,
                code: e.code
            });
        }
    }

    handleKeyUp(e) {
        this.activeKeys.delete(e.code);

        if (this.isGameMode) {
            const binding = this.keyBindings[e.code];
            if (binding) {
                this.sendInput({
                    type: 'TOUCH_UP',
                    id: e.code
                });
            }
        }
    }

    toggleGameMode(enable) {
        this.isGameMode = (enable !== undefined) ? enable : !this.isGameMode;
        console.log(`[Wi-Dex Input] Game Mode Enabled: ${this.isGameMode}`);
        if (!this.isGameMode && document.pointerLockElement) {
            document.exitPointerLock();
        }
        return this.isGameMode;
    }

    sendInput(data) {
        if (this.sendSocket) {
            this.sendSocket(JSON.stringify(data));
        }
    }
}
