package com.beam.server;

import android.annotation.TargetApi;
import android.content.AttributionSource;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.os.Process;

import java.lang.reflect.Field;

/**
 * A Context which pretends to be the "com.android.shell" package (the server runs with the shell uid).
 */
public final class FakeContext extends ContextWrapper {

    public static final String PACKAGE_NAME = "com.android.shell";

    private static final FakeContext INSTANCE = new FakeContext();

    public static FakeContext get() {
        return INSTANCE;
    }

    private FakeContext() {
        super(Workarounds.getSystemContext());
    }

    @Override
    public String getPackageName() {
        return PACKAGE_NAME;
    }

    @Override
    public String getOpPackageName() {
        return PACKAGE_NAME;
    }

    @TargetApi(31)
    @Override
    public AttributionSource getAttributionSource() {
        AttributionSource.Builder builder = new AttributionSource.Builder(Process.SHELL_UID);
        builder.setPackageName(PACKAGE_NAME);
        return builder.build();
    }

    @Override
    public int getDeviceId() {
        // Context.DEVICE_ID_DEFAULT
        return 0;
    }

    @Override
    public Context getApplicationContext() {
        return this;
    }

    @Override
    public Object getSystemService(String name) {
        Object service = super.getSystemService(name);
        if (service != null && Context.CLIPBOARD_SERVICE.equals(name)) {
            // The ClipboardManager uses its context to get the calling package: make it use this one
            try {
                Field field = ClipboardManager.class.getDeclaredField("mContext");
                field.setAccessible(true);
                field.set(service, this);
            } catch (ReflectiveOperationException e) {
                Ln.w("Could not patch the clipboard manager context", e);
            }
        }
        return service;
    }
}
