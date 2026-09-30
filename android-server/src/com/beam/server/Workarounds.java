package com.beam.server;

import android.app.Application;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ApplicationInfo;
import android.os.Build;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * The server is started by app_process (as the "shell" user), so there is no real Android application around it.
 * Several framework APIs expect an ActivityThread, an Application and a Context: create (fake) ones.
 */
public final class Workarounds {

    private static final Class<?> ACTIVITY_THREAD_CLASS;
    private static final Object ACTIVITY_THREAD;

    static {
        try {
            // ActivityThread activityThread = new ActivityThread();
            ACTIVITY_THREAD_CLASS = Class.forName("android.app.ActivityThread");
            Constructor<?> constructor = ACTIVITY_THREAD_CLASS.getDeclaredConstructor();
            constructor.setAccessible(true);
            ACTIVITY_THREAD = constructor.newInstance();

            // ActivityThread.sCurrentActivityThread = activityThread;
            Field currentField = ACTIVITY_THREAD_CLASS.getDeclaredField("sCurrentActivityThread");
            currentField.setAccessible(true);
            currentField.set(null, ACTIVITY_THREAD);

            // activityThread.mSystemThread = true;
            Field systemThreadField = ACTIVITY_THREAD_CLASS.getDeclaredField("mSystemThread");
            systemThreadField.setAccessible(true);
            systemThreadField.setBoolean(ACTIVITY_THREAD, true);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private Workarounds() {
        // not instantiable
    }

    public static void apply() {
        if (Build.VERSION.SDK_INT >= 31) {
            // Must be set before fillAppContext(), some devices call ActivityThread.getConfiguration()
            fillConfigurationController();
        }
        fillAppInfo();
        fillAppContext();
    }

    private static void fillAppInfo() {
        try {
            // ActivityThread.AppBindData appBindData = new ActivityThread.AppBindData();
            Class<?> appBindDataClass = Class.forName("android.app.ActivityThread$AppBindData");
            Constructor<?> constructor = appBindDataClass.getDeclaredConstructor();
            constructor.setAccessible(true);
            Object appBindData = constructor.newInstance();

            ApplicationInfo applicationInfo = new ApplicationInfo();
            applicationInfo.packageName = FakeContext.PACKAGE_NAME;

            // appBindData.appInfo = applicationInfo;
            Field appInfoField = appBindDataClass.getDeclaredField("appInfo");
            appInfoField.setAccessible(true);
            appInfoField.set(appBindData, applicationInfo);

            // activityThread.mBoundApplication = appBindData;
            Field boundApplicationField = ACTIVITY_THREAD_CLASS.getDeclaredField("mBoundApplication");
            boundApplicationField.setAccessible(true);
            boundApplicationField.set(ACTIVITY_THREAD, appBindData);
        } catch (Throwable throwable) {
            // this is a workaround, failing is not fatal
            Ln.d("Could not fill app info: " + throwable);
        }
    }

    private static void fillAppContext() {
        try {
            Application app = new Application();
            Field baseField = ContextWrapper.class.getDeclaredField("mBase");
            baseField.setAccessible(true);
            baseField.set(app, FakeContext.get());

            // activityThread.mInitialApplication = app;
            Field initialApplicationField = ACTIVITY_THREAD_CLASS.getDeclaredField("mInitialApplication");
            initialApplicationField.setAccessible(true);
            initialApplicationField.set(ACTIVITY_THREAD, app);
        } catch (Throwable throwable) {
            Ln.d("Could not fill app context: " + throwable);
        }
    }

    private static void fillConfigurationController() {
        try {
            Class<?> controllerClass = Class.forName("android.app.ConfigurationController");
            Class<?> internalClass = Class.forName("android.app.ActivityThreadInternal");
            Constructor<?> constructor = controllerClass.getDeclaredConstructor(internalClass);
            constructor.setAccessible(true);
            Object controller = constructor.newInstance(ACTIVITY_THREAD);

            Field field = ACTIVITY_THREAD_CLASS.getDeclaredField("mConfigurationController");
            field.setAccessible(true);
            field.set(ACTIVITY_THREAD, controller);
        } catch (Throwable throwable) {
            Ln.d("Could not fill configuration controller: " + throwable);
        }
    }

    static Context getSystemContext() {
        try {
            Method method = ACTIVITY_THREAD_CLASS.getDeclaredMethod("getSystemContext");
            return (Context) method.invoke(ACTIVITY_THREAD);
        } catch (Throwable throwable) {
            Ln.e("Could not get system context", throwable);
            return null;
        }
    }
}
