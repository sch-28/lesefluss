package app.lesefluss;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Owns the speech queue so playback, pause and resume keep working while the
 * WebView is in the background and JS may not run. JS appends segments and
 * listens for progress; the position inside a segment is tracked here to the
 * word, because Android TTS can only restart an utterance, never resume one.
 */
public class TtsPlayer {

    public interface Listener {
        void onProgress(int segmentId, int charStart);
        void onStateChange(boolean isPlaying, String reason);
        void onNeedMore();
        void onFinished();
        void onSleepTimerChange(long endsAt, boolean isAtChapterEnd);
    }

    public interface ReadyCallback {
        void onReady(boolean isAvailable);
    }

    public static class Segment {
        final int id;
        final String text;
        /** Chapter title for the notification, on chapter openings and a session's first segment. */
        final String chapter;
        /** Only real chapter openings: a session's first segment names its chapter without opening it. */
        final boolean opensChapter;

        Segment(int id, String text, String chapter, boolean opensChapter) {
            this.id = id;
            this.text = text;
            this.chapter = chapter;
            this.opensChapter = opensChapter;
        }
    }

    /** A stretch of continuous playback, in segment coordinates JS can map to words. */
    public static class Interval {
        long startedAt;
        long endedAt;
        int startSegment;
        int startChar;
        int endSegment;
        int endChar;

        Interval copy() {
            Interval c = new Interval();
            c.startedAt = startedAt;
            c.endedAt = endedAt;
            c.startSegment = startSegment;
            c.startChar = startChar;
            c.endSegment = endSegment;
            c.endChar = endChar;
            return c;
        }
    }

    public static final String REASON_USER = "user";
    public static final String REASON_FOCUS = "focus";
    public static final String REASON_NOISY = "noisy";
    public static final String REASON_SLEEP = "sleep";
    public static final String REASON_END = "end";
    /** Stopped outside JS (notification, media button): the session is over, not paused. */
    public static final String REASON_STOPPED = "stopped";
    public static final String REASON_ERROR = "error";

    private static final String TAG = "Lesefluss";
    // Queued ahead in the engine so sentence gaps stay short, small enough that
    // a pause or an option change does not throw away much synthesis work.
    private static final int ENGINE_LOOKAHEAD = 3;
    private static final int LOW_WATER_SEGMENTS = 40;
    private static final int KEPT_BEHIND = 50;
    private static final long RESTART_SENTENCE_WINDOW_MS = 2_000;
    // Covers from older imports were never downscaled; the notification needs no more than this.
    private static final int MAX_COVER_SIDE = 512;
    // An offline network voice fails every utterance at once; stop rather than race to the end.
    private static final int MAX_CONSECUTIVE_ERRORS = 3;

    private static TtsPlayer instance;

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AudioManager audioManager;
    private final AudioAttributes audioAttributes;
    private final AudioFocusRequest focusRequest;
    // One instance: the pre-O API abandons focus only for the listener that requested it.
    private final AudioManager.OnAudioFocusChangeListener focusListener = this::onFocusChange;
    private final MediaSession mediaSession;
    private final SilentTrack silentTrack;
    private final TextToSpeech tts;
    private boolean isEngineReady = false;
    private boolean isEngineFailed = false;
    private boolean isStartPending = false;
    private final List<ReadyCallback> whenReady = new ArrayList<>();

    private final List<Segment> segments = new ArrayList<>();
    private int cursor = 0;
    private int cursorChar = 0;
    private long cursorStartedAt = 0;
    private int nextToEnqueue = 0;
    // Bumped whenever queued utterances are thrown away, so their late callbacks are ignored.
    private int generation = 0;
    private int consecutiveErrors = 0;
    private boolean isPlaying = false;
    private boolean hasRequestedMore = false;
    private boolean isEndOfText = false;
    private boolean isPausedByFocusLoss = false;
    private boolean shouldRewindOnPlay = false;
    private boolean isNoisyReceiverRegistered = false;
    private boolean isServiceRequested = false;
    // The last segment sent has been spoken and JS has not appended more yet.
    private boolean isWaitingForMore = false;

    private float rate = 1.0f;
    private float pitch = 1.0f;
    private String language = null;
    private String voiceName = null;
    private int rewindWords = 8;

    private String title = "";
    private String author = null;
    private String chapter = null;
    private Bitmap cover = null;

