package com.widex.server.control;

import android.view.MotionEvent;

import java.util.ArrayList;
import java.util.List;

/**
 * State of all the "fingers" currently touching the screen (multi-touch).
 */
public final class PointersState {

    public static final int MAX_POINTERS = 10;

    public static final class Pointer {
        final long id;       // id chosen by the PC
        final int localId;   // id in the MotionEvent (0..9)
        float x;
        float y;
        float pressure;
        boolean up;

        Pointer(long id, int localId) {
            this.id = id;
            this.localId = localId;
        }
    }

    private final List<Pointer> pointers = new ArrayList<>();

    public int indexOf(long id) {
        for (int i = 0; i < pointers.size(); ++i) {
            if (pointers.get(i).id == id) {
                return i;
            }
        }
        return -1;
    }

    private boolean isLocalIdAvailable(int localId) {
        for (Pointer pointer : pointers) {
            if (pointer.localId == localId) {
                return false;
            }
        }
        return true;
    }

    private int nextUnusedLocalId() {
        for (int localId = 0; localId < MAX_POINTERS; ++localId) {
            if (isLocalIdAvailable(localId)) {
                return localId;
            }
        }
        return -1;
    }

    public Pointer get(int index) {
        return pointers.get(index);
    }

    public int size() {
        return pointers.size();
    }

    /**
     * Return the index of the pointer (create it if necessary), or -1 if the maximum number of pointers is reached.
     */
    public int getOrCreate(long id) {
        int index = indexOf(id);
        if (index != -1) {
            return index;
        }
        if (pointers.size() >= MAX_POINTERS) {
            return -1;
        }
        int localId = nextUnusedLocalId();
        pointers.add(new Pointer(id, localId));
        return pointers.size() - 1;
    }

    /**
     * Fill the MotionEvent arrays with all the pointers, then forget the pointers which went up.
     *
     * @return the number of pointers in the arrays
     */
    public int update(MotionEvent.PointerProperties[] props, MotionEvent.PointerCoords[] coords) {
        int count = pointers.size();
        for (int i = 0; i < count; ++i) {
            Pointer pointer = pointers.get(i);
            props[i].id = pointer.localId;
            props[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            coords[i].x = pointer.x;
            coords[i].y = pointer.y;
            coords[i].pressure = pointer.pressure;
            coords[i].size = 0.05f;
            coords[i].touchMajor = 12;
            coords[i].touchMinor = 12;
            coords[i].orientation = 0;
        }
        for (int i = pointers.size() - 1; i >= 0; --i) {
            if (pointers.get(i).up) {
                pointers.remove(i);
            }
        }
        return count;
    }

    public List<Long> getIds() {
        List<Long> ids = new ArrayList<>();
        for (Pointer pointer : pointers) {
            ids.add(pointer.id);
        }
        return ids;
    }
}
