package com.widex.server;

import android.content.ComponentName;
import android.os.Build;
import android.os.Looper;
import android.os.Process;

import com.widex.server.audio.AudioStreamer;
import com.widex.server.control.Controller;
import com.widex.server.video.Capture;
import com.widex.server.video.MirrorCapture;
import com.widex.server.video.NewDisplayCapture;
import com.widex.server.video.VideoStreamer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Wi-Dex server, started on the phone by the PC:
 *
 *   CLASSPATH=/data/local/tmp/widex-server.jar app_process / com.widex.server.Server VERSION key=value...
 *
 * It runs with the "shell" user permissions (granted by adb): screen capture without prompt, input injection
 * (real multi-touch), screen power control, audio capture.
 */
public final class Server {

    public static final String VERSION = "2.0.0";

    private Server() {
        // not instantiable
    }

    public static void main(String... args) {
        int status = 0;
        try {
            internalMain(args);
        } catch (Throwable t) {
            Ln.e("Fatal error", t);
            status = 1;
        }
        // make sure all the threads are stopped
        System.exit(status);
    }

    private static void internalMain(String... args) throws Exception {
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                Ln.e("Exception on thread " + t, e);
            }
        });

        if (args.length < 1) {
            throw new IllegalArgumentException("Missing version argument");
        }
        if (!VERSION.equals(args[0])) {
            throw new IllegalArgumentException("Version mismatch: PC expects " + args[0] + ", server is " + VERSION);
        }
        Options options = Options.parse(Arrays.copyOfRange(args, 1, args.length));
        Ln.setLevel(options.logLevel);

        if ("cleanup".equals(options.mode)) {
            CleanUp.run();
            return;
        }
        if ("screen_on".equals(options.mode)) {
            Device.setDisplayPower(0, true);
            return;
        }

        // Some framework classes (used indirectly) create Handlers: a Looper is required
        Looper.prepareMainLooper();
        Workarounds.apply();

        if ("list_apps".equals(options.mode)) {
            AppLister.run(options);
            return;
        }

        stream(options);
    }

    private static final class Completion {
        private final CountDownLatch latch = new CountDownLatch(1);

        void done() {
            latch.countDown();
        }

        void await() throws InterruptedException {
            latch.await();
        }
    }

    private static Thread startThread(String name, Runnable runnable) {
        return startThread(name, runnable, false);
    }

    private static Thread startThread(String name, Runnable runnable, boolean daemon) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(daemon);
        thread.start();
        return thread;
    }

    private static void stream(final Options options) throws Exception {
        Ln.i("Wi-Dex server " + VERSION + " on " + Device.getModel() + " (Android " + Build.VERSION.RELEASE + ", API "
                + Build.VERSION.SDK_INT + ")");

        final DesktopConnection connection = DesktopConnection.open("widex_" + options.scid, options.video, options.audio,
                options.control, options.sendDummyByte);

        final Completion completion = new Completion();
        final DeviceMessageSender sender = connection.hasControl() ? new DeviceMessageSender(connection.getControlOutputStream()) : null;
        final ScreenState screenState = new ScreenState();

        Capture capture;
        int powerDisplayId;
        if (options.isNewDisplay()) {
            capture = NewDisplayCapture.parse(options.newDisplay);
            powerDisplayId = 0;
        } else {
            capture = new MirrorCapture(options.displayId, options.maxSize);
            powerDisplayId = options.displayId;
        }
        final PowerState powerState = new PowerState(powerDisplayId);
        final VideoStreamer video = new VideoStreamer(capture, options, new PacketWriter(connection.getVideoFd()), screenState);
        final AudioStreamer audio = options.audio ? new AudioStreamer(new PacketWriter(connection.getAudioFd())) : null;
        final AtomicBoolean monitorStopped = new AtomicBoolean();

        if (sender != null) {
            sender.sendEvent(createHelloEvent(options));
        }

        if (options.stayAwake) {
            Device.acquireWakeLock();
        }

        try {
            startThread("video", new Runnable() {
                @Override
                public void run() {
                    try {
                        video.stream();
                    } catch (IOException e) {
                        // the PC closed the connection
                        Ln.d("Video stopped: " + e);
                    } catch (Throwable t) {
                        Ln.e("Video error", t);
                        if (sender != null) {
                            sender.sendError("Video: " + t.getMessage());
                        }
                    } finally {
                        completion.done();
                    }
                }
            });

            if (audio != null) {
                startThread("audio", new Runnable() {
                    @Override
                    public void run() {
                        try {
                            audio.stream();
                        } catch (Throwable t) {
                            Ln.w("Audio stopped: " + t.getMessage());
                            if (sender != null) {
                                sender.sendEvent("audio_error", "message", String.valueOf(t.getMessage()));
                            }
                            // tell the PC there will be no audio
                            connection.shutdownAudio();
                        }
                    }
                });
            }

            if (sender != null) {
                final Controller controller = new Controller(connection.getControlInputStream(), sender, screenState, video, powerState);
                startThread("control", new Runnable() {
                    @Override
                    public void run() {
                        try {
                            controller.run();
                        } catch (IOException e) {
                            Ln.d("Control stopped: " + e);
                        } catch (Throwable t) {
                            Ln.e("Control error", t);
                        } finally {
                            completion.done();
                        }
                    }
                });

                startThread("foreground", new Runnable() {
                    @Override
                    public void run() {
                        String last = null;
                        while (!monitorStopped.get()) {
                            ComponentName component = Device.getFocusedActivity();
                            String current = component != null ? component.flattenToShortString() : "";
                            if (!current.equals(last)) {
                                last = current;
                                sender.sendEvent("foreground", "package", component != null ? component.getPackageName() : "",
                                        "component", current);
                            }
                            try {
                                Thread.sleep(1000);
                            } catch (InterruptedException e) {
                                return;
                            }
                        }
                    }
                }, true);
            }

            if (options.turnScreenOff) {
                boolean ok = powerState.setScreenOn(false);
                if (sender != null) {
                    sender.sendEvent("screen", "on", false, "ok", ok);
                }
            }

            completion.await();
        } finally {
            Ln.i("Stopping");
            monitorStopped.set(true);
            video.stop();
            if (audio != null) {
                audio.stop();
            }
            powerState.restore();
            Device.restoreRotation(powerDisplayId);
            Device.releaseWakeLock();
            connection.close();
        }
    }

    private static JSONObject createHelloEvent(Options options) {
        JSONObject event = new JSONObject();
        try {
            event.put("event", "hello");
            event.put("version", VERSION);
            event.put("manufacturer", Build.MANUFACTURER);
            event.put("model", Build.MODEL);
            event.put("device", Build.DEVICE);
            event.put("release", Build.VERSION.RELEASE);
            event.put("sdk", Build.VERSION.SDK_INT);
            event.put("pid", Process.myPid());
            event.put("newDisplay", options.isNewDisplay());
            JSONArray encoders = new JSONArray();
            for (String name : VideoStreamer.listEncoders(VideoStreamer.getMimeType(options.videoCodec))) {
                encoders.put(name);
            }
            event.put("encoders", encoders);
        } catch (Exception e) {
            Ln.w("Could not create hello event", e);
        }
        return event;
    }
}
