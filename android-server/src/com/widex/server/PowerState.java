package com.widex.server;

/**
 * Track whether the server turned the phone screen off, to restore it at the end.
 */
public final class PowerState {

    private final int displayId;
    private CleanUp cleanUp;
    private boolean screenOff;

    public PowerState(int displayId) {
        this.displayId = displayId;
    }

    public synchronized boolean setScreenOn(boolean on) {
        if (!on && cleanUp == null) {
            try {
                cleanUp = CleanUp.start();
            } catch (Exception e) {
                Ln.w("Could not start the cleanup process", e);
            }
        }
        boolean ok = Device.setDisplayPower(displayId, on);
        if (ok) {
            screenOff = !on;
            if (cleanUp != null) {
                cleanUp.setScreenOff(screenOff);
            }
        }
        return ok;
    }

    public synchronized void restore() {
        if (screenOff) {
            Device.setDisplayPower(displayId, true);
            screenOff = false;
        }
        if (cleanUp != null) {
            cleanUp.finish();
            cleanUp = null;
        }
    }
}
