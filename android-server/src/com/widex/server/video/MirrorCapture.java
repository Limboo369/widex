package com.widex.server.video;

import android.graphics.Rect;
import android.hardware.display.VirtualDisplay;
import android.os.Build;
import android.os.IBinder;
import android.view.Surface;

import com.widex.server.Ln;
import com.widex.server.Size;
import com.widex.server.wrappers.DisplayInfo;
import com.widex.server.wrappers.DisplayManagerWrapper;
import com.widex.server.wrappers.SurfaceControlWrapper;

import java.io.IOException;

/**
 * Mirror an existing display (the phone screen), scaled down to the requested size.
 */
public final class MirrorCapture implements Capture {

    private static final int[] DOWNSIZE_STEPS = {2560, 1920, 1600, 1280, 1024, 800};

    private final int displayId;
    private int maxSize;

    private DisplayInfo displayInfo;
    private Size videoSize;

    private VirtualDisplay virtualDisplay;
    private IBinder surfaceControlDisplay;

    public MirrorCapture(int displayId, int maxSize) {
        this.displayId = displayId;
        this.maxSize = maxSize;
    }

    @Override
    public synchronized Size prepare() {
        displayInfo = DisplayManagerWrapper.get().getDisplayInfo(displayId);
        if (displayInfo == null) {
            throw new IllegalStateException("Display " + displayId + " not found");
        }
        videoSize = displayInfo.size.limitAndRound(maxSize);
        Ln.i("Mirroring " + displayInfo + " -> video " + videoSize);
        return videoSize;
    }

    @Override
    public synchronized void start(Surface surface) throws Exception {
        try {
            virtualDisplay = DisplayManagerWrapper.get().createMirror("widex", videoSize.width, videoSize.height, displayId, surface);
            Ln.d("Mirror: using the DisplayManager API");
        } catch (Exception displayManagerException) {
            try {
                boolean secure = Build.VERSION.SDK_INT < 30;
                surfaceControlDisplay = SurfaceControlWrapper.createDisplay("widex", secure);
                Rect layerStackRect = new Rect(0, 0, displayInfo.size.width, displayInfo.size.height);
                Rect displayRect = new Rect(0, 0, videoSize.width, videoSize.height);
                SurfaceControlWrapper.openTransaction();
                try {
                    SurfaceControlWrapper.setDisplaySurface(surfaceControlDisplay, surface);
                    SurfaceControlWrapper.setDisplayProjection(surfaceControlDisplay, 0, layerStackRect, displayRect);
                    SurfaceControlWrapper.setDisplayLayerStack(surfaceControlDisplay, displayInfo.layerStack);
                } finally {
                    SurfaceControlWrapper.closeTransaction();
                }
                Ln.d("Mirror: using the SurfaceControl API");
            } catch (Exception surfaceControlException) {
                Ln.e("Could not mirror with DisplayManager", displayManagerException);
                Ln.e("Could not mirror with SurfaceControl", surfaceControlException);
                throw new IOException("Could not capture the display");
            }
        }
    }

    @Override
    public synchronized void stop() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (surfaceControlDisplay != null) {
            SurfaceControlWrapper.destroyDisplay(surfaceControlDisplay);
            surfaceControlDisplay = null;
        }
    }

    @Override
    public void release() {
        stop();
    }

    @Override
    public boolean isInvalidated() {
        DisplayInfo current = DisplayManagerWrapper.get().getDisplayInfo(displayId);
        synchronized (this) {
            return current != null && displayInfo != null && !current.size.equals(displayInfo.size);
        }
    }

    @Override
    public synchronized boolean downsize() {
        int current = maxSize > 0 ? maxSize : displayInfo != null ? displayInfo.size.getMax() : 4096;
        for (int step : DOWNSIZE_STEPS) {
            if (step < current) {
                Ln.w("Retrying with a lower resolution: " + step);
                maxSize = step;
                return true;
            }
        }
        return false;
    }

    @Override
    public int getTargetDisplayId() {
        return displayId;
    }

    @Override
    public synchronized Size getDisplaySize() {
        return displayInfo.size;
    }

    @Override
    public synchronized int getRotation() {
        return displayInfo.rotation;
    }
}
