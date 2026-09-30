package com.beam.server;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import java.io.FileDescriptor;
import java.io.IOException;
import java.nio.ByteBuffer;

public final class IO {

    private IO() {
        // not instantiable
    }

    public static void writeFully(FileDescriptor fd, ByteBuffer from) throws IOException {
        while (from.hasRemaining()) {
            try {
                Os.write(fd, from); // advances the buffer position
            } catch (ErrnoException e) {
                if (e.errno != OsConstants.EINTR) {
                    throw new IOException(e);
                }
            }
        }
    }
}
