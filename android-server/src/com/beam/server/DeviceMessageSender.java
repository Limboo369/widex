package com.beam.server;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Messages from the device to the PC, on the control socket.
 *
 *   u8 type
 *   CLIPBOARD:     u32 length, UTF-8 text
 *   ACK_CLIPBOARD: u64 sequence
 *   EVENT:         u32 length, UTF-8 JSON
 */
public final class DeviceMessageSender {

    public static final int TYPE_CLIPBOARD = 0;
    public static final int TYPE_ACK_CLIPBOARD = 1;
    public static final int TYPE_EVENT = 2;

    private final DataOutputStream out;
    private volatile boolean broken;

    public DeviceMessageSender(OutputStream out) {
        this.out = new DataOutputStream(out);
    }

    public synchronized void sendClipboard(String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        try {
            out.writeByte(TYPE_CLIPBOARD);
            out.writeInt(bytes.length);
            out.write(bytes);
            out.flush();
        } catch (IOException e) {
            onError(e);
        }
    }

    public synchronized void sendAckClipboard(long sequence) {
        try {
            out.writeByte(TYPE_ACK_CLIPBOARD);
            out.writeLong(sequence);
            out.flush();
        } catch (IOException e) {
            onError(e);
        }
    }

    public synchronized void sendEvent(JSONObject event) {
        byte[] bytes = event.toString().getBytes(StandardCharsets.UTF_8);
        try {
            out.writeByte(TYPE_EVENT);
            out.writeInt(bytes.length);
            out.write(bytes);
            out.flush();
        } catch (IOException e) {
            onError(e);
        }
    }

    public void sendEvent(String name, Object... keyValues) {
        try {
            JSONObject event = new JSONObject();
            event.put("event", name);
            for (int i = 0; i + 1 < keyValues.length; i += 2) {
                event.put((String) keyValues[i], keyValues[i + 1]);
            }
            sendEvent(event);
        } catch (JSONException e) {
            Ln.e("Could not create event", e);
        }
    }

    public void sendError(String message) {
        sendEvent("error", "message", message);
    }

    private void onError(IOException e) {
        if (!broken) {
            broken = true;
            Ln.d("Could not send device message: " + e);
        }
    }
}
