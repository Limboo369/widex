package com.widex.server.control;

import android.graphics.PointF;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;

import com.widex.server.Device;
import com.widex.server.DeviceMessageSender;
import com.widex.server.Ln;
import com.widex.server.PowerState;
import com.widex.server.ScreenState;
import com.widex.server.video.VideoStreamer;
import com.widex.server.wrappers.InputManagerWrapper;

import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Read the control messages sent by the PC and inject the corresponding input events.
 *
 * All values are big-endian:
 *   KEY:               u8 action, i32 keycode, i32 repeat, i32 metastate
 *   TEXT:              u32 length, UTF-8 text
 *   TOUCH:             u8 action, i32 pointer id, f32 x, f32 y, u16 frame width, u16 frame height, u16 pressure
 *   SCROLL:            f32 x, f32 y, u16 frame width, u16 frame height, f32 hscroll, f32 vscroll
 *   BACK_OR_SCREEN_ON: u8 action
 *   GET_CLIPBOARD:     u8 copy key (0 = none, 1 = copy, 2 = cut)
 *   SET_CLIPBOARD:     i64 sequence, u8 paste, u32 length, UTF-8 text
 *   SET_DISPLAY_POWER: u8 on
 *   SET_BITRATE:       i32 bit rate
 *   PING:              i64 payload
 *   START_APP:         u32 length, UTF-8 component or package name
 *   (the other types have no payload)
 *
 * Touch positions are expressed in video frame coordinates (the frame size is sent to detect rotations in progress).
 */
public final class Controller {

    public static final int TYPE_KEY = 0;
    public static final int TYPE_TEXT = 1;
    public static final int TYPE_TOUCH = 2;
    public static final int TYPE_SCROLL = 3;
    public static final int TYPE_BACK_OR_SCREEN_ON = 4;
    public static final int TYPE_EXPAND_NOTIFICATION_PANEL = 5;
    public static final int TYPE_EXPAND_SETTINGS_PANEL = 6;
    public static final int TYPE_COLLAPSE_PANELS = 7;
    public static final int TYPE_GET_CLIPBOARD = 8;
    public static final int TYPE_SET_CLIPBOARD = 9;
    public static final int TYPE_SET_DISPLAY_POWER = 10;
    public static final int TYPE_ROTATE_DEVICE = 11;
    public static final int TYPE_REQUEST_KEYFRAME = 12;
    public static final int TYPE_SET_BITRATE = 13;
    public static final int TYPE_PING = 14;
    public static final int TYPE_START_APP = 15;
    public static final int TYPE_RESET_VIDEO = 16;
    public static final int TYPE_RELEASE_ALL = 17;

    private static final int COPY_KEY_COPY = 1;
    private static final int COPY_KEY_CUT = 2;

    private static final int MAX_TEXT_LENGTH = 1 << 18;

