package app.lesefluss;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives ACTION_SEND intents (Android share sheet → Lesefluss) and forwards
 * the shared text to the JS layer via a "shareReceived" event.
 *
 * Two entry points:
 *   - load(): called by Capacitor once after the WebView is ready. Handles the
 *     case where the app was launched cold via the share sheet.
 *   - handleIntent(Intent): called from MainActivity.onNewIntent when the app
 *     was already running and receives a new share intent.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        // A cold-start share intent arrives before any JS listener is attached.
        // notifyListeners with retain=true caches the event so the listener
        // still fires when it registers.
        handleIntent(intent);
    }

    /**
     * Process an incoming intent. Safe to call with any Intent; only
     * ACTION_SEND intents carrying text/* are forwarded.
     */
    public void handleIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;

        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;

        JSObject data = new JSObject();
        data.put("text", text);

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) data.put("subject", subject);

        notifyListeners("shareReceived", data, true);
    }
}
