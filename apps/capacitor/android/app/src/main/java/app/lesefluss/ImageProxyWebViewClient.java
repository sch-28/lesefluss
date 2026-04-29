package app.lesefluss;

import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/** Re-fetches cross-origin images via OkHttp, stripping CORP/COEP headers the WebView would otherwise enforce. */
class ImageProxyWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "ImageProxyWebViewClient";
    private static final String[] IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"};

    private final OkHttpClient client;

    ImageProxyWebViewClient(Bridge bridge) {
        super(bridge);
        client = new OkHttpClient.Builder()
                .protocols(Arrays.asList(Protocol.HTTP_1_1))
                .followRedirects(true)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String host = request.getUrl().getHost();
        if (host == null || host.equals("localhost") || !looksLikeImage(request)) {
            return super.shouldInterceptRequest(view, request);
        }

        String url = request.getUrl().toString();
        try {
            Request.Builder req = new Request.Builder().url(url);
            for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
                req.header(entry.getKey(), entry.getValue());
            }
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) req.header("Cookie", cookies);

            Response res = client.newCall(req.get().build()).execute();
            ResponseBody body = res.body();
            if (body == null || !res.isSuccessful()) {
                if (body != null) body.close();
                return super.shouldInterceptRequest(view, request);
            }

            // Strip CORP/COEP headers that would block the cross-origin load.
            Map<String, String> headers = new HashMap<>();
            for (String name : res.headers().names()) {
                String lower = name.toLowerCase(Locale.US);
                if (!lower.equals("cross-origin-resource-policy") &&
                        !lower.equals("cross-origin-embedder-policy")) {
                    headers.put(name, res.header(name));
                }
            }

            okhttp3.MediaType mt = body.contentType();
            String mimeType = (mt != null) ? mt.type() + "/" + mt.subtype() : "image/jpeg";
            String reason = res.message().isEmpty() ? "OK" : res.message();
            return new WebResourceResponse(mimeType, "binary", res.code(), reason, headers, body.byteStream());
        } catch (IOException e) {
            Log.w(TAG, "image proxy failed for " + url, e);
            return super.shouldInterceptRequest(view, request);
        }
    }

    private boolean looksLikeImage(WebResourceRequest request) {
        String accept = request.getRequestHeaders().get("Accept");
        if (accept != null && accept.startsWith("image/")) return true;

        String path = request.getUrl().getPath();
        if (path == null) return false;
        String lower = path.toLowerCase(Locale.US);
        for (String ext : IMAGE_EXTENSIONS) {
            if (lower.endsWith(ext)) return true;
        }
        return false;
    }
}
