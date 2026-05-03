package app.lesefluss;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Display;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Drives a {@link Presentation} on a secondary Android display (e.g. the Ayn
 * Thor's bottom screen) hosting a second WebView that loads the same app
 * bundle with `?screen=2`. The React app branches on that flag and mounts a
 * separate component tree (see `src/secondary/`).
 *
 * Phase 1 (spike): just verifies the WebView can load the bundle and run
 * React. Plugin-event channel for state/commands is added in phase 2.
 */
@CapacitorPlugin(name = "DualScreen")
public class DualScreenPlugin extends Plugin {

    private static final String TAG = "DualScreenPlugin";
    // Synthetic origin served by WebViewAssetLoader. Capacitor's main bridge
    // uses https://localhost; we use a different host so the two WebViews'
    // request handlers don't collide and so localStorage/IndexedDB are
    // namespaced separately (we don't share state via storage anyway).
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String SECONDARY_URL = "https://" + ASSET_HOST + "/?screen=2";

    private DisplayManager displayManager;
    private SecondaryPresentation presentation;
    private DisplayManager.DisplayListener displayListener;
    private boolean enabled = false;

    @Override
    public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayListener = new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int displayId) {
                Log.i(TAG, "Display added: " + displayId);
            }
            @Override public void onDisplayRemoved(int displayId) {
                Log.i(TAG, "Display removed: " + displayId);
                if (presentation != null && presentation.getDisplay().getDisplayId() == displayId) {
                    dismissOnUi();
                }
            }
            @Override public void onDisplayChanged(int displayId) {}
        };
        displayManager.registerDisplayListener(displayListener, new Handler(Looper.getMainLooper()));
    }

    @Override
    protected void handleOnDestroy() {
        if (displayManager != null && displayListener != null) {
            displayManager.unregisterDisplayListener(displayListener);
        }
        dismissOnUi();
    }

    @PluginMethod
    public void getDisplays(PluginCall call) {
        Display[] all = displayManager.getDisplays();
        Display[] presentations = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        JSObject ret = new JSObject();
        ret.put("totalCount", all.length);
        ret.put("presentationCount", presentations.length);
        StringBuilder sb = new StringBuilder();
        for (Display d : all) {
            sb.append(d.getDisplayId()).append(":").append(d.getName()).append(";");
        }
        ret.put("summary", sb.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        enabled = true;
        Display target = pickSecondaryDisplay();
        if (target == null) {
            call.reject("No presentation display available");
            return;
        }
        showPresentationOnUi(target);
        JSObject ret = new JSObject();
        ret.put("displayId", target.getDisplayId());
        ret.put("name", target.getName());
        call.resolve(ret);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        enabled = false;
        dismissOnUi();
        call.resolve();
    }

    /**
     * Push a JSON payload from the primary WebView (this plugin's bridge) to
     * the secondary WebView via evaluateJavascript. The secondary's React app
     * subscribes by registering a callback on `window.__DualScreen.onState`.
     * Last payload is cached so it can be replayed on reattach.
     */
    @PluginMethod
    public void pushState(PluginCall call) {
        JSObject data = call.getData();
        final String json = data.toString();
        lastPushed = json;
        new Handler(Looper.getMainLooper()).post(() -> {
            if (presentation != null) presentation.deliverState(json);
        });
        call.resolve();
    }

    private String lastPushed = null;

    /**
     * Forward a command received from the secondary WebView (via the
     * JavascriptInterface) to the primary's bridge as a Capacitor event.
     * Primary subscribes via `DualScreen.addListener('command', fn)`.
     */
    void emitCommand(JSObject data) {
        notifyListeners("command", data);
    }

    private Display pickSecondaryDisplay() {
        if (getActivity() == null) return null;
        int activityDisplayId = getActivity().getWindowManager().getDefaultDisplay().getDisplayId();
        for (Display d : displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (d.getDisplayId() != activityDisplayId) return d;
        }
        return null;
    }

    private void showPresentationOnUi(Display target) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (presentation != null) {
                    try { presentation.dismiss(); } catch (Exception ignored) {}
                    presentation = null;
                }
                presentation = new SecondaryPresentation(this, getActivity(), target);
                presentation.show();
                if (lastPushed != null) presentation.deliverState(lastPushed);
            } catch (Exception e) {
                Log.e(TAG, "Failed to show presentation", e);
            }
        });
    }

    private void dismissOnUi() {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (presentation != null) {
                try { presentation.dismiss(); } catch (Exception ignored) {}
                presentation = null;
            }
        });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (!enabled) return;
        Display target = pickSecondaryDisplay();
        if (target != null) showPresentationOnUi(target);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        dismissOnUi();
    }

    private static class SecondaryPresentation extends Presentation {
        private final DualScreenPlugin owner;
        private WebView webView;
        private boolean ready = false;
        private String pendingState = null;

        SecondaryPresentation(DualScreenPlugin owner, Context outer, Display display) {
            super(outer, display);
            this.owner = owner;
        }

        /** Send a JSON state payload into the secondary WebView. Buffers
         *  until the page has signalled it's ready (`window.__DualScreen` set). */
        void deliverState(String json) {
            pendingState = json;
            if (!ready || webView == null) return;
            final String script =
                "if (window.__DualScreen && window.__DualScreen.__onState) { " +
                "  window.__DualScreen.__onState(" + json + "); " +
                "}";
            webView.post(() -> webView.evaluateJavascript(script, null));
        }

        void markReady() {
            ready = true;
            if (pendingState != null) deliverState(pendingState);
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);

            // Map https://appassets.androidplatform.net/* → assets/public/*.
            // Capacitor's `pnpm sync` copies the Vite build to public/ so the
            // entry is at public/index.html and assets at public/assets/.
            // The built-in AssetsPathHandler only serves from assets/ root, so
            // we use a custom handler that prefixes everything with `public/`.
            final Context appCtx = getContext().getApplicationContext();
            final WebViewAssetLoader.PathHandler publicHandler = new WebViewAssetLoader.PathHandler() {
                @Override
                public WebResourceResponse handle(@NonNull String path) {
                    String assetPath = "public/" + (path.isEmpty() ? "index.html" : path);
                    try {
                        InputStream in = appCtx.getAssets().open(assetPath);
                        return new WebResourceResponse(guessMime(assetPath), null, in);
                    } catch (IOException e) {
                        return null;
                    }
                }
            };
            final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                    .setDomain(ASSET_HOST)
                    .setHttpAllowed(false)
                    .addPathHandler("/", publicHandler)
                    .build();

            webView = new WebView(getContext());
            webView.setBackgroundColor(Color.parseColor("#1a1a1a"));
            webView.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            WebSettings ws = webView.getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setDatabaseEnabled(true);
            ws.setAllowFileAccess(false);
            ws.setAllowContentAccess(false);
            ws.setMediaPlaybackRequiresUserGesture(false);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    WebResourceResponse res = assetLoader.shouldInterceptRequest(url);
                    if (res != null) return res;
                    // SPA fallback: any unknown path under our host serves index.html.
                    if (ASSET_HOST.equals(url.getHost()) && !url.getPath().contains(".")) {
                        return assetLoader.shouldInterceptRequest(
                                Uri.parse("https://" + ASSET_HOST + "/index.html"));
                    }
                    return null;
                }
            });

            webView.setWebChromeClient(new android.webkit.WebChromeClient() {
                @Override
                public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                    Log.i(TAG + "/Web", cm.message() + " @ " + cm.sourceId() + ":" + cm.lineNumber());
                    return true;
                }
            });

            // Bridge from secondary WebView JS → primary plugin event channel.
            // The interface name is intentionally namespaced so it can't clash
            // with anything Capacitor-injected (the secondary has no Capacitor).
            webView.addJavascriptInterface(new SecondaryBridge(owner, this), "__DualScreenNative");

            setContentView(webView);
            webView.loadUrl(SECONDARY_URL);
        }

        @Override
        protected void onStop() {
            try { if (webView != null) webView.loadUrl("about:blank"); } catch (Exception ignored) {}
            super.onStop();
        }

        /**
         * Exposed as `window.__DualScreenNative` in the secondary WebView.
         * Two methods:
         *   - markReady():    secondary signals it's listening; we replay state
         *   - command(json):  secondary fires a command back to primary
         *
         * All JavascriptInterface methods run on a background thread.
         */
        private static class SecondaryBridge {
            private final DualScreenPlugin owner;
            private final SecondaryPresentation presentation;
            SecondaryBridge(DualScreenPlugin owner, SecondaryPresentation presentation) {
                this.owner = owner;
                this.presentation = presentation;
            }
            @JavascriptInterface
            public void markReady() {
                new Handler(Looper.getMainLooper()).post(presentation::markReady);
            }
            @JavascriptInterface
            public void command(String json) {
                try {
                    JSObject data = new JSObject(json);
                    new Handler(Looper.getMainLooper()).post(() -> owner.emitCommand(data));
                } catch (Exception e) {
                    Log.w(TAG, "bad command payload: " + json, e);
                }
            }
        }

        private static String guessMime(String path) {
            int dot = path.lastIndexOf('.');
            if (dot < 0) return "application/octet-stream";
            String ext = path.substring(dot + 1).toLowerCase();
            switch (ext) {
                case "html": return "text/html";
                case "js":   return "application/javascript";
                case "mjs":  return "application/javascript";
                case "css":  return "text/css";
                case "json": return "application/json";
                case "svg":  return "image/svg+xml";
                case "png":  return "image/png";
                case "jpg":
                case "jpeg": return "image/jpeg";
                case "webp": return "image/webp";
                case "ico":  return "image/x-icon";
                case "woff": return "font/woff";
                case "woff2":return "font/woff2";
                case "ttf":  return "font/ttf";
                case "wasm": return "application/wasm";
                case "map":  return "application/json";
                default:     return "application/octet-stream";
            }
        }
    }
}
