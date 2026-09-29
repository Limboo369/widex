package com.widex.server;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * A separate process which turns the screen back on if the server dies while the screen is off
 * (for example if the Wi-Fi connection to the PC is lost and adb kills the server).
 *
 * The server writes its state ("off" / "on") to the stdin of this process, and "done" when it exits normally.
 * On EOF without "done", the server died: restore the screen if it was off.
 */
public final class CleanUp {

    private final Process process;
    private final OutputStream out;
    private boolean finished;

    private CleanUp(Process process) {
        this.process = process;
        this.out = process.getOutputStream();
    }

    public static CleanUp start() throws IOException {
        String classPath = System.getProperty("java.class.path");
        List<String> cmd = new ArrayList<>();
        if (new File("/system/bin/setsid").exists()) {
            // new session: not killed together with the "adb shell" session of the server
            cmd.add("setsid");
        }
        cmd.add("app_process");
        cmd.add("/");
        cmd.add(Server.class.getName());
        cmd.add(Server.VERSION);
        cmd.add("mode=cleanup");
        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.environment().put("CLASSPATH", classPath);
        File devNull = new File("/dev/null");
        builder.redirectOutput(ProcessBuilder.Redirect.to(devNull));
        builder.redirectError(ProcessBuilder.Redirect.to(devNull));
        return new CleanUp(builder.start());
    }

    public synchronized void setScreenOff(boolean off) {
        write(off ? "off" : "on");
    }

    public synchronized void finish() {
        if (!finished) {
            finished = true;
            write("done");
            try {
                out.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    private void write(String line) {
        if (finished && !"done".equals(line)) {
            return;
        }
        try {
            out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (IOException e) {
            Ln.w("Could not write to the cleanup process", e);
        }
    }

    /**
     * Entry point of the cleanup process.
     */
    static void run() {
        String state = "on";
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if ("done".equals(line)) {
                    return;
                }
                if (!line.isEmpty()) {
                    state = line;
                }
            }
        } catch (IOException e) {
            // the server is gone
        }
        if ("off".equals(state)) {
            Device.setDisplayPower(0, true);
        }
    }
}
