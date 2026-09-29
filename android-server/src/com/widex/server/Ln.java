package com.widex.server;

import android.util.Log;

import java.io.PrintStream;

/**
 * Logger: writes both to logcat and to stdout/stderr (which the PC side reads through "adb shell").
 */
public final class Ln {

    private static final String TAG = "widex";
    private static final String PREFIX = "[server] ";

    public enum Level {
        VERBOSE, DEBUG, INFO, WARN, ERROR
    }

    private static volatile Level threshold = Level.INFO;

    private Ln() {
        // not instantiable
    }

    public static void setLevel(Level level) {
        threshold = level;
    }

    public static boolean isEnabled(Level level) {
        return level.ordinal() >= threshold.ordinal();
    }

    public static void v(String message) {
        if (isEnabled(Level.VERBOSE)) {
            Log.v(TAG, message);
            print(System.out, "VERBOSE: " + message);
        }
    }

    public static void d(String message) {
        if (isEnabled(Level.DEBUG)) {
            Log.d(TAG, message);
            print(System.out, "DEBUG: " + message);
        }
    }

    public static void i(String message) {
        if (isEnabled(Level.INFO)) {
            Log.i(TAG, message);
            print(System.out, "INFO: " + message);
        }
    }

    public static void w(String message) {
        w(message, null);
    }

    public static void w(String message, Throwable throwable) {
        if (isEnabled(Level.WARN)) {
            Log.w(TAG, message, throwable);
            print(System.out, "WARN: " + message + (throwable != null ? " (" + throwable + ")" : ""));
        }
    }

    public static void e(String message) {
        e(message, null);
    }

    public static void e(String message, Throwable throwable) {
        if (isEnabled(Level.ERROR)) {
            Log.e(TAG, message, throwable);
            synchronized (System.err) {
                System.err.println(PREFIX + "ERROR: " + message);
                if (throwable != null) {
                    throwable.printStackTrace(System.err);
                }
                System.err.flush();
            }
        }
    }

    private static void print(PrintStream stream, String message) {
        synchronized (stream) {
            stream.println(PREFIX + message);
            stream.flush();
        }
    }

    public static Level parseLevel(String value) {
        switch (value.toLowerCase()) {
            case "verbose":
                return Level.VERBOSE;
            case "debug":
                return Level.DEBUG;
            case "warn":
                return Level.WARN;
            case "error":
                return Level.ERROR;
            default:
                return Level.INFO;
        }
    }
}
