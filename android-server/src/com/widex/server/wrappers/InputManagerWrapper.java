package com.widex.server.wrappers;

import android.view.InputEvent;
import android.view.MotionEvent;

import com.widex.server.Ln;

import java.lang.reflect.Method;

/**
 * Inject input events (requires the INJECT_EVENTS permission, granted to the shell user).
 */
public final class InputManagerWrapper {

    public static final int INJECT_INPUT_EVENT_MODE_ASYNC = 0;
    public static final int INJECT_INPUT_EVENT_MODE_WAIT_FOR_RESULT = 1;

    private static InputManagerWrapper instance;
    private static Method setDisplayIdMethod;
    private static Method setActionButtonMethod;

    private final Object manager;
    private final Method injectMethod;

    private InputManagerWrapper(Object manager, Method injectMethod) {
        this.manager = manager;
        this.injectMethod = injectMethod;
    }

    public static synchronized InputManagerWrapper get() {
        if (instance == null) {
            try {
                Class<?> cls;
                try {
                    // Android 14+: moved to InputManagerGlobal
                    cls = Class.forName("android.hardware.input.InputManagerGlobal");
                } catch (ClassNotFoundException e) {
                    cls = android.hardware.input.InputManager.class;
                }
                Method getInstance = cls.getDeclaredMethod("getInstance");
                Object manager = getInstance.invoke(null);
                Method inject = manager.getClass().getMethod("injectInputEvent", InputEvent.class, int.class);
                instance = new InputManagerWrapper(manager, inject);
            } catch (ReflectiveOperationException e) {
                throw new AssertionError(e);
            }
        }
        return instance;
    }

    public boolean injectInputEvent(InputEvent event, int mode) {
        try {
            return (Boolean) injectMethod.invoke(manager, event, mode);
        } catch (ReflectiveOperationException e) {
            Ln.e("Could not inject input event", e);
            return false;
        }
    }

    public static boolean setDisplayId(InputEvent event, int displayId) {
        try {
            if (setDisplayIdMethod == null) {
                setDisplayIdMethod = InputEvent.class.getMethod("setDisplayId", int.class);
            }
            setDisplayIdMethod.invoke(event, displayId);
            return true;
        } catch (ReflectiveOperationException e) {
            Ln.e("Could not set input event display id", e);
            return false;
        }
    }

    public static boolean setActionButton(MotionEvent event, int actionButton) {
        try {
            if (setActionButtonMethod == null) {
                setActionButtonMethod = MotionEvent.class.getMethod("setActionButton", int.class);
            }
            setActionButtonMethod.invoke(event, actionButton);
            return true;
        } catch (ReflectiveOperationException e) {
            Ln.e("Could not set action button", e);
            return false;
        }
    }
}
