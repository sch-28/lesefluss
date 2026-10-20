package app.lesefluss;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.IBinder;

import androidx.core.content.ContextCompat;

/**
 * Keeps the process alive while a book is read aloud with the screen off, and
 * shows the media notification. Playback itself lives in {@link TtsPlayer}.
 */
public class TtsService extends Service {

    private static final String CHANNEL_ID = "read_aloud";
    private static final int NOTIFICATION_ID = 4711;
    private static final String ACTION_TOGGLE = "app.lesefluss.tts.TOGGLE";
    private static final String ACTION_PREVIOUS = "app.lesefluss.tts.PREVIOUS";
    private static final String ACTION_NEXT = "app.lesefluss.tts.NEXT";
    private static final String ACTION_STOP = "app.lesefluss.tts.STOP";
    private static final String ACTION_SHUTDOWN = "app.lesefluss.tts.SHUTDOWN";

    private static boolean isRunning = false;

    /**
     * Ends the service through itself rather than stopService: a service asked to
     * start in the foreground must reach startForeground first, or Android
     * crashes the app when it is stopped before getting there.
     */
    static void requestStop(Context context) {
        Intent intent = new Intent(context, TtsService.class).setAction(ACTION_SHUTDOWN);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (IllegalStateException e) {
            context.stopService(new Intent(context, TtsService.class));
        }
    }

    static void refresh(Context context) {
        if (!isRunning) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, buildNotification(context));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        TtsPlayer player = TtsPlayer.peek();
        String action = intent != null ? intent.getAction() : null;
        ensureChannel(this);
        Notification notification = buildNotification(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        isRunning = true;
        if (player != null && ACTION_STOP.equals(action)) player.stop(TtsPlayer.REASON_STOPPED);
        if (player == null || ACTION_STOP.equals(action) || ACTION_SHUTDOWN.equals(action)) {
            isRunning = false;
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        if (ACTION_TOGGLE.equals(action)) player.toggle();
        else if (ACTION_PREVIOUS.equals(action)) player.skip(-1);
        else if (ACTION_NEXT.equals(action)) player.skip(1);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Read aloud", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static Notification buildNotification(Context context) {
        TtsPlayer player = TtsPlayer.peek();
        boolean isPlaying = player != null && player.isPlaying();
        String chapter = player != null ? player.getChapter() : null;

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launch != null
                ? PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE)
                : null;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_stat_lesefluss)
                .setContentTitle(player != null ? player.getTitle() : "")
                .setContentText(chapter != null ? chapter : isPlaying ? "Reading aloud" : "Paused")
                .setContentIntent(contentIntent)
                .setOngoing(isPlaying)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(action(context, R.drawable.ic_tts_previous, "Previous sentence", ACTION_PREVIOUS, 1))
                .addAction(isPlaying
                        ? action(context, R.drawable.ic_tts_pause, "Pause", ACTION_TOGGLE, 2)
                        : action(context, R.drawable.ic_tts_play, "Play", ACTION_TOGGLE, 2))
                .addAction(action(context, R.drawable.ic_tts_next, "Next sentence", ACTION_NEXT, 3))
                .addAction(action(context, R.drawable.ic_tts_stop, "Stop", ACTION_STOP, 4));
        if (player != null && player.getCover() != null) builder.setLargeIcon(player.getCover());
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (player != null) style.setMediaSession(player.getSessionToken());
        builder.setStyle(style);
        return builder.build();
    }

    private static Notification.Action action(Context context, int icon, String title, String action, int requestCode) {
        Intent intent = new Intent(context, TtsService.class).setAction(action);
        PendingIntent pending = PendingIntent.getService(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(Icon.createWithResource(context, icon), title, pending).build();
    }
}
