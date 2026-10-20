package app.lesefluss;

import android.content.Context;
import android.media.AudioManager;
import android.view.KeyEvent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands volume key presses to the reader instead of changing the volume.
 * Android delivers these keys to the activity before the WebView, so the page
 * never sees them as key events. Off unless the reader turns it on, so the
 * keys keep working as volume everywhere else.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    private volatile boolean enabled = false;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        enabled = call.getBoolean("enabled", false);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        enabled = false;
    }

    /** True when the event was consumed. */
    public boolean handleKey(KeyEvent event) {
        // A page reload drops JS listeners without resetting enabled; with no
        // listener the keys would vanish.
        if (!enabled || !hasListeners("volumeKey")) return false;
        int code = event.getKeyCode();
        if (code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN) return false;
        if (isInCall()) return false;
        // Holding a key would otherwise flip through pages faster than the eye follows.
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            JSObject data = new JSObject();
            data.put("key", code == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
            notifyListeners("volumeKey", data);
        }
        return true;
    }

    private boolean isInCall() {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        return audio != null && audio.getMode() != AudioManager.MODE_NORMAL;
    }
}
