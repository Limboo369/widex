package com.widex.server;

public final class Size {

    public final int width;
    public final int height;

    public Size(int width, int height) {
        this.width = width;
        this.height = height;
    }

    public int getMax() {
        return Math.max(width, height);
    }

    /**
     * Scale down (keeping the aspect ratio) so that the largest dimension is at most maxSize, then round both
     * dimensions to a multiple of 8 (required by many hardware encoders).
     */
    public Size limitAndRound(int maxSize) {
        int w = width;
        int h = height;
        if (maxSize > 0 && Math.max(w, h) > maxSize) {
            if (w >= h) {
                h = Math.round((float) h * maxSize / w);
                w = maxSize;
            } else {
                w = Math.round((float) w * maxSize / h);
                h = maxSize;
            }
        }
        w = Math.max(8, (w + 4) & ~7);
        h = Math.max(8, (h + 4) & ~7);
        if (maxSize > 0) {
            // rounding must not exceed the limit
            if (w > maxSize) {
                w = maxSize & ~7;
            }
            if (h > maxSize) {
                h = maxSize & ~7;
            }
        }
        return new Size(w, h);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Size)) {
            return false;
        }
        Size other = (Size) o;
        return width == other.width && height == other.height;
    }

    @Override
    public int hashCode() {
        return 31 * width + height;
    }

    @Override
    public String toString() {
        return width + "x" + height;
    }
}