    private long sleepEndsAt = 0;
    private boolean isSleepAtChapterEnd = false;
    private final Runnable sleepRunnable = () -> {
        synchronized (TtsPlayer.this) {
            clearSleepTimer();
            // Paused by a call or a navigation prompt: stay paused instead of resuming when it ends.
            isPausedByFocusLoss = false;
            if (isPlaying) pause(REASON_SLEEP);
            else publishState(REASON_SLEEP);
        }
    };

    private final List<Interval> closedIntervals = new ArrayList<>();
    private Interval openInterval = null;

    private Listener listener;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) pause(REASON_NOISY);
        }
    };

    public static synchronized TtsPlayer get(Context context) {
        if (instance == null) instance = new TtsPlayer(context.getApplicationContext());
        return instance;
    }

    public static synchronized TtsPlayer peek() {
        return instance;
    }

    @SuppressWarnings("deprecation")
    private TtsPlayer(Context context) {
        this.context = context;
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        focusRequest = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(audioAttributes)
                        .setOnAudioFocusChangeListener(focusListener)
                        .build()
                : null;

        silentTrack = new SilentTrack(audioAttributes);
        mediaSession = new MediaSession(context, "LeseflussTts");
        // Before Android 8 media buttons only reach a session that asks for them.
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                play();
            }

            @Override
            public void onPause() {
                pause(REASON_USER);
            }

            @Override
            public void onStop() {
                stop(REASON_STOPPED);
            }

            @Override
            public void onSkipToPrevious() {
                skip(-1);
            }

            @Override
            public void onSkipToNext() {
                skip(1);
            }
        });

        tts = new TextToSpeech(context, this::onEngineInit);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                int[] ids = parseUtterance(utteranceId);
                if (ids != null) onUtteranceStart(ids[0], ids[1], ids[2]);
            }

            @Override
            public void onRangeStart(String utteranceId, int start, int end, int frame) {
                int[] ids = parseUtterance(utteranceId);
                if (ids != null) onUtteranceRange(ids[0], ids[1], ids[2] + start);
            }

            @Override
            public void onDone(String utteranceId) {
                int[] ids = parseUtterance(utteranceId);
                if (ids != null) onSegmentDone(ids[0], ids[1], false);
            }

            @Override
            public void onStop(String utteranceId, boolean interrupted) {
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onError(String utteranceId) {
                Log.w(TAG, "TTS utterance failed: " + utteranceId);
                int[] ids = parseUtterance(utteranceId);
                if (ids != null) onSegmentDone(ids[0], ids[1], true);
            }
        });
    }

    public synchronized void setListener(Listener listener) {
        this.listener = listener;
    }

    /** Clears the listener if it is still `current`, so a destroyed plugin is not kept alive. */
    public synchronized void clearListener(Listener current) {
        if (listener == current) listener = null;
    }

    /** Runs once the engine has bound or failed to; immediately when that is already known. */
    public synchronized void whenReady(ReadyCallback callback) {
        if (isEngineReady || isEngineFailed) callback.onReady(isEngineReady);
        else whenReady.add(callback);
    }

    public synchronized void load(List<Segment> next, boolean isLast, String title, String author, String coverDataUrl, String language) {
        if (isPlaying) {
            isPlaying = false;
            closeInterval();
        }
        haltEngine();
        segments.clear();
        segments.addAll(next);
        cursor = 0;
        cursorChar = 0;
        nextToEnqueue = 0;
        hasRequestedMore = false;
        isWaitingForMore = false;
        isEndOfText = isLast;
        shouldRewindOnPlay = false;
        isPausedByFocusLoss = false;
        clearSleepTimer();
        this.title = title;
        this.author = author;
        this.chapter = next.isEmpty() ? null : next.get(0).chapter;
        this.cover = decodeCover(coverDataUrl);
        this.language = language;
        publishMetadata();
    }

    public synchronized void append(List<Segment> more, boolean isLast) {
        segments.addAll(more);
        hasRequestedMore = false;
        isEndOfText = isLast;
        if (isPlaying) fillEngine();
    }

    public synchronized void setOptions(float rate, float pitch, String voiceName, int rewindWords) {
        boolean isEngineChange = rate != this.rate || pitch != this.pitch || !equalsNullable(voiceName, this.voiceName);
        this.rate = rate;
        this.pitch = pitch;
        this.voiceName = voiceName;
        this.rewindWords = rewindWords;
        if (!isEngineReady || !isEngineChange || !isPlaying) return;
        applyEngineSettings();
        restartFromCursor();
    }

    public synchronized void play() {
        if (isPlaying) return;
        if (segments.isEmpty() || cursor >= segments.size()) {
            if (isEndOfText) {
                publishState(REASON_END);
                Listener l = listener;
                if (l != null) l.onFinished();
            }
            return;
        }
        if (isEngineFailed) {
            publishState(REASON_ERROR);
            return;
        }
        if (!isEngineReady) {
            isStartPending = true;
            return;
        }
        if (!requestFocus()) {
            publishState(REASON_FOCUS);
            return;
        }
        if (shouldRewindOnPlay) {
            shouldRewindOnPlay = false;
            rewind(rewindWords);
        }
        // A voice sample may have changed the engine since the book last spoke.
        applyEngineSettings();
        isPausedByFocusLoss = false;
        consecutiveErrors = 0;
        isPlaying = true;
        nextToEnqueue = cursor;
        openInterval();
        fillEngine();
        registerNoisyReceiver();
        silentTrack.start();
        mediaSession.setActive(true);
        publishState(REASON_USER);
        requestService();
    }

    public synchronized void pause(String reason) {
        if (isStartPending) {
            isStartPending = false;
            publishState(reason);
            return;
        }
        if (!isPlaying) return;
        isPlaying = false;
        haltEngine();
        closeInterval();
        unregisterNoisyReceiver();
        silentTrack.stop();
        // Speech cut off mid-thought is easier to follow again from a little before.
        if (REASON_FOCUS.equals(reason) || REASON_NOISY.equals(reason)) shouldRewindOnPlay = true;
        publishState(reason);
    }

    public synchronized void stop(String reason) {
        isPlaying = false;
        isStartPending = false;
        isPausedByFocusLoss = false;
        haltEngine();
        closeInterval();
        clearSleepTimer();
        segments.clear();
        cursor = 0;
        cursorChar = 0;
        nextToEnqueue = 0;
        isWaitingForMore = false;
        unregisterNoisyReceiver();
        silentTrack.release();
        abandonFocus();
        mediaSession.setActive(false);
        publishState(reason);
        if (isServiceRequested) {
            isServiceRequested = false;
            TtsService.requestStop(context);
        }
    }

    public synchronized void toggle() {
        if (isPlaying) pause(REASON_USER);
        else play();
    }

    /** -1 restarts the sentence, or goes to the previous one right after a sentence began. */
    public synchronized void skip(int direction) {
        if (segments.isEmpty()) return;
        int target = cursor;
        if (direction < 0) {
            boolean isJustStarted = cursorChar == 0
                    || SystemClock.elapsedRealtime() - cursorStartedAt < RESTART_SENTENCE_WINDOW_MS;
            if (isJustStarted && cursor > 0) target--;
        } else if (cursor + 1 < segments.size()) {
            target++;
        } else {
            return;
        }
        // The skipped text was not listened to: the interval ends where speech was.
        closeInterval();
        cursor = target;
        cursorChar = 0;
        isWaitingForMore = false;
        // Rewinding after an interruption would land back in the sentence just skipped.
        shouldRewindOnPlay = false;
        if (isPlaying) {
            openInterval();
            restartFromCursor();
        } else {
            reportCursor();
        }
    }

    public synchronized void setSleepTimer(long durationMs, boolean isAtChapterEnd) {
        clearSleepTimer();
        long endsAt = 0;
        if (isAtChapterEnd) {
            isSleepAtChapterEnd = true;
        } else if (durationMs > 0) {
            endsAt = System.currentTimeMillis() + durationMs;
            sleepEndsAt = endsAt;
            mainHandler.postDelayed(sleepRunnable, durationMs);
        }
        Listener l = listener;
        if (l != null) l.onSleepTimerChange(endsAt, isSleepAtChapterEnd);
    }

    public synchronized boolean isPlaying() {
        return isPlaying;
    }

    public synchronized int currentSegmentId() {
        return cursor < segments.size() ? segments.get(cursor).id : -1;
    }

    public synchronized int currentChar() {
        return cursorChar;
    }

    /** Closed intervals since the last drain plus a snapshot of the one still running. */
    public synchronized List<Interval> drainListenLog() {
        List<Interval> drained = new ArrayList<>(closedIntervals);
        closedIntervals.clear();
        if (openInterval != null) {
            openInterval.endedAt = System.currentTimeMillis();
            drained.add(openInterval.copy());
        }
        return drained;
    }

    public synchronized String getTitle() {
        return title;
    }

    public synchronized String getChapter() {
        return chapter;
    }

    public synchronized Bitmap getCover() {
        return cover;
    }

    public MediaSession.Token getSessionToken() {
        return mediaSession.getSessionToken();
    }

    public synchronized Set<Voice> getVoices() {
        if (!isEngineReady) return null;
        try {
            return tts.getVoices();
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine failed to list voices", e);
            return null;
        }
    }

    public synchronized String getDefaultEngine() {
        return isEngineReady ? tts.getDefaultEngine() : null;
    }

    /** {@link TextToSpeech#isLanguageAvailable} result for a BCP 47 tag. */
    public synchronized int checkLanguage(String languageTag) {
        if (!isEngineReady) return TextToSpeech.ERROR;
        try {
            return tts.isLanguageAvailable(Locale.forLanguageTag(languageTag));
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine failed a language check", e);
            return TextToSpeech.ERROR;
        }
    }

    public synchronized void speakSample(String text, String languageTag, String sampleVoice, float sampleRate, float samplePitch) {
        if (!isEngineReady || isPlaying) return;
        try {
            if (languageTag != null && !languageTag.isEmpty()) tts.setLanguage(Locale.forLanguageTag(languageTag));
            Voice voice = findVoice(sampleVoice);
            setVoiceOrDefault(voice);
            tts.setSpeechRate(sampleRate);
            tts.setPitch(samplePitch);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), "sample");
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine failed a sample", e);
        }
    }

    private synchronized void onEngineInit(int status) {
        isEngineReady = status == TextToSpeech.SUCCESS;
        isEngineFailed = !isEngineReady;
        if (isEngineReady) {
            tts.setAudioAttributes(audioAttributes);
        } else {
            Log.w(TAG, "TTS engine init failed: " + status);
        }
        for (ReadyCallback callback : whenReady) callback.onReady(isEngineReady);
        whenReady.clear();
        if (isStartPending) {
            isStartPending = false;
            play();
        }
    }

    private synchronized void onUtteranceStart(int gen, int id, int offset) {
        if (!isCurrent(gen, id)) return;
        cursorChar = offset;
        cursorStartedAt = SystemClock.elapsedRealtime();
        consecutiveErrors = 0;
        Segment segment = segments.get(cursor);
        if (segment.chapter != null && (segment.opensChapter || !segment.chapter.equals(chapter))) {
            chapter = segment.chapter;
            publishMetadata();
            TtsService.refresh(context);
        }
        updateInterval();
        Listener l = listener;
        if (l != null) l.onProgress(id, offset);
    }

    private synchronized void onUtteranceRange(int gen, int id, int charStart) {
        if (!isCurrent(gen, id)) return;
        cursorChar = charStart;
        updateInterval();
        Listener l = listener;
        if (l != null) l.onProgress(id, charStart);
    }

    private synchronized void onSegmentDone(int gen, int id, boolean isError) {
        if (!isCurrent(gen, id)) return;
        if (isError && ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            pause(REASON_ERROR);
            return;
        }
        if (cursor + 1 >= segments.size()) {
            if (!isEndOfText) {
                // Waiting for JS to append: the finished segment counts as heard, the wait does not.
                cursorChar = segments.get(cursor).text.length();
                closeInterval();
                isWaitingForMore = true;
                return;
            }
            cursorChar = segments.get(cursor).text.length();
            updateInterval();
            Listener l = listener;
            pause(REASON_END);
            if (l != null) l.onFinished();
            return;
        }
        cursor++;
        cursorChar = 0;
        if (stopsForChapterEnd()) return;
        pruneBehind();
        fillEngine();
    }

    /** Pauses at the cursor when it opens a chapter and the sleep timer waits for one. */
    private boolean stopsForChapterEnd() {
        if (!isSleepAtChapterEnd || !segments.get(cursor).opensChapter) return false;
        clearSleepTimer();
        // Progress first, so the position JS saves on the pause is the new chapter's start.
        reportCursor();
        pause(REASON_SLEEP);
        return true;
    }

    private boolean isCurrent(int gen, int id) {
        return isPlaying && gen == generation && cursor < segments.size() && segments.get(cursor).id == id;
    }

    private void fillEngine() {
        if (isWaitingForMore) {
            if (cursor + 1 >= segments.size()) return;
            isWaitingForMore = false;
            cursor++;
            cursorChar = 0;
            nextToEnqueue = Math.max(nextToEnqueue, cursor);
            if (stopsForChapterEnd()) return;
            if (isPlaying) openInterval();
        }
        while (nextToEnqueue < segments.size() && nextToEnqueue < cursor + ENGINE_LOOKAHEAD) {
            Segment segment = segments.get(nextToEnqueue);
            boolean isCursor = nextToEnqueue == cursor;
            int offset = isCursor ? Math.min(cursorChar, segment.text.length()) : 0;
            String utteranceId = generation + ":" + segment.id + ":" + offset;
            int result = speakSafely(segment.text.substring(offset), utteranceId);
            if (result == TextToSpeech.ERROR) {
                Log.w(TAG, "TTS refused utterance " + utteranceId);
                // A refused look-ahead is offered again once it is current; only the
                // current one counts as failed, since no callback follows a refusal.
                if (!isCursor) break;
                nextToEnqueue++;
                int gen = generation;
                int id = segment.id;
                mainHandler.post(() -> onSegmentDone(gen, id, true));
                break;
            }
            nextToEnqueue++;
        }
        if (!isEndOfText && !hasRequestedMore && segments.size() - cursor < LOW_WATER_SEGMENTS) {
            hasRequestedMore = true;
            Listener l = listener;
            if (l != null) l.onNeedMore();
        }
    }

    private int speakSafely(String text, String utteranceId) {
        try {
            return tts.speak(text, TextToSpeech.QUEUE_ADD, new Bundle(), utteranceId);
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine threw on speak", e);
            return TextToSpeech.ERROR;
        }
    }

    private void restartFromCursor() {
        haltEngine();
        fillEngine();
    }

    private void haltEngine() {
        generation++;
        if (!isEngineReady) {
            nextToEnqueue = cursor;
            return;
        }
        try {
            tts.stop();
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine threw on stop", e);
        }
        nextToEnqueue = cursor;
    }

    private void pruneBehind() {
        int excess = cursor - KEPT_BEHIND;
        if (excess <= 0) return;
        segments.subList(0, excess).clear();
        cursor -= excess;
        nextToEnqueue -= excess;
    }

    /** Moves the cursor back `words` word starts, into earlier segments if needed. */
    private void rewind(int words) {
        for (int i = 0; i < words; i++) {
            int previous = previousWordStart(segments.get(cursor).text, cursorChar);
            if (previous >= 0) {
                cursorChar = previous;
            } else if (cursor > 0) {
                cursor--;
                String text = segments.get(cursor).text;
                cursorChar = Math.max(0, previousWordStart(text, text.length()));
            } else {
                cursorChar = 0;
                break;
            }
        }
        reportCursor();
    }

    /** Start of the word before the one starting at `from`; -1 when `from` is the first word. */
    static int previousWordStart(String text, int from) {
        int i = Math.min(from, text.length()) - 1;
        while (i >= 0 && Character.isWhitespace(text.charAt(i))) i--;
        if (i < 0) return -1;
        while (i > 0 && !Character.isWhitespace(text.charAt(i - 1))) i--;
        return i;
    }

    private void reportCursor() {
        if (cursor >= segments.size()) return;
        Listener l = listener;
        if (l != null) l.onProgress(segments.get(cursor).id, cursorChar);
    }

    private void openInterval() {
        if (cursor >= segments.size()) return;
        Interval interval = new Interval();
        interval.startedAt = System.currentTimeMillis();
        interval.endedAt = interval.startedAt;
        interval.startSegment = segments.get(cursor).id;
        interval.startChar = cursorChar;
        interval.endSegment = interval.startSegment;
        interval.endChar = cursorChar;
        openInterval = interval;
    }

    private void updateInterval() {
        if (openInterval == null || cursor >= segments.size()) return;
        openInterval.endedAt = System.currentTimeMillis();
        openInterval.endSegment = segments.get(cursor).id;
        openInterval.endChar = cursorChar;
    }

    private void closeInterval() {
        if (openInterval == null) return;
        updateInterval();
        closedIntervals.add(openInterval);
        openInterval = null;
    }

    private void clearSleepTimer() {
        mainHandler.removeCallbacks(sleepRunnable);
        boolean wasSet = isSleepAtChapterEnd || sleepEndsAt != 0;
        sleepEndsAt = 0;
        isSleepAtChapterEnd = false;
        Listener l = listener;
        if (wasSet && l != null) l.onSleepTimerChange(0, false);
    }

    /** Engines are third-party code: a misbehaving one keeps its current voice rather than crash the app. */
    private void applyEngineSettings() {
        try {
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            if (language != null && !language.isEmpty()) {
                int result = tts.setLanguage(Locale.forLanguageTag(language));
                if (result < TextToSpeech.LANG_AVAILABLE) Log.w(TAG, "TTS language unavailable: " + language);
            }
            Voice voice = findVoice(voiceName);
            if (voice != null) tts.setVoice(voice);
            else if (language == null || language.isEmpty()) setVoiceOrDefault(null);
        } catch (RuntimeException e) {
            Log.w(TAG, "TTS engine rejected settings", e);
        }
    }

    /** getDefaultVoice is null when the engine has nothing for the system language. */
    private void setVoiceOrDefault(Voice voice) {
        Voice chosen = voice != null ? voice : tts.getDefaultVoice();
        if (chosen != null) tts.setVoice(chosen);
    }

    private Voice findVoice(String name) {
        if (name == null || name.isEmpty()) return null;
        Set<Voice> voices = getVoices();
        if (voices == null) return null;
        for (Voice v : voices) {
            if (name.equals(v.getName())) return v;
        }
        return null;
    }

    private void publishMetadata() {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, author != null ? author : "Lesefluss");
        if (chapter != null) metadata.putString(MediaMetadata.METADATA_KEY_ALBUM, chapter);
        if (cover != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, cover);
        mediaSession.setMetadata(metadata.build());
    }

    private void publishState(String reason) {
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, rate)
                .build());
        TtsService.refresh(context);
        Listener l = listener;
        if (l != null) l.onStateChange(isPlaying, reason);
    }

    /** Starting a foreground service can be refused from the background (Android 12+); playback goes on without it. */
    private void requestService() {
        if (isServiceRequested) return;
        try {
            ContextCompat.startForegroundService(context, new Intent(context, TtsService.class));
            isServiceRequested = true;
        } catch (IllegalStateException e) {
            Log.w(TAG, "TTS foreground service not allowed now", e);
        }
    }

    private static Bitmap decodeCover(String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:") || comma < 0) return null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            while (longest / options.inSampleSize > MAX_COVER_SIDE) options.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (IllegalArgumentException | OutOfMemoryError e) {
            Log.w(TAG, "TTS cover not decodable", e);
            return null;
        }
    }

    /** "generation:segment:offset", or null for an utterance that is not part of the book. */
    private static int[] parseUtterance(String utteranceId) {
        String[] parts = utteranceId.split(":");
        if (parts.length != 3) return null;
        try {
            return new int[] {Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2])};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean equalsNullable(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    private void registerNoisyReceiver() {
        if (isNoisyReceiverRegistered) return;
        ContextCompat.registerReceiver(context, noisyReceiver,
                new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
        isNoisyReceiverRegistered = true;
    }

    private void unregisterNoisyReceiver() {
        if (!isNoisyReceiverRegistered) return;
        context.unregisterReceiver(noisyReceiver);
        isNoisyReceiverRegistered = false;
    }

    @SuppressWarnings("deprecation")
    private boolean requestFocus() {
        int result = focusRequest != null
                ? audioManager.requestAudioFocus(focusRequest)
                : audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void abandonFocus() {
        if (focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        else audioManager.abandonAudioFocus(focusListener);
    }

    private synchronized void onFocusChange(int change) {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS:
                isPausedByFocusLoss = false;
                pause(REASON_FOCUS);
                break;
            // Ducked speech is hard to follow, so a navigation prompt pauses it too.
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                if (isPlaying) {
                    pause(REASON_FOCUS);
                    isPausedByFocusLoss = true;
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                if (isPausedByFocusLoss) play();
                break;
            default:
                break;
        }
    }
}
