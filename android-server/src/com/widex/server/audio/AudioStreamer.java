package com.widex.server.audio;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;

import com.widex.server.FakeContext;
import com.widex.server.Ln;
import com.widex.server.PacketWriter;

import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * Capture the device audio output (the sound of the game) and send it as raw PCM (48 kHz, stereo, 16-bit).
 * While capturing with REMOTE_SUBMIX, Android does not play the sound on the phone speaker.
 */
public final class AudioStreamer {

    public static final int SAMPLE_RATE = 48000;
    public static final int CHANNELS = 2;
    private static final int BYTES_PER_FRAME = CHANNELS * 2;
    private static final int READ_FRAMES = SAMPLE_RATE / 100; // 10 ms per packet

    private final PacketWriter writer;
    private volatile boolean stopped;
    private AudioRecord recorder;

    public AudioStreamer(PacketWriter writer) {
        this.writer = writer;
    }

    @TargetApi(31)
    @SuppressLint("MissingPermission")
    private static AudioRecord createAudioRecord() {
        AudioRecord.Builder builder = new AudioRecord.Builder();
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setContext(FakeContext.get());
        }
        builder.setAudioSource(MediaRecorder.AudioSource.REMOTE_SUBMIX);
        builder.setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                .build());
        int minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBufferSize > 0) {
            builder.setBufferSizeInBytes(4 * minBufferSize);
        }
        return builder.build();
    }

    public void stream() throws IOException {
        if (Build.VERSION.SDK_INT < 31) {
            throw new IOException("Audio capture requires Android 12 or newer");
        }
        try {
            recorder = createAudioRecord();
        } catch (Exception e) {
            throw new IOException("Could not create the audio recorder: " + e.getMessage(), e);
        }
        try {
            recorder.startRecording();
        } catch (Exception e) {
            recorder.release();
            throw new IOException("Could not start the audio recorder: " + e.getMessage(), e);
        }
        if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            recorder.release();
            throw new IOException("The audio recorder did not start");
        }

        try {
            writer.writeSession(PacketWriter.CODEC_RAW, SAMPLE_RATE, CHANNELS);
            Ln.i("Audio capture started");
            byte[] data = new byte[READ_FRAMES * BYTES_PER_FRAME];
            ByteBuffer buffer = ByteBuffer.wrap(data);
            while (!stopped) {
                int r = recorder.read(data, 0, data.length);
                if (r < 0) {
                    throw new IOException("Audio read error: " + r);
                }
                if (r == 0) {
                    continue;
                }
                buffer.clear();
                buffer.limit(r);
                writer.writePacket(PacketWriter.TYPE_DELTA, System.nanoTime() / 1000, buffer);
            }
        } finally {
            try {
                recorder.stop();
            } catch (IllegalStateException e) {
                // ignore
            }
            recorder.release();
        }
    }

    public void stop() {
        stopped = true;
    }
}
