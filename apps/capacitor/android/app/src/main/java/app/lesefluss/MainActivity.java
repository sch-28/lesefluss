package app.lesefluss;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.lifecycle.Lifecycle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "Lesefluss";
    private static final long RESTART_LOOP_WINDOW_MS = 30_000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        registerPlugin(BookScannerPlugin.class);
        registerPlugin(DeviceInfoPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setWebViewClient(new ImageProxyWebViewClient(getBridge()));
        // Low-RAM devices lose the WebView renderer under memory pressure, and
        // unhandled that crashes the app. Recreating the activity leaked the dead
        // WebView, so the process restarts instead.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.w(TAG, "WebView renderer gone (crashed: " + detail.didCrash() + ")");
                // Not in front (a picker, camera or sign-in tab of ours is on top, or the
                // app is in the background): relaunching would tear that down or pop the
                // app forward. Dying quietly lets Android start us fresh on return.
                if (!getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                    Process.killProcess(Process.myPid());
                    return true;
                }
                restartProcess();
                return true;
            }
        });
    }

    private void restartProcess() {
        // A renderer that dies again right after a restart would otherwise
        // restart the app forever; the second death closes it instead.
        SharedPreferences prefs = getSharedPreferences("renderer_recovery", MODE_PRIVATE);
        long now = SystemClock.elapsedRealtime();
        long last = prefs.getLong("last_restart", Long.MIN_VALUE);
        boolean isRepeat = last != Long.MIN_VALUE && last <= now && now - last < RESTART_LOOP_WINDOW_MS;
        // commit, not apply: the process dies before an async write would land.
        prefs.edit().putLong("last_restart", now).commit();
        if (isRepeat) {
            Log.w(TAG, "WebView renderer died again within " + RESTART_LOOP_WINDOW_MS + " ms, closing");
        } else {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                startActivity(launch);
            }
        }
        finishAffinity();
        Process.killProcess(Process.myPid());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        PluginHandle handle = getBridge().getPlugin("ShareIntent");
        if (handle == null) return;
        Object instance = handle.getInstance();
        if (instance instanceof ShareIntentPlugin) {
            ((ShareIntentPlugin) instance).handleIntent(intent);
        }
    }
}
