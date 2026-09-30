package com.beam.server;

import android.net.LocalServerSocket;
import android.net.LocalSocket;

import java.io.Closeable;
import java.io.FileDescriptor;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Sockets to the PC. The PC connects through "adb forward tcp:X localabstract:beam_SCID", in this order:
 * video, audio, control (each one only if enabled).
 */
public final class DesktopConnection implements Closeable {

    private final LocalSocket videoSocket;
    private final LocalSocket audioSocket;
    private final LocalSocket controlSocket;

    private DesktopConnection(LocalSocket videoSocket, LocalSocket audioSocket, LocalSocket controlSocket) {
        this.videoSocket = videoSocket;
        this.audioSocket = audioSocket;
        this.controlSocket = controlSocket;
    }

    public static DesktopConnection open(String socketName, boolean video, boolean audio, boolean control, boolean sendDummyByte)
            throws IOException {
        LocalSocket videoSocket = null;
        LocalSocket audioSocket = null;
        LocalSocket controlSocket = null;
        LocalServerSocket server = new LocalServerSocket(socketName);
        Ln.i("Listening on localabstract:" + socketName);
        try {
            if (video) {
                videoSocket = server.accept();
                if (sendDummyByte) {
                    // The PC connects through an adb tunnel: the connection succeeds even if nobody listens on the device.
                    // This byte tells the PC that the server is really there.
                    videoSocket.getOutputStream().write(0);
                    sendDummyByte = false;
                }
            }
            if (audio) {
                audioSocket = server.accept();
                if (sendDummyByte) {
                    audioSocket.getOutputStream().write(0);
                    sendDummyByte = false;
                }
            }
            if (control) {
                controlSocket = server.accept();
                if (sendDummyByte) {
                    controlSocket.getOutputStream().write(0);
                }
            }
        } catch (IOException | RuntimeException e) {
            closeQuietly(videoSocket);
            closeQuietly(audioSocket);
            closeQuietly(controlSocket);
            throw e;
        } finally {
            server.close();
        }
        Ln.i("PC connected");
        return new DesktopConnection(videoSocket, audioSocket, controlSocket);
    }

    private static void closeQuietly(LocalSocket socket) {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    public FileDescriptor getVideoFd() {
        return videoSocket != null ? videoSocket.getFileDescriptor() : null;
    }

    public FileDescriptor getAudioFd() {
        return audioSocket != null ? audioSocket.getFileDescriptor() : null;
    }

    public boolean hasControl() {
        return controlSocket != null;
    }

    public InputStream getControlInputStream() throws IOException {
        return controlSocket.getInputStream();
    }

    public OutputStream getControlOutputStream() throws IOException {
        return controlSocket.getOutputStream();
    }

    public void shutdownAudio() {
        if (audioSocket != null) {
            try {
                audioSocket.shutdownOutput();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    @Override
    public void close() {
        // shutdown first: unblocks threads blocked on read()/write()
        shutdownQuietly(videoSocket);
        shutdownQuietly(audioSocket);
        shutdownQuietly(controlSocket);
        closeQuietly(videoSocket);
        closeQuietly(audioSocket);
        closeQuietly(controlSocket);
    }

    private static void shutdownQuietly(LocalSocket socket) {
        if (socket != null) {
            try {
                socket.shutdownInput();
            } catch (IOException e) {
                // ignore
            }
            try {
                socket.shutdownOutput();
            } catch (IOException e) {
                // ignore
            }
        }
    }
}