    private final DataInputStream in;
    private final DeviceMessageSender sender;
    private final ScreenState screenState;
    private final VideoStreamer video;
    private final PowerState powerState;
    private final InputManagerWrapper inputManager = InputManagerWrapper.get();
    private final KeyCharacterMap charMap = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);

    private final PointersState pointers = new PointersState();
    private final MotionEvent.PointerProperties[] pointerProperties = new MotionEvent.PointerProperties[PointersState.MAX_POINTERS];
    private final MotionEvent.PointerCoords[] pointerCoords = new MotionEvent.PointerCoords[PointersState.MAX_POINTERS];
    private long lastTouchDown;

    public Controller(InputStream in, DeviceMessageSender sender, ScreenState screenState, VideoStreamer video, PowerState powerState) {
        this.in = new DataInputStream(in);
        this.sender = sender;
        this.screenState = screenState;
        this.video = video;
        this.powerState = powerState;
        for (int i = 0; i < PointersState.MAX_POINTERS; ++i) {
            pointerProperties[i] = new MotionEvent.PointerProperties();
            pointerCoords[i] = new MotionEvent.PointerCoords();
        }
    }

    /**
     * Process messages until the connection is closed.
     */
    public void run() throws IOException {
        try {
            while (true) {
                handleMessage();
            }
        } catch (EOFException e) {
            Ln.i("Control connection closed by the PC");
        } finally {
            releaseAllPointers();
        }
    }

    private void handleMessage() throws IOException {
        int type = in.readUnsignedByte();
        switch (type) {
            case TYPE_KEY: {
                int action = in.readUnsignedByte();
                int keyCode = in.readInt();
                int repeat = in.readInt();
                int metaState = in.readInt();
                injectKey(action, keyCode, repeat, metaState);
                break;
            }
            case TYPE_TEXT:
                injectText(readString());
                break;
            case TYPE_TOUCH: {
                int action = in.readUnsignedByte();
                long pointerId = in.readInt();
                float x = in.readFloat();
                float y = in.readFloat();
                int frameWidth = in.readUnsignedShort();
                int frameHeight = in.readUnsignedShort();
                float pressure = in.readUnsignedShort() / 65535f;
                PointF point = screenState.map(x, y, frameWidth, frameHeight);
                injectTouch(action, pointerId, point, pressure);
                break;
            }
            case TYPE_SCROLL: {
                float x = in.readFloat();
                float y = in.readFloat();
                int frameWidth = in.readUnsignedShort();
                int frameHeight = in.readUnsignedShort();
                float hScroll = in.readFloat();
                float vScroll = in.readFloat();
                PointF point = screenState.map(x, y, frameWidth, frameHeight);
                if (point != null) {
                    injectScroll(point, hScroll, vScroll);
                }
                break;
            }
            case TYPE_BACK_OR_SCREEN_ON: {
                int action = in.readUnsignedByte();
                if (Device.isInteractive()) {
                    injectKey(action, KeyEvent.KEYCODE_BACK, 0, 0);
                } else if (action == KeyEvent.ACTION_DOWN) {
                    pressReleaseKey(KeyEvent.KEYCODE_WAKEUP);
                }
                break;
            }
            case TYPE_EXPAND_NOTIFICATION_PANEL:
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        Device.expandNotificationPanel();
                    }
                });
                break;
            case TYPE_EXPAND_SETTINGS_PANEL:
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        Device.expandSettingsPanel();
                    }
                });
                break;
            case TYPE_COLLAPSE_PANELS:
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        Device.collapsePanels();
                    }
                });
                break;
            case TYPE_GET_CLIPBOARD:
                getClipboard(in.readUnsignedByte());
                break;
            case TYPE_SET_CLIPBOARD: {
                long sequence = in.readLong();
                boolean paste = in.readUnsignedByte() != 0;
                String text = readString();
                setClipboard(text, paste, sequence);
                break;
            }
            case TYPE_SET_DISPLAY_POWER: {
                final boolean on = in.readUnsignedByte() != 0;
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        boolean ok = powerState.setScreenOn(on);
                        sender.sendEvent("screen", "on", on, "ok", ok);
                    }
                });
                break;
            }
            case TYPE_ROTATE_DEVICE: {
                final int displayId = screenState.getDisplayId();
                final int rotation = screenState.getRotation();
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        Device.rotateDevice(displayId, rotation);
                    }
                });
                break;
            }
            case TYPE_REQUEST_KEYFRAME:
                video.requestKeyFrame();
                break;
            case TYPE_SET_BITRATE:
                video.setBitRate(in.readInt());
                break;
            case TYPE_PING:
                sender.sendEvent("pong", "payload", in.readLong());
                break;
            case TYPE_START_APP: {
                final String target = readString();
                final int displayId = screenState.getDisplayId();
                runAsync(new Runnable() {
                    @Override
                    public void run() {
                        boolean ok = Device.startApp(target, displayId);
                        sender.sendEvent("app_started", "target", target, "ok", ok);
                    }
                });
                break;
            }
            case TYPE_RESET_VIDEO:
                video.requestReset();
                break;
            case TYPE_RELEASE_ALL:
                releaseAllPointers();
                break;
            default:
                throw new IOException("Unknown control message type: " + type);
        }
    }

    private String readString() throws IOException {
        int length = in.readInt();
        if (length < 0 || length > MAX_TEXT_LENGTH) {
            throw new IOException("Invalid string length: " + length);
        }
        byte[] bytes = new byte[length];
        in.readFully(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static void runAsync(Runnable runnable) {
        Thread thread = new Thread(runnable, "control-task");
        thread.setDaemon(true);
        thread.start();
    }

    private boolean inject(InputEvent event) {
        int displayId = screenState.getDisplayId();
        if (displayId > 0 && !InputManagerWrapper.setDisplayId(event, displayId)) {
            return false;
        }
        return inputManager.injectInputEvent(event, InputManagerWrapper.INJECT_INPUT_EVENT_MODE_ASYNC);
    }

    private boolean injectKey(int action, int keyCode, int repeat, int metaState) {
        long now = SystemClock.uptimeMillis();
        KeyEvent event = new KeyEvent(now, now, action, keyCode, repeat, metaState, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0,
                InputDevice.SOURCE_KEYBOARD);
        return inject(event);
    }

    private boolean pressReleaseKey(int keyCode) {
        return injectKey(KeyEvent.ACTION_DOWN, keyCode, 0, 0) && injectKey(KeyEvent.ACTION_UP, keyCode, 0, 0);
    }

    private void injectText(String text) {
        StringBuilder notInjectable = new StringBuilder();
        for (char c : text.toCharArray()) {
            KeyEvent[] events = charMap.getEvents(new char[] {c});
            if (events == null) {
                notInjectable.append(c);
                continue;
            }
            pasteText(notInjectable);
            for (KeyEvent event : events) {
                inject(event);
            }
        }
        pasteText(notInjectable);
    }

    /**
     * Characters which cannot be typed with the virtual keyboard (e.g. "š", "ć") are pasted through the clipboard.
     */
    private void pasteText(StringBuilder text) {
        if (text.length() == 0) {
            return;
        }
        if (Device.setClipboardText(text.toString())) {
            pressReleaseKey(KeyEvent.KEYCODE_PASTE);
        }
        text.setLength(0);
    }

    private void injectTouch(int action, long pointerId, PointF point, float pressure) {
        int index = pointers.indexOf(pointerId);
        if (action == MotionEvent.ACTION_DOWN) {
            if (point == null) {
                return;
            }
            if (index != -1) {
                // already down: this is a move
                action = MotionEvent.ACTION_MOVE;
            } else {
                index = pointers.getOrCreate(pointerId);
                if (index == -1) {
                    Ln.w("Too many pointers");
                    return;
                }
            }
        } else {
            if (index == -1) {
                // move or up for a pointer which is not down: ignore
                return;
            }
            if (point == null && action == MotionEvent.ACTION_MOVE) {
                return;
            }
        }

        PointersState.Pointer pointer = pointers.get(index);
        if (point != null) {
            pointer.x = point.x;
            pointer.y = point.y;
        }
        pointer.pressure = action == MotionEvent.ACTION_UP ? 0f : pressure;
        pointer.up = action == MotionEvent.ACTION_UP;

        long now = SystemClock.uptimeMillis();
        int count = pointers.update(pointerProperties, pointerCoords);
        int motionAction = action;
        if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_UP) {
            if (count == 1) {
                if (action == MotionEvent.ACTION_DOWN) {
                    lastTouchDown = now;
                }
            } else {
                // secondary pointers use ACTION_POINTER_DOWN/UP with the index of the pointer
                int pointerAction = action == MotionEvent.ACTION_DOWN ? MotionEvent.ACTION_POINTER_DOWN : MotionEvent.ACTION_POINTER_UP;
                motionAction = pointerAction | (index << MotionEvent.ACTION_POINTER_INDEX_SHIFT);
            }
        }

        MotionEvent event = MotionEvent.obtain(lastTouchDown, now, motionAction, count, pointerProperties, pointerCoords, 0, 0, 1f, 1f,
                0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        inject(event);
        event.recycle();
    }

    private void releaseAllPointers() {
        List<Long> ids = pointers.getIds();
        for (int i = ids.size() - 1; i >= 0; --i) {
            injectTouch(MotionEvent.ACTION_UP, ids.get(i), null, 0f);
        }
    }

    private void injectScroll(PointF point, float hScroll, float vScroll) {
        long now = SystemClock.uptimeMillis();
        MotionEvent.PointerProperties props = new MotionEvent.PointerProperties();
        props.id = 0;
        props.toolType = MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords coords = new MotionEvent.PointerCoords();
        coords.x = point.x;
        coords.y = point.y;
        coords.setAxisValue(MotionEvent.AXIS_HSCROLL, hScroll);
        coords.setAxisValue(MotionEvent.AXIS_VSCROLL, vScroll);
        MotionEvent event = MotionEvent.obtain(now, now, MotionEvent.ACTION_SCROLL, 1, new MotionEvent.PointerProperties[] {props},
                new MotionEvent.PointerCoords[] {coords}, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0);
        inject(event);
        event.recycle();
    }

    private void getClipboard(final int copyKey) {
        if (copyKey == COPY_KEY_COPY) {
            pressReleaseKey(KeyEvent.KEYCODE_COPY);
        } else if (copyKey == COPY_KEY_CUT) {
            pressReleaseKey(KeyEvent.KEYCODE_CUT);
        }
        runAsync(new Runnable() {
            @Override
            public void run() {
                if (copyKey != 0) {
                    // let the app process the copy key
                    SystemClock.sleep(150);
                }
                String text = Device.getClipboardText();
                if (text != null) {
                    sender.sendClipboard(text);
                }
            }
        });
    }

    private void setClipboard(String text, boolean paste, long sequence) {
        boolean ok = Device.setClipboardText(text);
        if (ok && paste) {
            pressReleaseKey(KeyEvent.KEYCODE_PASTE);
        }
        if (sequence != 0) {
            sender.sendAckClipboard(sequence);
        }
    }
}
