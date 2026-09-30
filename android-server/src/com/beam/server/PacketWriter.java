package com.beam.server;

import java.io.FileDescriptor;
import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * Writes media packets to a socket.
 *
 * Packet format (big-endian):
 *   u8  type (see TYPE_*)
 *   u64 pts (microseconds)
 *   u32 payload size
 *   ... payload
 *
 * A SESSION packet is written each time the stream (re)starts; its payload is a list of u32 values:
 *   video: codec id, width, height, rotation, display id
 *   audio: codec id, sample rate, channels
 */
public final class PacketWriter {

    public static final int TYPE_SESSION = 0;
    public static final int TYPE_CONFIG = 1;
    public static final int TYPE_KEY = 2;
    public static final int TYPE_DELTA = 3;

    public static final int CODEC_H264 = 0x68323634; // "h264"
    public static final int CODEC_H265 = 0x68323635; // "h265"
    public static final int CODEC_RAW = 0x00726177; // "raw" (PCM s16le)

    private static final int HEADER_SIZE = 13;

    private final FileDescriptor fd;
    private final ByteBuffer header = ByteBuffer.allocate(HEADER_SIZE);

    public PacketWriter(FileDescriptor fd) {
        this.fd = fd;
    }

    public synchronized void writeSession(int... values) throws IOException {
        ByteBuffer payload = ByteBuffer.allocate(4 * values.length);
        for (int value : values) {
            payload.putInt(value);
        }
        payload.flip();
        writePacket(TYPE_SESSION, 0, payload);
    }

    public synchronized void writePacket(int type, long ptsUs, ByteBuffer payload) throws IOException {
        header.clear();
        header.put((byte) type);
        header.putLong(ptsUs);
        header.putInt(payload.remaining());
        header.flip();
        IO.writeFully(fd, header);
        IO.writeFully(fd, payload);
    }
}
