package com.beam.server.video;

import android.view.Surface;

import com.beam.server.Size;

/**
 * Source of the video frames: renders a display into the encoder input surface.
 */
public interface Capture {

    /**
     * Called before each encoding session.
     *
     * @return the video size
     */
    Size prepare() throws Exception;

    /** Start rendering into the surface. */
    void start(Surface surface) throws Exception;

    /** Stop rendering (between two encoding sessions). */
    void stop();

    /** Release everything (at the end). */
    void release();

    /** Polled periodically: return true if the capture must be restarted (e.g. the display was rotated). */
    boolean isInvalidated();

    /** Try to use a lower resolution after an encoder failure. Return false if not possible. */
    boolean downsize();

    /** Display where input events must be injected. */
    int getTargetDisplayId();

    /** Size of the display in its own coordinates (for input events). */
    Size getDisplaySize();

    int getRotation();
}
