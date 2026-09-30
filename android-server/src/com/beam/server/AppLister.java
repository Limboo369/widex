package com.beam.server;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * List the launchable apps with their label and icon (JSON on stdout).
 */
public final class AppLister {

    public static final String BEGIN_MARKER = "BEAM_APPS_BEGIN";
    public static final String END_MARKER = "BEAM_APPS_END";

    private AppLister() {
        // not instantiable
    }

    public static void run(Options options) throws Exception {
        PackageManager pm = FakeContext.get().getPackageManager();
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> infos = pm.queryIntentActivities(intent, 0);

        JSONArray apps = new JSONArray();
        for (ResolveInfo info : infos) {
            ActivityInfo activity = info.activityInfo;
            if (activity == null) {
                continue;
            }
            JSONObject app = new JSONObject();
            app.put("package", activity.packageName);
            app.put("component", activity.packageName + "/" + activity.name);
            CharSequence label = info.loadLabel(pm);
            app.put("label", label != null ? label.toString() : activity.packageName);
            ApplicationInfo appInfo = activity.applicationInfo;
            app.put("system", appInfo != null && (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0
                    && (appInfo.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0);
            try {
                Drawable icon = info.loadIcon(pm);
                if (icon != null) {
                    app.put("icon", toPngBase64(icon, options.iconSize));
                }
            } catch (Throwable t) {
                Ln.d("No icon for " + activity.packageName + ": " + t);
            }
            apps.put(app);
        }

        synchronized (System.out) {
            System.out.println(BEGIN_MARKER);
            System.out.println(apps.toString());
            System.out.println(END_MARKER);
            System.out.flush();
        }
    }

    private static String toPngBase64(Drawable drawable, int size) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, size, size);
        drawable.draw(canvas);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        bitmap.recycle();
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
