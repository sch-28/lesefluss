package app.lesefluss;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

/**
 * Receives Android intents that hand a payload to Lesefluss and forwards them
 * to the JS layer via a "shareReceived" event.
 *
 * Two flavours of payload:
 *   - kind=text: ACTION_SEND with text/* (existing behaviour) — shared URLs or
 *     plain text from another app's share sheet.
 *   - kind=file: ACTION_VIEW (file manager "Open with") or ACTION_SEND with a
 *     binary mime type (share-sheet for epub/pdf/html). The stream is copied
 *     to app cache so the JS layer can read it via Capacitor Filesystem
 *     without worrying about content:// permission scoping.
 *
 * Two entry points:
 *   - load(): called by Capacitor once after the WebView is ready. Handles the
 *     case where the app was launched cold via the share sheet.
 *   - handleIntent(Intent): called from MainActivity.onNewIntent when the app
 *     was already running and receives a new intent.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    private static final String TAG = "ShareIntentPlugin";

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        // A cold-start intent arrives before any JS listener is attached.
        // notifyListeners with retain=true caches the event so the listener
        // still fires when it registers.
        handleIntent(intent);
    }

    /**
     * Process an incoming intent. Safe to call with any Intent; only
     * recognised actions/types are forwarded.
     */
    public void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_SEND.equals(action)) {
            String type = intent.getType();
            // text/html shares are file-shaped (EXTRA_STREAM, not EXTRA_TEXT) on
            // Android — treat them as files so they hit the import pipeline.
            if (type != null && type.startsWith("text/") && !"text/html".equals(type)) {
                handleSharedText(intent);
                return;
            }
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) {
                handleSharedFile(stream, type);
            }
            return;
        }

        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) {
                handleSharedFile(data, intent.getType());
            }
        }
    }

    private void handleSharedText(Intent intent) {
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;

        JSObject data = new JSObject();
        data.put("kind", "text");
        data.put("text", text);

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) data.put("subject", subject);

        notifyListeners("shareReceived", data, true);
    }

    private void handleSharedFile(Uri uri, String declaredMime) {
        ContentResolver resolver = getContext().getContentResolver();
        String mimeType = declaredMime;
        if (mimeType == null) mimeType = resolver.getType(uri);

        String displayName = queryDisplayName(resolver, uri);
        String extension = pickExtension(displayName, mimeType);
        if (displayName == null) {
            displayName = "shared" + (extension != null ? "." + extension : "");
        }

        File copied = copyToCache(resolver, uri, extension);
        if (copied == null) return;

        JSObject data = new JSObject();
        data.put("kind", "file");
        data.put("path", copied.getAbsolutePath());
        data.put("fileName", displayName);
        if (mimeType != null) data.put("mimeType", mimeType);

        notifyListeners("shareReceived", data, true);
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        if ("file".equals(uri.getScheme())) {
            String path = uri.getLastPathSegment();
            return path;
        }
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "queryDisplayName failed", e);
        }
        return uri.getLastPathSegment();
    }

    private String pickExtension(String displayName, String mimeType) {
        String raw = null;
        if (displayName != null) {
            int dot = displayName.lastIndexOf('.');
            if (dot >= 0 && dot < displayName.length() - 1) {
                raw = displayName.substring(dot + 1);
            }
        }
        if (raw == null && mimeType != null) {
            switch (mimeType) {
                case "application/epub+zip": raw = "epub"; break;
                case "application/pdf": raw = "pdf"; break;
                case "text/html":
                case "application/xhtml+xml": raw = "html"; break;
                default: break;
            }
        }
        if (raw == null) return null;
        // displayName is user-controlled — sanitize so it can't escape the
        // cache dir (e.g. "foo.evil/../bar") or contain illegal characters.
        raw = raw.toLowerCase();
        if (!raw.matches("[a-z0-9]{1,8}")) return null;
        return raw;
    }

    private File copyToCache(ContentResolver resolver, Uri uri, String extension) {
        File dir = new File(getContext().getCacheDir(), "share-intent");
        if (!dir.exists() && !dir.mkdirs()) {
            Log.w(TAG, "could not create cache dir");
            return null;
        }
        String suffix = extension != null ? "." + extension : "";
        File out = new File(dir, UUID.randomUUID().toString() + suffix);

        try (InputStream in = resolver.openInputStream(uri);
             OutputStream os = new FileOutputStream(out)) {
            if (in == null) return null;
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
            return out;
        } catch (Exception e) {
            Log.w(TAG, "copyToCache failed for " + uri, e);
            return null;
        }
    }
}
