package app.lesefluss;

import android.app.Dialog;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;

import okhttp3.ConnectionPool;
import okhttp3.Protocol;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/** OkHttp plugin for scraping: produces a Chrome-like JA3/HTTP2 fingerprint that Cloudflare accepts, unlike HttpURLConnection. */
@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {

    private static final String TAG = "NativeHttpPlugin";
    private OkHttpClient client;

    @Override
    public void load() {
        client = new OkHttpClient.Builder()
                // HTTP/2 SETTINGS frames have a distinct fingerprint that Cloudflare rejects. HTTP/1.1 passes.
                .protocols(Arrays.asList(Protocol.HTTP_1_1))
                .followRedirects(true)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                // Default keepalive is 5 min; Cloudflare edge connections go stale much sooner.
                // A stale pooled connection hangs on read until our JS timeout fires, then retries fresh and succeeds.
                // 30 s matches typical Cloudflare edge keepalive behavior.
                .connectionPool(new ConnectionPool(5, 30, TimeUnit.SECONDS))
                .build();
    }

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        JSObject headersObj = call.getObject("headers");

        // OkHttp is blocking: must run off the main thread.
        new Thread(() -> {
            try {
                Request.Builder req = new Request.Builder().url(url);

                if (headersObj != null) {
                    Iterator<String> keys = headersObj.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        String value = headersObj.optString(key, null);
                        if (value != null) req.header(key, value);
                    }
                }

                // Forward WebView cookies (e.g. cf_clearance) so Cloudflare sees the session the user already challenged through.
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) req.header("Cookie", cookies);

                req.get();

                try (Response res = client.newCall(req.build()).execute()) {
                    ResponseBody body = res.body();
                    String data = body != null ? body.string() : "";

                    JSObject result = new JSObject();
                    result.put("status", res.code());
                    result.put("data", data);
                    call.resolve(result);
                }
            } catch (Exception e) {
                Log.w(TAG, "request failed for " + url, e);
                call.reject("FETCH_FAILED: " + e.getMessage());
            }
        }).start();
    }

    /** Shows a full-screen WebView for Cloudflare challenge resolution; resolves once cf_clearance is set. */
    @PluginMethod
    public void openChallenge(PluginCall call) {
        String url = call.getString("url");
        String userAgent = call.getString("userAgent");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            // Match the UA used by OkHttp so cf_clearance is bound to the same UA.
            if (userAgent != null && !userAgent.isEmpty()) settings.setUserAgentString(userAgent);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            dialog.setContentView(webView);
            dialog.setCancelable(false);
            // Back navigates within the WebView. Dismisses (and rejects) when there is no history left.
            dialog.setOnKeyListener((d, keyCode, event) -> {
                if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        teardown(webView, dialog);
                        call.reject("CHALLENGE_DISMISSED");
                    }
                    return true;
                }
                return false;
            });

            webView.setWebViewClient(new WebViewClient() {
                private volatile boolean resolved = false;

                @Override
                public void onPageFinished(WebView view, String loadedUrl) {
                    if (resolved) return;
                    String cookies = cookieManager.getCookie(loadedUrl);
                    if (cookies != null && cookies.contains("cf_clearance=")) {
                        resolved = true;
                        // Post to next tick: destroy() inside a WebViewClient callback crashes when the view is still attached.
                        new Handler(Looper.getMainLooper()).post(() -> {
                            teardown(webView, dialog);
                            call.resolve();
                        });
                    }
                }
            });

            webView.loadUrl(url);
            dialog.show();
        });
    }

    private void teardown(WebView webView, Dialog dialog) {
        webView.stopLoading();
        webView.setWebViewClient(new WebViewClient());
        ViewGroup parent = (ViewGroup) webView.getParent();
        if (parent != null) parent.removeView(webView); // must detach before destroy()
        webView.destroy();
        if (dialog.isShowing()) dialog.dismiss();
    }
}
