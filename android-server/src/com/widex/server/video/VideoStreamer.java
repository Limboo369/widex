package com.widex.server.video;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaFormat;
import android.os.Bundle;
import android.view.Surface;

import com.widex.server.Ln;
import com.widex.server.Options;
import com.widex.server.PacketWriter;
import com.widex.server.ScreenState;
import com.widex.server.Size;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Encode the captured display to H.264/H.265 with the hardware encoder and write the packets to the PC.
 * The encoder is restarted each time the capture is invalidated (rotation) or a reset is requested.
 */
public final class VideoStreamer {

    private static final int I_FRAME_INTERVAL_SECONDS = 10;
    private static final long REPEAT_FRAME_DELAY_US = 100_000; // repeat the last frame if the screen is static
    private static final long DEQUEUE_TIMEOUT_US = 100_000;
    private static final int WATCH_INTERVAL_MS = 150;

    private final Capture capture;
    private final Options options;
    private final PacketWriter writer;
    private final ScreenState screenState;

    private final AtomicBoolean resetRequested = new AtomicBoolean();
    private volatile boolean stopped;
    private volatile MediaCodec currentCodec;
    private volatile int bitRate;
    private volatile String encoderInUse = "";

    public VideoStreamer(Capture capture, Options options, PacketWriter writer, ScreenState screenState) {
        this.capture = capture;
        this.options = options;
        this.writer = writer;
        this.screenState = screenState;
        this.bitRate = options.videoBitRate;
    }

    public static String getMimeType(String codec) {
        return "h265".equals(codec) ? MediaFormat.MIMETYPE_VIDEO_HEVC : MediaFormat.MIMETYPE_VIDEO_AVC;
    }

    public static List<String> listEncoders(String mimeType) {
        List<String> result = new ArrayList<>();
        MediaCodecList list = new MediaCodecList(MediaCodecList.REGULAR_CODECS);
        for (MediaCodecInfo info : list.getCodecInfos()) {
            if (!info.isEncoder()) {
                continue;
            }
            for (String type : info.getSupportedTypes()) {
                if (type.equalsIgnoreCase(mimeType)) {
                    result.add(info.getName());
                }
            }
        }
        return result;
    }

    public void stream() throws Exception {
        String mimeType = getMimeType(options.videoCodec);
        int codecId = "h265".equals(options.videoCodec) ? PacketWriter.CODEC_H265 : PacketWriter.CODEC_H264;

        Thread watcher = startWatcher();
        try {
            boolean alive = true;
            while (alive && !stopped) {
                resetRequested.set(false);
                Size videoSize = capture.prepare();
                MediaCodec codec = createCodec(mimeType, options.encoderName);
                encoderInUse = codec.getName();
                MediaFormat format = createFormat(mimeType, bitRate, options.maxFps, videoSize);
                Surface surface = null;
                boolean started = false;
                try {
                    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                    surface = codec.createInputSurface();
                    capture.start(surface);
                    codec.start();
                    started = true;
                } catch (Exception e) {
                    Ln.e("Could not start the encoder " + encoderInUse + " at " + videoSize, e);
                    capture.stop();
                    codec.release();
                    if (surface != null) {
                        surface.release();
                    }
                    boolean encoderError = e instanceof IllegalStateException || e instanceof IllegalArgumentException;
                    if (encoderError && capture.downsize()) {
                        continue;
                    }
                    throw e;
                }

                try {
                    currentCodec = codec;
                    screenState.update(videoSize, capture.getDisplaySize(), capture.getTargetDisplayId(), capture.getRotation());
                    writer.writeSession(codecId, videoSize.width, videoSize.height, capture.getRotation(), capture.getTargetDisplayId());
                    Ln.i("Encoding " + videoSize + " with " + encoderInUse + " at " + bitRate + " bps");
                    alive = encode(codec);
                } finally {
                    currentCodec = null;
                    try {
                        codec.stop();
                    } catch (IllegalStateException e) {
                        // ignore
                    }
                    capture.stop();
                    codec.release();
                    surface.release();
                }
            }
        } finally {
            stopped = true;
            watcher.interrupt();
            capture.release();
        }
    }

