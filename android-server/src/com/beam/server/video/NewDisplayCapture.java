package com.beam.server.video;

import android.hardware.display.VirtualDisplay;
import android.os.Build;
import android.view.Surface;

import com.beam.server.Ln;
import com.beam.server.Size;
import com.beam.server.wrappers.DisplayManagerWrapper;

/**
 * Create a new virtual display (a separate "desktop" screen), where apps can be launched.
 */
public final class NewDisplayCapture implements Capture {

    private final Size size;
    private final int dpi;

    private VirtualDisplay virtualDisplay;
    private int displayId = -1;

    public NewDisplayCapture(Size size, int dpi) {
        this.size = size;
        this.dpi = dpi;
    }

    /**
     * Parse "WIDTHxHEIGHT/DPI" (the DPI is optional).
     */
    public static NewDisplayCapture parse(String value) {
        int dpi = 240;
        String sizePart = value;
        int slash = value.indexOf('/');
        if (slash != -1) {
            dpi = Integer.parseInt(value.substring(slash + 1));
            sizePart = value.substring(0, slash);
        }
        int x = sizePart.indexOf('x');
        int width = Integer.parseInt(sizePart.substring(0, x)) & ~7;
        int height = Integer.parseInt(sizePart.substring(x + 1)) & ~7;
        return new NewDisplayCapture(new Size(width, height), dpi);
    }

    @Override
    public Size prepare() {
        return size;
    }

    @Override
    public synchronized void start(Surface surface) throws Exception {
        if (virtualDisplay == null) {
            int flags = DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_PUBLIC
                    | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY
                    | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_SUPPORTS_TOUCH
                    | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_DESTROY_CONTENT_ON_REMOVAL
                    | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_SHOULD_SHOW_SYSTEM_DECORATIONS;
            if (Build.VERSION.SDK_INT >= 33) {
                flags |= DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_TRUSTED
                        | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_OWN_DISPLAY_GROUP
                        | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_ALWAYS_UNLOCKED
                        | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_TOUCH_FEEDBACK_DISABLED;
                if (Build.VERSION.SDK_INT >= 34) {
                    flags |= DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_OWN_FOCUS
                            | DisplayManagerWrapper.VIRTUAL_DISPLAY_FLAG_DEVICE_DISPLAY_GROUP;
                }
            }
            virtualDisplay = DisplayManagerWrapper.get().createNewDisplay("beam", size.width, size.height, dpi, surface, flags);
            displayId = virtualDisplay.getDisplay().getDisplayId();
            Ln.i("New virtual display " + displayId + " (" + size + ", " + dpi + " dpi)");
        } else {
            virtualDisplay.setSurface(surface);
        }
    }

    @Override
    public synchronized void stop() {
        if (virtualDisplay != null) {
            virtualDisplay.setSurface(null);
        }
    }

    @Override
    public synchronized void release() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
    }

    @Override
    public boolean isInvalidated() {
        return false;
    }

    @Override
    public boolean downsize() {
        return false;
    }

    @Override
    public synchronized int getTargetDisplayId() {
        return displayId;
    }

    @Override
    public Size getDisplaySize() {
        return size;
    }

    @Override
    public int getRotation() {
        return 0;
    }
}
