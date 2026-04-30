package app.lesefluss;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.Iterator;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;

import okhttp3.ConnectionPool;
import okhttp3.Protocol;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
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
                // Cloudflare edge connections go stale after ~15-20 s of idle time.
                // 10 s is safely below that window; rapid sequential requests still reuse the connection.
                .connectionPool(new ConnectionPool(5, 10, TimeUnit.SECONDS))
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
        String method = call.getString("method", "GET").toUpperCase();
        String reqBody = call.getString("body");
        String contentType = call.getString("contentType", "application/x-www-form-urlencoded");

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

                if ("POST".equals(method)) {
                    RequestBody payload = RequestBody.create(
                            reqBody != null ? reqBody : "",
                            MediaType.parse(contentType));
                    req.post(payload);
                } else {
                    req.get();
                }

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

    /** Shows a floating WebView dialog for Cloudflare challenge resolution; resolves once cf_clearance is set or the target domain loads without a challenge. */
    @PluginMethod
    public void openChallenge(PluginCall call) {
        String url = call.getString("url");
        String userAgent = call.getString("userAgent");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        // Dialog outlives the plugin method call; prevent Capacitor from releasing it early.
        call.setKeepAlive(true);

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            AtomicBoolean finished = new AtomicBoolean(false);
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            // Match the UA used by OkHttp so cf_clearance is bound to the same UA.
            if (userAgent != null && !userAgent.isEmpty()) settings.setUserAgentString(userAgent);

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            boolean isDark = (getContext().getResources().getConfiguration().uiMode
                    & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                    == android.content.res.Configuration.UI_MODE_NIGHT_YES;
            int bgColor      = isDark ? 0xFF242424 : 0xFFFFFFFF;
            int textColor    = isDark ? 0xFFE4E4E4 : 0xFF000000;
            int dividerColor = isDark ? 0xFF333333 : 0xFFEEEEEE;

            float dp = getContext().getResources().getDisplayMetrics().density;

            GradientDrawable roundedBg = new GradientDrawable();
            roundedBg.setColor(bgColor);
            roundedBg.setCornerRadius(16 * dp);

            LinearLayout container = new LinearLayout(getContext());
            container.setOrientation(LinearLayout.VERTICAL);
            container.setBackground(roundedBg);
            container.setClipToOutline(true);

            LinearLayout header = new LinearLayout(getContext());
            header.setOrientation(LinearLayout.HORIZONTAL);
            header.setPadding((int)(16*dp), (int)(14*dp), (int)(8*dp), (int)(14*dp));
            header.setGravity(Gravity.CENTER_VERTICAL);

            TextView titleView = new TextView(getContext());
            titleView.setText("Verify identity");
            titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            titleView.setTextColor(textColor);
            titleView.setTypeface(null, Typeface.BOLD);
            titleView.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            TextView closeBtn = new TextView(getContext());
            closeBtn.setText("✕");
            closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
            closeBtn.setTextColor(0xFF888888);
            int btnPad = (int)(12 * dp);
            closeBtn.setPadding(btnPad, btnPad, btnPad, btnPad);

            header.addView(titleView);
            header.addView(closeBtn);

            View divider = new View(getContext());
            divider.setBackgroundColor(dividerColor);
            divider.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1));

            webView.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

            container.addView(header);
            container.addView(divider);
            container.addView(webView);

            Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_DeviceDefault_Dialog_NoActionBar);
            dialog.setContentView(container);
            dialog.setCancelable(false);

            // Set gravity and disable animation before show() so they apply to the enter transition.
            Window dialogWindow = dialog.getWindow();
            if (dialogWindow != null) {
                dialogWindow.setGravity(Gravity.CENTER);
                dialogWindow.setWindowAnimations(0);
            }

            dialog.setOnShowListener(d -> {
                Window w = dialog.getWindow();
                if (w == null) return;
                DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
                w.setLayout((int)(metrics.widthPixels * 0.92f), (int)(metrics.heightPixels * 0.65f));
                w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            });

            closeBtn.setOnClickListener(v -> {
                if (!finished.compareAndSet(false, true)) return;
                teardown(webView, dialog);
                rejectKeptAlive(call, "CHALLENGE_DISMISSED");
            });

            // Back navigates within the WebView. Dismisses (and rejects) when there is no history left.
            dialog.setOnKeyListener((d, keyCode, event) -> {
                if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        if (!finished.compareAndSet(false, true)) return true;
                        teardown(webView, dialog);
                        rejectKeptAlive(call, "CHALLENGE_DISMISSED");
                    }
                    return true;
                }
                return false;
            });

            String targetHost = Uri.parse(url).getHost();

            webView.setWebViewClient(new WebViewClient() {
                private volatile boolean resolved = false;

                @Override
                public void onPageFinished(WebView view, String loadedUrl) {
                    if (resolved) return;
                    String cookies = cookieManager.getCookie(loadedUrl);

                    if (cookies != null && cookies.contains("cf_clearance=")) {
                        resolved = true;
                        if (!finished.compareAndSet(false, true)) return;
                        // Post to next tick: destroy() inside a WebViewClient callback crashes when the view is still attached.
                        new Handler(Looper.getMainLooper()).post(() -> {
                            teardown(webView, dialog);
                            resolveKeptAlive(call);
                        });
                        return;
                    }

                    // If the page landed on the target domain without a /cdn-cgi/ redirect,
                    // the device may not need a challenge. Managed challenges load at the same
                    // URL but have title "Just a moment..." — check JS title before resolving.
                    String loadedHost = Uri.parse(loadedUrl).getHost();
                    if (targetHost == null || !targetHost.equals(loadedHost) || loadedUrl.contains("/cdn-cgi/")) return;

                    view.evaluateJavascript("document.title", title -> {
                        if (resolved) return;
                        if (title != null && title.toLowerCase().contains("just a moment")) return;
                        resolved = true;
                        if (!finished.compareAndSet(false, true)) return;
                        new Handler(Looper.getMainLooper()).post(() -> {
                            teardown(webView, dialog);
                            resolveKeptAlive(call);
                        });
                    });
                }
            });

            webView.loadUrl(url);
            dialog.show();
        });
    }

    /** Fetches via a headless WebView; Chrome's fingerprint is trusted by CF where OkHttp is not. */
    @PluginMethod
    public void fetchViaWebView(PluginCall call) {
        String url = call.getString("url");
        String userAgent = call.getString("userAgent");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        call.setKeepAlive(true);

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setBlockNetworkImage(true);
            settings.setLoadsImagesAutomatically(false);
            if (userAgent != null && !userAgent.isEmpty()) settings.setUserAgentString(userAgent);

            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

            Handler mainHandler = new Handler(Looper.getMainLooper());
            // Captures the main-frame HTTP status. Android WebView only exposes status codes
            // via onReceivedHttpError (4xx/5xx). Successful 2xx loads are reported as 200.
            final int[] mainStatus = { 200 };
            AtomicBoolean finished = new AtomicBoolean(false);

            Runnable cleanup = () -> {
                mainHandler.removeCallbacksAndMessages(null);
                destroyWebView(webView);
            };

            Runnable timeoutTask = () -> {
                if (!finished.compareAndSet(false, true)) return;
                cleanup.run();
                rejectKeptAlive(call, "FETCH_FAILED: timeout");
            };
            mainHandler.postDelayed(timeoutTask, 30_000);

            webView.setWebViewClient(new WebViewClient() {
                private boolean done = false;

                @Override
                public void onPageFinished(WebView view, String loadedUrl) {
                    if (done) return;
                    // Skip intermediate CF challenge redirects.
                    if (loadedUrl != null && loadedUrl.contains("/cdn-cgi/")) return;
                    done = true;
                    mainHandler.removeCallbacks(timeoutTask);

                    // evaluateJavascript can stall if the WebView crashes mid-load.
                    // Re-arm a shorter watchdog so the call doesn't leak indefinitely.
                    Runnable evalWatchdog = () -> {
                        if (!finished.compareAndSet(false, true)) return;
                        cleanup.run();
                        rejectKeptAlive(call, "FETCH_FAILED: js eval timeout");
                    };
                    mainHandler.postDelayed(evalWatchdog, 5_000);

                    view.evaluateJavascript(
                        "(function(){return document.documentElement.outerHTML;})()",
                        html -> mainHandler.post(() -> {
                            mainHandler.removeCallbacks(evalWatchdog);
                            if (!finished.compareAndSet(false, true)) return;
                            cleanup.run();
                            if (html == null) {
                                rejectKeptAlive(call, "FETCH_FAILED: null html");
                                return;
                            }
                            try {
                                // evaluateJavascript returns a JSON-encoded string; unwrap it.
                                org.json.JSONArray wrapper = new org.json.JSONArray("[" + html + "]");
                                JSObject result = new JSObject();
                                result.put("status", mainStatus[0]);
                                result.put("data", wrapper.getString(0));
                                resolveKeptAlive(call, result);
                            } catch (Exception e) {
                                Log.w(TAG, "fetchViaWebView html parse failed", e);
                                rejectKeptAlive(call, "FETCH_FAILED: " + e.getMessage());
                            }
                        })
                    );
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                    if (done || !request.isForMainFrame()) return;
                    mainStatus[0] = errorResponse.getStatusCode();
                    done = true;
                    mainHandler.removeCallbacks(timeoutTask);
                    mainHandler.post(() -> {
                        if (!finished.compareAndSet(false, true)) return;
                        cleanup.run();
                        rejectKeptAlive(call, "FETCH_FAILED:" + errorResponse.getStatusCode());
                    });
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (done || !request.isForMainFrame()) return;
                    done = true;
                    mainHandler.removeCallbacks(timeoutTask);
                    mainHandler.post(() -> {
                        if (!finished.compareAndSet(false, true)) return;
                        cleanup.run();
                        rejectKeptAlive(call, "FETCH_FAILED:" + error.getErrorCode());
                    });
                }
            });

            webView.loadUrl(url);
        });
    }

    private void destroyWebView(WebView webView) {
        webView.stopLoading();
        webView.setWebViewClient(new WebViewClient());
        ViewGroup parent = (ViewGroup) webView.getParent();
        if (parent != null) parent.removeView(webView); // must detach before destroy()
        webView.destroy();
    }

    private void teardown(WebView webView, Dialog dialog) {
        destroyWebView(webView);
        if (dialog.isShowing()) dialog.dismiss();
    }

    private void resolveKeptAlive(PluginCall call) {
        call.setKeepAlive(false);
        call.resolve();
    }

    private void resolveKeptAlive(PluginCall call, JSObject result) {
        call.setKeepAlive(false);
        call.resolve(result);
    }

    private void rejectKeptAlive(PluginCall call, String message) {
        call.setKeepAlive(false);
        call.reject(message);
    }
}
