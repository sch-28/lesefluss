package app.lesefluss;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

/**
 * An inaudible looping track played from this process while reading aloud.
 * The speech itself is played by the TTS engine's process, so without it
 * Android sees no audio from this app and sends headset, Bluetooth and car
 * media buttons to whichever app played last.
 */
final class SilentTrack {

    private static final String TAG = "Lesefluss";
    private static final int SAMPLE_RATE = 8000;
    private static final int FRAMES = SAMPLE_RATE / 2;

    private final AudioAttributes attributes;
    private AudioTrack track;

    SilentTrack(AudioAttributes attributes) {
        this.attributes = attributes;
    }

    void start() {
        try {
            if (track == null) track = create();
            if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) track.play();
        } catch (RuntimeException e) {
            Log.w(TAG, "Silent track failed; media buttons may go to another app", e);
            release();
        }
    }

    void stop() {
        try {
            if (track != null && track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) track.pause();
        } catch (RuntimeException e) {
            Log.w(TAG, "Silent track stop failed", e);
        }
    }

    void release() {
        if (track == null) return;
        try {
            track.release();
        } catch (RuntimeException e) {
            Log.w(TAG, "Silent track release failed", e);
        }
        track = null;
    }

    private AudioTrack create() {
        AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();
        AudioTrack created = new AudioTrack(attributes, format, FRAMES * 2, AudioTrack.MODE_STATIC,
                android.media.AudioManager.AUDIO_SESSION_ID_GENERATE);
        created.write(new short[FRAMES], 0, FRAMES);
        created.setLoopPoints(0, FRAMES, -1);
        return created;
    }
}
