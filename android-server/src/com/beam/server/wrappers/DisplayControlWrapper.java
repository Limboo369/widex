package com.beam.server.wrappers;

import android.os.IBinder;

import java.lang.reflect.Method;

/**
 * On Android 14, the physical display methods were moved from SurfaceControl to DisplayControl (in services.jar).
 */
public final class DisplayControlWrapper {

    private static Class<?> displayControlClass;

    private DisplayControlWrapper() {
        // not instantiable
    }

    private static synchronized Class<?> getDisplayControlClass() throws ReflectiveOperationException {
        if (displayControlClass == null) {
            Class<?> factoryClass = Class.forName("com.android.internal.os.ClassLoaderFactory");
            Method createClassLoader = factoryClass.getDeclaredMethod("createClassLoader", String.class, String.class, String.class,
                    ClassLoader.class, int.class, boolean.class, String.class);
            ClassLoader classLoader = (ClassLoader) createClassLoader.invoke(null, "/system/framework/services.jar", null, null,
                    ClassLoader.getSystemClassLoader(), 0, true, null);
            Class<?> cls = classLoader.loadClass("com.android.server.display.DisplayControl");

            Method loadLibrary = Runtime.class.getDeclaredMethod("loadLibrary0", Class.class, String.class);
            loadLibrary.setAccessible(true);
            loadLibrary.invoke(Runtime.getRuntime(), cls, "android_servers");
            displayControlClass = cls;
        }
        return displayControlClass;
    }

    public static long[] getPhysicalDisplayIds() throws ReflectiveOperationException {
        return (long[]) getDisplayControlClass().getMethod("getPhysicalDisplayIds").invoke(null);
    }

    public static IBinder getPhysicalDisplayToken(long physicalDisplayId) throws ReflectiveOperationException {
        return (IBinder) getDisplayControlClass().getMethod("getPhysicalDisplayToken", long.class).invoke(null, physicalDisplayId);
    }
}
