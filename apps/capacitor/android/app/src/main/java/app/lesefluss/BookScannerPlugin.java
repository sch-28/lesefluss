package app.lesefluss;

import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Walks a SAF tree URI (from FilePicker.pickDirectory()) and returns a flat list
 * of the files under it. @capacitor/filesystem's readdir does not accept
 * content:// URIs, so the tree is queried directly here.
 *
 * Every file is returned regardless of extension; the JS layer decides what is
 * importable, so changing the supported formats needs no native rebuild.
 */
@CapacitorPlugin(name = "BookScanner")
public class BookScannerPlugin extends Plugin {

    /**
     * Ceilings on the walk. A reader can point this at a folder far larger than
     * a book library (an entire storage volume), and the result is marshalled
     * across the bridge as a single JSON string, so an unbounded walk means an
     * unbounded payload. Both limits are reported back rather than applied
     * silently. MAX_DEPTH also keeps the recursion off the stack limit.
     */
    private static final int MAX_DEPTH = 8;
    private static final int MAX_ENTRIES = 20000;

    /**
     * DocumentFile would cost four provider round-trips per file (name, mime
     * twice, size); one cursor per directory with this projection costs one.
     */
    private static final String[] PROJECTION = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE
    };

    /**
     * Capacitor runs every plugin call on one shared HandlerThread, so a walk of
     * a large library there would stall every other plugin (Preferences,
     * Filesystem, sync) for its whole duration.
     */
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void listFiles(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("Missing 'uri'");
            return;
        }

        executor.execute(() -> {
            try {
                Uri tree = Uri.parse(uriStr);
                String rootId = DocumentsContract.getTreeDocumentId(tree);
                JSArray entries = new JSArray();
                boolean truncated = walk(tree, rootId, "", 0, entries);

                JSObject result = new JSObject();
                result.put("entries", entries);
                result.put("truncated", truncated);
                call.resolve(result);
            } catch (Throwable t) {
                // Throwable, not Exception: a walk that exhausts the heap raises
                // an Error, which would otherwise reach the executor uncaught and
                // take the process down instead of failing the call.
                call.reject("Scan failed: " + t.getMessage());
            }
        });
    }

    /** Returns true when a ceiling stopped the walk before the tree was exhausted. */
    private boolean walk(Uri tree, String documentId, String prefix, int depth, JSArray out) {
        if (depth > MAX_DEPTH) return true;

        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId);
        boolean truncated = false;

        try (Cursor cursor = getContext().getContentResolver().query(children, PROJECTION, null, null, null)) {
            if (cursor == null) return false;
            while (cursor.moveToNext()) {
                if (out.length() >= MAX_ENTRIES) return true;

                String childId = cursor.getString(0);
                String name = cursor.getString(1);
                if (childId == null || name == null) continue;

                String rel = prefix.isEmpty() ? name : prefix + "/" + name;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2))) {
                    truncated |= walk(tree, childId, rel, depth + 1, out);
                    continue;
                }

                JSObject entry = new JSObject();
                entry.put("relativePath", rel);
                entry.put("name", name);
                entry.put("size", cursor.isNull(3) ? 0 : cursor.getLong(3));
                entry.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, childId).toString());
                out.put(entry);
            }
        }

        return truncated;
    }
}