    private boolean encode(MediaCodec codec) throws IOException {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (!stopped && !resetRequested.get()) {
            int index = codec.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US);
            if (index < 0) {
                // INFO_TRY_AGAIN_LATER, INFO_OUTPUT_FORMAT_CHANGED...
                continue;
            }
            try {
                boolean eos = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                if (info.size > 0) {
                    ByteBuffer buffer = codec.getOutputBuffer(index);
                    if (buffer != null) {
                        buffer.position(info.offset);
                        buffer.limit(info.offset + info.size);
                        int type;
                        long pts;
                        if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                            type = PacketWriter.TYPE_CONFIG;
                            pts = 0;
                        } else {
                            type = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0 ? PacketWriter.TYPE_KEY : PacketWriter.TYPE_DELTA;
                            pts = info.presentationTimeUs;
                        }
                        writer.writePacket(type, pts, buffer);
                    }
                }
                if (eos) {
                    return false;
                }
            } finally {
                codec.releaseOutputBuffer(index, false);
            }
        }
        return !stopped;
    }

    private Thread startWatcher() {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean pending = false;
                    while (!stopped) {
                        Thread.sleep(WATCH_INTERVAL_MS);
                        if (currentCodec != null && capture.isInvalidated()) {
                            // wait for the change to be stable (a rotation updates the display info in several steps)
                            if (pending) {
                                pending = false;
                                Ln.i("Display changed, restarting the capture");
                                requestReset();
                            } else {
                                pending = true;
                            }
                        } else {
                            pending = false;
                        }
                    }
                } catch (InterruptedException e) {
                    // stopped
                } catch (Throwable t) {
                    Ln.w("Display watcher error", t);
                }
            }
        }, "video-watcher");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private static MediaCodec createCodec(String mimeType, String encoderName) throws IOException {
        if (encoderName != null && !encoderName.isEmpty()) {
            try {
                return MediaCodec.createByCodecName(encoderName);
            } catch (IllegalArgumentException | IOException e) {
                Ln.w("Encoder " + encoderName + " not available, using the default one");
            }
        }
        return MediaCodec.createEncoderByType(mimeType);
    }

    private static MediaFormat createFormat(String mimeType, int bitRate, float maxFps, Size size) {
        MediaFormat format = MediaFormat.createVideoFormat(mimeType, size.width, size.height);
        format.setInteger(MediaFormat.KEY_BIT_RATE, bitRate);
        // must be present to configure the encoder, but does not impact the actual frame rate (variable)
        format.setInteger(MediaFormat.KEY_FRAME_RATE, 60);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS);
        format.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, REPEAT_FRAME_DELAY_US);
        // realtime priority
        format.setInteger(MediaFormat.KEY_PRIORITY, 0);
        if (maxFps > 0) {
            // MediaFormat.KEY_MAX_FPS_TO_ENCODER (hidden before Android 10)
            format.setFloat("max-fps-to-encoder", maxFps);
        }
        return format;
    }

    public void requestReset() {
        resetRequested.set(true);
    }

    public void requestKeyFrame() {
        MediaCodec codec = currentCodec;
        if (codec != null) {
            try {
                Bundle bundle = new Bundle();
                bundle.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0);
                codec.setParameters(bundle);
            } catch (IllegalStateException e) {
                // the codec is being stopped
            }
        }
    }

    public void setBitRate(int newBitRate) {
        bitRate = newBitRate;
        MediaCodec codec = currentCodec;
        if (codec != null) {
            try {
                Bundle bundle = new Bundle();
                bundle.putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, newBitRate);
                codec.setParameters(bundle);
                Ln.i("Bit rate changed to " + newBitRate);
            } catch (IllegalStateException e) {
                // the codec is being stopped
            }
        }
    }

    public String getEncoderInUse() {
        return encoderInUse;
    }

    public void stop() {
        stopped = true;
    }
}
