package com.widex.server.wrappers;

import com.widex.server.Size;

public final class DisplayInfo {

    public final int displayId;
    /** Logical size, already taking the current rotation into account. */
    public final Size size;
    public final int rotation;
    public final int layerStack;
    public final int flags;
    public final int dpi;

    public DisplayInfo(int displayId, Size size, int rotation, int layerStack, int flags, int dpi) {
        this.displayId = displayId;
        this.size = size;
        this.rotation = rotation;
        this.layerStack = layerStack;
        this.flags = flags;
        this.dpi = dpi;
    }

    @Override
    public String toString() {
        return "display " + displayId + " " + size + " rotation=" + rotation + " dpi=" + dpi;
    }
}
