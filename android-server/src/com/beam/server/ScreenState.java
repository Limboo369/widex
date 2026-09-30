package com.beam.server;

import android.graphics.PointF;

/**
 * Current geometry of the stream, shared between the video thread (writer) and the control thread (reader).
 */
public final class ScreenState {

    private Size videoSize;
    private Size displaySize;
    private int displayId;
    private int rotation;

    public synchronized void update(Size videoSize, Size displaySize, int displayId, int rotation) {
        this.videoSize = videoSize;
        this.displaySize = displaySize;
        this.displayId = displayId;
        this.rotation = rotation;
    }

    /**
     * Convert a position in the video frame (as seen by the PC) to display coordinates.
     *
     * @return null if the frame size does not match the current video size (e.g. during a rotation)
     */
    public synchronized PointF map(float x, float y, int frameWidth, int frameHeight) {
        if (videoSize == null || displaySize == null) {
            return null;
        }
        if (frameWidth != videoSize.width || frameHeight != videoSize.height) {
            return null;
        }
        float px = x * displaySize.width / videoSize.width;
        float py = y * displaySize.height / videoSize.height;
        px = Math.max(0, Math.min(displaySize.width - 1, px));
        py = Math.max(0, Math.min(displaySize.height - 1, py));
        return new PointF(px, py);
    }

    public synchronized int getDisplayId() {
        return displayId;
    }

    public synchronized int getRotation() {
        return rotation;
    }

    public synchronized Size getVideoSize() {
        return videoSize;
    }
}
