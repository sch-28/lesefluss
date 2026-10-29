package app.lesefluss;

import android.content.Intent;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Log;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin implements TtsPlayer.Listener {

    private static final String TAG = "Lesefluss";
    private static final String FEATURE_NOT_INSTALLED = TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED;

    private interface Body {
        void run(PluginCall call);
    }

    private TtsPlayer player;

    /** On the main thread: the plugin thread's looper ends with the bridge, the player lives on. */
    @Override
    public void load() {
        player = TtsPlayer.get(getContext());
        player.setListener(this);
    }

    /**
     * The reader's session dies with the WebView, recreate or not: nothing would save the
     * position or feed the voice. A newer activity's plugin may already own the player.
     */
    @Override
    protected void handleOnDestroy() {
        if (player.clearListener(this)) player.stop(TtsPlayer.REASON_STOPPED);
    }

    @PluginMethod
    public void start(PluginCall call) {
        guard(call, c -> {
            List<TtsPlayer.Segment> segments = readSegments(c);
            if (segments == null) return;
            player.load(segments, c.getBoolean("isLast", false), c.getString("title", ""),
                    c.getString("author"), c.getString("cover"), c.getString("language"));
            applyOptions(c);
            player.play();
            c.resolve();
        });
    }

    @PluginMethod
    public void append(PluginCall call) {
        guard(call, c -> {
            List<TtsPlayer.Segment> segments = readSegments(c);
            if (segments == null) return;
            player.append(segments, c.getBoolean("isLast", false));
            c.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        guard(call, c -> {
            player.pause(TtsPlayer.REASON_USER);
            c.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        guard(call, c -> {
            player.play();
            c.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        guard(call, c -> {
            player.stop(TtsPlayer.REASON_USER);
            c.resolve();
        });
    }

    @PluginMethod
    public void skip(PluginCall call) {
        guard(call, c -> {
            player.skip(c.getInt("direction", 1));
            c.resolve();
        });
    }

    @PluginMethod
    public void setOptions(PluginCall call) {
        guard(call, c -> {
            applyOptions(c);
            c.resolve();
        });
    }

    @PluginMethod
    public void setSleepTimer(PluginCall call) {
        guard(call, c -> {
            // getLong rejects any number small enough to arrive as an Integer from JS.
            long durationMs = c.getData().optLong("durationMs", 0);
            player.setSleepTimer(durationMs, c.getBoolean("isAtChapterEnd", false));
            c.resolve();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        guard(call, c -> {
            JSObject result = new JSObject();
            result.put("segmentId", player.currentSegmentId());
            result.put("charStart", player.currentChar());
            c.resolve(result);
        });
    }

    @PluginMethod
    public void drainListenLog(PluginCall call) {
        guard(call, c -> {
            JSArray intervals = new JSArray();
            for (TtsPlayer.Interval interval : player.drainListenLog()) {
                JSObject item = new JSObject();
                item.put("startedAt", interval.startedAt);
                item.put("endedAt", interval.endedAt);
                item.put("startSegment", interval.startSegment);
                item.put("startChar", interval.startChar);
                item.put("endSegment", interval.endSegment);
                item.put("endChar", interval.endChar);
                intervals.put(item);
            }
            JSObject result = new JSObject();
            result.put("intervals", intervals);
            c.resolve(result);
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        guard(call, outer -> player.whenReady(isAvailable -> guard(outer, c -> {
            if (!isAvailable) {
                c.reject("No speech engine");
                return;
            }
            Set<Voice> voices = player.getVoices();
            JSArray list = new JSArray();
            if (voices != null) {
                for (Voice voice : voices) {
                    // Engines are third-party code; a voice missing its basics is skipped.
                    if (voice.getName() == null || voice.getLocale() == null) continue;
                    JSObject item = new JSObject();
                    item.put("name", voice.getName());
                    item.put("language", voice.getLocale().toLanguageTag());
                    item.put("quality", voice.getQuality());
                    item.put("isNetwork", voice.isNetworkConnectionRequired());
                    item.put("isInstalled", voice.getFeatures() == null
                            || !voice.getFeatures().contains(FEATURE_NOT_INSTALLED));
                    list.put(item);
                }
            }
            JSObject result = new JSObject();
            result.put("voices", list);
            c.resolve(result);
        })));
    }

    @PluginMethod
    public void checkLanguage(PluginCall call) {
        String language = call.getString("language", "");
        guard(call, outer -> player.whenReady(isAvailable -> guard(outer, c -> {
            if (!isAvailable) {
                c.reject("No speech engine");
                return;
            }
            int status = player.checkLanguage(language);
            JSObject result = new JSObject();
            result.put("status", status >= TextToSpeech.LANG_AVAILABLE ? "available"
                    : status == TextToSpeech.LANG_MISSING_DATA ? "missingData" : "unsupported");
            c.resolve(result);
        })));
    }

    @PluginMethod
    public void speakSample(PluginCall call) {
        guard(call, c -> {
            String text = c.getString("text", "");
            String language = c.getString("language");
            String voice = c.getString("voice");
            float rate = c.getFloat("rate", 1.0f);
            float pitch = c.getFloat("pitch", 1.0f);
            player.whenReady(isAvailable -> {
                if (isAvailable) player.speakSample(text, language, voice, rate, pitch);
            });
            c.resolve();
        });
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        guard(call, c -> {
            if (!startActivity(new Intent("com.android.settings.TTS_SETTINGS"))
                    && !startActivity(new Intent(Settings.ACTION_SETTINGS))) {
                c.reject("No settings screen");
                return;
            }
            c.resolve();
        });
    }

    @PluginMethod
    public void installVoiceData(PluginCall call) {
        guard(call, c -> {
            Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
            String engine = player.getDefaultEngine();
            if (engine != null) intent.setPackage(engine);
            if (!startActivity(intent)) {
                c.reject("No speech engine offers voice downloads");
                return;
            }
            c.resolve();
        });
    }

    /** Last line of defence: an exception thrown here would otherwise take the whole app down. */
    private void guard(PluginCall call, Body body) {
        try {
            body.run(call);
        } catch (RuntimeException e) {
            Log.e(TAG, "TTS plugin call failed: " + call.getMethodName(), e);
            call.reject(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName(), e);
        }
    }

    /** OEM settings screens may be missing, not exported, or need a permission. */
    private boolean startActivity(Intent intent) {
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not open " + intent.getAction(), e);
            return false;
        }
    }

    private void applyOptions(PluginCall call) {
        player.setOptions(call.getFloat("rate", 1.0f), call.getFloat("pitch", 1.0f),
                call.getString("voice"), call.getInt("rewindWords", 8));
    }

    private List<TtsPlayer.Segment> readSegments(PluginCall call) {
        JSArray array = call.getArray("segments");
        if (array == null) {
            call.reject("segments required");
            return null;
        }
        List<TtsPlayer.Segment> segments = new ArrayList<>(array.length());
        try {
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                String chapter = item.isNull("chapter") ? null : item.optString("chapter", null);
                segments.add(new TtsPlayer.Segment(item.getInt("id"), item.getString("text"), chapter,
                        item.optBoolean("opensChapter", false)));
            }
        } catch (JSONException e) {
            call.reject("invalid segments", e);
            return null;
        }
        return segments;
    }

    /**
     * Player events arrive on binder, main and plugin threads. Sending them all
     * from the plugin thread, where listeners are added and removed, keeps
     * Capacitor's unsynchronized listener list from being read mid-change.
     */
    private void emit(String event, JSObject data) {
        Bridge bridge = getBridge();
        if (bridge != null) bridge.execute(() -> notifyListeners(event, data));
    }

    @Override
    public void onProgress(int segmentId, int charStart) {
        JSObject data = new JSObject();
        data.put("segmentId", segmentId);
        data.put("charStart", charStart);
        emit("progress", data);
    }

    @Override
    public void onStateChange(boolean isPlaying, String reason) {
        JSObject data = new JSObject();
        data.put("isPlaying", isPlaying);
        data.put("reason", reason);
        emit("state", data);
    }

    @Override
    public void onNeedMore() {
        emit("needMore", new JSObject());
    }

    @Override
    public void onFinished() {
        emit("finished", new JSObject());
    }

    @Override
    public void onSleepTimerChange(long endsAt, boolean isAtChapterEnd) {
        JSObject data = new JSObject();
        data.put("endsAt", endsAt);
        data.put("isAtChapterEnd", isAtChapterEnd);
        emit("sleepTimer", data);
    }
}
