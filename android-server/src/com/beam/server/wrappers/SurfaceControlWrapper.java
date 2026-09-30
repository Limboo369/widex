package com.beam.server.wrappers;

import android.graphics.Rect;
import android.os.IBinder;
import android.view.Surface;

import com.beam.server.Ln;

import java.lang.reflect.Method;

/**
 * Hidden static methods of android.view.SurfaceControl (used on older Android versions, and to power displays off).
 */
public final class SurfaceControlWrapper {

    public static final int POWER_MODE_OFF = 0;
    public static final int POWER_MODE_NORMAL = 2;

    private static final Class<?> CLASS;

    static {
        try {
            CLASS = Class.forName("android.view.SurfaceControl");
        } catch (ClassNotFoundException e) {
            throw new AssertionError(e);
        }
    }

    private SurfaceControlWrapper() {
        // not instantiable
    }

    public static void openTransaction() throws ReflectiveOperationException {
        CLASS.getMethod("openTransaction").invoke(null);
    }

    public static void closeTransaction() throws ReflectiveOperationException {
        CLASS.getMethod("closeTransaction").invoke(null);
    }

    public static void setDisplayProjection(IBinder displayToken, int orientation, Rect layerStackRect, Rect displayRect)
            throws ReflectiveOperationException {
        CLASS.getMethod("setDisplayProjection", IBinder.class, int.class, Rect.class, Rect.class)
                .invoke(null, displayToken, orientation, layerStackRect, displayRect);
    }

    public static void setDisplayLayerStack(IBinder displayToken, int layerStack) throws ReflectiveOperationException {
        CLASS.getMethod("setDisplayLayerStack", IBinder.class, int.class).invoke(null, displayToken, layerStack);
    }

    public static void setDisplaySurface(IBinder displayToken, Surface surface) throws ReflectiveOperationException {
        CLASS.getMethod("setDisplaySurface", IBinder.class, Surface.class).invoke(null, displayToken, surface);
    }

    public static IBinder createDisplay(String name, boolean secure) throws ReflectiveOperationException {
        return (IBinder) CLASS.getMethod("createDisplay", String.class, boolean.class).invoke(null, name, secure);
    }

    public static void destroyDisplay(IBinder displayToken) {
        try {
            CLASS.getMethod("destroyDisplay", IBinder.class).invoke(null, displayToken);
        } catch (ReflectiveOperationException e) {
            Ln.w("Could not destroy display", e);
        }
    }

    public static boolean hasPhysicalDisplayIdsMethod() {
        try {
            CLASS.getMethod("getPhysicalDisplayIds");
            return true;
        } catch (NoSuchMethodException e) {
            return false;
        }
    }

    public static long[] getPhysicalDisplayIds() throws ReflectiveOperationException {
        return (long[]) CLASS.getMethod("getPhysicalDisplayIds").invoke(null);
    }

    public static IBinder getPhysicalDisplayToken(long physicalDisplayId) throws ReflectiveOperationException {
        return (IBinder) CLASS.getMethod("getPhysicalDisplayToken", long.class).invoke(null, physicalDisplayId);
    }

    public static IBinder getBuiltInDisplay() throws ReflectiveOperationException {
        // Android < 10
        return (IBinder) CLASS.getMethod("getBuiltInDisplay", int.class).invoke(null, 0);
    }

    public static boolean setDisplayPowerMode(IBinder displayToken, int mode) {
        try {
            CLASS.getMethod("setDisplayPowerMode", IBinder.class, int.class).invoke(null, displayToken, mode);
            return true;
        } catch (ReflectiveOperationException e) {
            Ln.w("Could not set display power mode", e);
            return false;
        }
    }
}
