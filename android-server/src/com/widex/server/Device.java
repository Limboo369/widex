package com.widex.server;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import com.widex.server.wrappers.DisplayControlWrapper;
import com.widex.server.wrappers.DisplayManagerWrapper;
import com.widex.server.wrappers.SurfaceControlWrapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;

/**
 * Device-level helpers: display power, wake lock, clipboard, foreground app, shell commands.
 */
public final class Device {

    private static PowerManager.WakeLock wakeLock;

    private Device() {
        // not instantiable
    }

    public static String getModel() {
        return Build.MANUFACTURER + " " + Build.MODEL;
    }

    /**
     * Turn the physical screen on or off, while the device stays awake (apps keep running and rendering).
     */
    public static boolean setDisplayPower(int displayId, boolean on) {
        if (Build.VERSION.SDK_INT >= 35) {
            try {
                boolean ok = DisplayManagerWrapper.get().requestDisplayPower(displayId, on);
                Ln.i("Display power " + (on ? "on" : "off") + " (DisplayManager): " + ok);
                if (ok) {
                    return true;
                }
            } catch (ReflectiveOperationException e) {
                Ln.w("requestDisplayPower() failed, trying SurfaceControl", e);
            }
        }

        int mode = on ? SurfaceControlWrapper.POWER_MODE_NORMAL : SurfaceControlWrapper.POWER_MODE_OFF;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                boolean useDisplayControl = Build.VERSION.SDK_INT >= 34 && !SurfaceControlWrapper.hasPhysicalDisplayIdsMethod();
                long[] ids = useDisplayControl ? DisplayControlWrapper.getPhysicalDisplayIds() : SurfaceControlWrapper.getPhysicalDisplayIds();
                if (ids == null || ids.length == 0) {
                    Ln.w("No physical display found");
                    return false;
                }
                boolean allOk = true;
                for (long id : ids) {
                    IBinder token = useDisplayControl ? DisplayControlWrapper.getPhysicalDisplayToken(id)
                            : SurfaceControlWrapper.getPhysicalDisplayToken(id);
                    allOk &= token != null && SurfaceControlWrapper.setDisplayPowerMode(token, mode);
                }
                Ln.i("Display power " + (on ? "on" : "off") + " (SurfaceControl): " + allOk);
                return allOk;
            }
            IBinder token = SurfaceControlWrapper.getBuiltInDisplay();
            return token != null && SurfaceControlWrapper.setDisplayPowerMode(token, mode);
        } catch (Throwable e) {
            Ln.e("Could not change display power", e);
            return false;
        }
    }

    public static boolean isInteractive() {
        try {
            PowerManager pm = (PowerManager) FakeContext.get().getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isInteractive();
        } catch (Throwable e) {
            return true;
        }
    }

    /**
     * Keep the device awake while streaming (released automatically if the process dies).
     */
    @SuppressWarnings("deprecation")
    public static synchronized boolean acquireWakeLock() {
        if (wakeLock != null) {
            return true;
        }
        try {
            PowerManager pm = (PowerManager) FakeContext.get().getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock lock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK, "widex:stayawake");
            lock.setReferenceCounted(false);
            lock.acquire();
            wakeLock = lock;
            Ln.i("Wake lock acquired");
            return true;
        } catch (Throwable e) {
            Ln.w("Could not acquire wake lock", e);
            return false;
        }
    }

    public static synchronized void releaseWakeLock() {
        if (wakeLock != null) {
            try {
                wakeLock.release();
            } catch (Throwable e) {
                Ln.w("Could not release wake lock", e);
            }
            wakeLock = null;
        }
    }

    public static String getClipboardText() {
        try {
            ClipboardManager cm = (ClipboardManager) FakeContext.get().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) {
                return null;
            }
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) {
                return null;
            }
            CharSequence text = clip.getItemAt(0).getText();
            return text != null ? text.toString() : null;
        } catch (Throwable e) {
            Ln.w("Could not get clipboard", e);
            return null;
        }
    }

    public static boolean setClipboardText(String text) {
        try {
            ClipboardManager cm = (ClipboardManager) FakeContext.get().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) {
                return false;
            }
            cm.setPrimaryClip(ClipData.newPlainText("widex", text));
            return true;
        } catch (Throwable e) {
            Ln.w("Could not set clipboard", e);
            return false;
        }
    }

    /**
     * Return the component of the focused activity, or null.
     */
    public static ComponentName getFocusedActivity() {
        try {
            Object atm = Class.forName("android.app.ActivityTaskManager").getMethod("getService").invoke(null);
            Object info = null;
            try {
                Method method = atm.getClass().getMethod("getFocusedRootTaskInfo");
                info = method.invoke(atm);
            } catch (NoSuchMethodException e) {
                Method method = atm.getClass().getMethod("getFocusedStackInfo");
                info = method.invoke(atm);
            }
            if (info == null) {
                return null;
            }
            Object top = info.getClass().getField("topActivity").get(info);
            return (ComponentName) top;
        } catch (Throwable e) {
            Ln.d("Could not get focused activity: " + e);
            return null;
        }
    }

    /**
     * Execute a shell command (as the shell user), return its output (or null on error).
     */
    public static String exec(String... cmd) {
        try {
            Process process = Runtime.getRuntime().exec(cmd);
            StringBuilder output = new StringBuilder();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
            }
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                Ln.w("Command " + String.join(" ", cmd) + " returned " + exitCode);
            }
            return output.toString();
        } catch (Exception e) {
            Ln.w("Could not execute " + String.join(" ", cmd), e);
            return null;
        }
    }

    public static void expandNotificationPanel() {
        exec("cmd", "statusbar", "expand-notifications");
    }

    public static void expandSettingsPanel() {
        exec("cmd", "statusbar", "expand-settings");
    }

    public static void collapsePanels() {
        exec("cmd", "statusbar", "collapse");
    }

    /** Rotation settings before the first rotateDevice() call, restored at the end: "auto" or a locked rotation. */
    private static String savedRotation;

    /**
     * Rotate the device (lock the user rotation to the other orientation).
     */
    public static synchronized void rotateDevice(int displayId, int currentRotation) {
        if (savedRotation == null) {
            String accelerometer = exec("settings", "get", "system", "accelerometer_rotation");
            String userRotation = exec("settings", "get", "system", "user_rotation");
            boolean auto = accelerometer != null && "1".equals(accelerometer.trim());
            String locked = userRotation != null && userRotation.trim().matches("[0-3]") ? userRotation.trim() : "0";
            savedRotation = auto ? "auto" : locked;
        }
        int newRotation = (currentRotation & 1) ^ 1; // 0->1, 1->0, 2->1, 3->0
        String result = exec("cmd", "window", "user-rotation", "-d", String.valueOf(displayId), "lock", String.valueOf(newRotation));
        if (result == null) {
            exec("settings", "put", "system", "accelerometer_rotation", "0");
            exec("settings", "put", "system", "user_rotation", String.valueOf(newRotation));
        }
    }

    /**
     * Restore the rotation settings changed by rotateDevice() (called at the end of the session).
     */
    public static synchronized void restoreRotation(int displayId) {
        if (savedRotation == null) {
            return;
        }
        if ("auto".equals(savedRotation)) {
            exec("cmd", "window", "user-rotation", "-d", String.valueOf(displayId), "free");
        } else {
            exec("cmd", "window", "user-rotation", "-d", String.valueOf(displayId), "lock", savedRotation);
        }
        savedRotation = null;
    }

    public static boolean startApp(String target, int displayId) {
        String result;
        if (target.contains("/")) {
            if (displayId > 0) {
                result = exec("am", "start", "--display", String.valueOf(displayId), "-n", target);
            } else {
                result = exec("am", "start", "-n", target);
            }
        } else {
            // package name only: resolve its launcher activity
            String resolved = exec("cmd", "package", "resolve-activity", "--brief", "-c", "android.intent.category.LAUNCHER", target);
            String component = null;
            if (resolved != null) {
                String[] lines = resolved.trim().split("\n");
                String last = lines[lines.length - 1].trim();
                if (last.contains("/")) {
                    component = last;
                }
            }
            if (component == null) {
                result = exec("monkey", "-p", target, "-c", "android.intent.category.LAUNCHER", "1");
            } else {
                return startApp(component, displayId);
            }
        }
        return result != null;
    }
}
