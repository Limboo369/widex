package com.beam.server.wrappers;

import android.content.Context;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.view.Surface;

import com.beam.server.FakeContext;
import com.beam.server.Ln;
import com.beam.server.Size;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Access to the hidden parts of the display manager (android.hardware.display.DisplayManagerGlobal).
 */
public final class DisplayManagerWrapper {

    // Hidden constants from DisplayManager
    public static final int VIRTUAL_DISPLAY_FLAG_PUBLIC = 1;
    public static final int VIRTUAL_DISPLAY_FLAG_PRESENTATION = 1 << 1;
    public static final int VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY = 1 << 3;
    public static final int VIRTUAL_DISPLAY_FLAG_SUPPORTS_TOUCH = 1 << 6;
    public static final int VIRTUAL_DISPLAY_FLAG_ROTATES_WITH_CONTENT = 1 << 7;
    public static final int VIRTUAL_DISPLAY_FLAG_DESTROY_CONTENT_ON_REMOVAL = 1 << 8;
    public static final int VIRTUAL_DISPLAY_FLAG_SHOULD_SHOW_SYSTEM_DECORATIONS = 1 << 9;
    public static final int VIRTUAL_DISPLAY_FLAG_TRUSTED = 1 << 10;
    public static final int VIRTUAL_DISPLAY_FLAG_OWN_DISPLAY_GROUP = 1 << 11;
    public static final int VIRTUAL_DISPLAY_FLAG_ALWAYS_UNLOCKED = 1 << 12;
    public static final int VIRTUAL_DISPLAY_FLAG_TOUCH_FEEDBACK_DISABLED = 1 << 13;
    public static final int VIRTUAL_DISPLAY_FLAG_OWN_FOCUS = 1 << 14;
    public static final int VIRTUAL_DISPLAY_FLAG_DEVICE_DISPLAY_GROUP = 1 << 15;

    private static DisplayManagerWrapper instance;

    private final Object global; // android.hardware.display.DisplayManagerGlobal
    private Method getDisplayInfoMethod;

    private DisplayManagerWrapper(Object global) {
        this.global = global;
    }

    public static synchronized DisplayManagerWrapper get() {
        if (instance == null) {
            try {
                Class<?> cls = Class.forName("android.hardware.display.DisplayManagerGlobal");
                Method getInstance = cls.getDeclaredMethod("getInstance");
                instance = new DisplayManagerWrapper(getInstance.invoke(null));
            } catch (ReflectiveOperationException e) {
                throw new AssertionError(e);
            }
        }
        return instance;
    }

    public DisplayInfo getDisplayInfo(int displayId) {
        try {
            if (getDisplayInfoMethod == null) {
                getDisplayInfoMethod = global.getClass().getMethod("getDisplayInfo", int.class);
            }
            Object info = getDisplayInfoMethod.invoke(global, displayId);
            if (info == null) {
                return null;
            }
            Class<?> cls = info.getClass();
            int width = cls.getDeclaredField("logicalWidth").getInt(info);
            int height = cls.getDeclaredField("logicalHeight").getInt(info);
            int rotation = cls.getDeclaredField("rotation").getInt(info);
            int layerStack = cls.getDeclaredField("layerStack").getInt(info);
            int flags = cls.getDeclaredField("flags").getInt(info);
            int dpi = cls.getDeclaredField("logicalDensityDpi").getInt(info);
            return new DisplayInfo(displayId, new Size(width, height), rotation, layerStack, flags, dpi);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }

    public int[] getDisplayIds() {
        try {
            return (int[]) global.getClass().getMethod("getDisplayIds").invoke(global);
        } catch (ReflectiveOperationException e) {
            Ln.w("Could not list displays", e);
            return new int[] {0};
        }
    }

    /**
     * Create a virtual display mirroring an existing display (hidden static method, available on recent Android versions).
     */
    public VirtualDisplay createMirror(String name, int width, int height, int displayIdToMirror, Surface surface) throws Exception {
        Method method = DisplayManager.class.getMethod("createVirtualDisplay", String.class, int.class, int.class, int.class,
                Surface.class);
        return (VirtualDisplay) method.invoke(null, name, width, height, displayIdToMirror, surface);
    }

    /**
     * Create a new (non-mirroring) virtual display, where apps can be launched.
     */
    public VirtualDisplay createNewDisplay(String name, int width, int height, int dpi, Surface surface, int flags) throws Exception {
        Constructor<DisplayManager> constructor = DisplayManager.class.getDeclaredConstructor(Context.class);
        constructor.setAccessible(true);
        DisplayManager displayManager = constructor.newInstance(FakeContext.get());
        return displayManager.createVirtualDisplay(name, width, height, dpi, surface, flags);
    }

    /**
     * Turn a display on or off without changing the power state of the device (Android 15+).
     *
     * Android 15: requestDisplayPower(int displayId, boolean on)
     * Android 16+: requestDisplayPower(int displayId, int state) with Display.STATE_OFF / Display.STATE_ON
     */
    public boolean requestDisplayPower(int displayId, boolean on) throws ReflectiveOperationException {
        ReflectiveOperationException lastError = null;
        for (Object target : new Object[] {global, getBinderInterface()}) {
            if (target == null) {
                continue;
            }
            try {
                Method method = target.getClass().getMethod("requestDisplayPower", int.class, boolean.class);
                Object result = method.invoke(target, displayId, on);
                return !(result instanceof Boolean) || (Boolean) result;
            } catch (NoSuchMethodException e) {
                lastError = e;
            }
            try {
                Method method = target.getClass().getMethod("requestDisplayPower", int.class, int.class);
                int state = on ? android.view.Display.STATE_ON : android.view.Display.STATE_OFF;
                Object result = method.invoke(target, displayId, state);
                return !(result instanceof Boolean) || (Boolean) result;
            } catch (NoSuchMethodException e) {
                lastError = e;
            }
        }
        throw lastError != null ? lastError : new NoSuchMethodException("requestDisplayPower");
    }

    private Object getBinderInterface() {
        try {
            Field field = global.getClass().getDeclaredField("mDm");
            field.setAccessible(true);
            return field.get(global);
        } catch (ReflectiveOperationException e) {
            return null;
        }
    }
}
