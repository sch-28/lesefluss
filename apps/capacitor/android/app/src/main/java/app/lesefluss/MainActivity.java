package app.lesefluss;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        registerPlugin(DualScreenPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setWebViewClient(new ImageProxyWebViewClient(getBridge()));
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
