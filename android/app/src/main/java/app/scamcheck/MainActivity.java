package app.scamcheck;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * Scam Check in the phone's Share menu: a message, screenshots, photos, PDFs or recordings shared from another app
 * open the Check screen and are checked at once; a video opens 🎬 Video (the screens read /share?text=… or
 * /share?files=…&mimes=…, see src/lib/share.ts).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return ""; }
    }

    private void handleShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        StringBuilder q = new StringBuilder();
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (subject != null) q.append("&title=").append(enc(subject));
        if (text != null) q.append("&text=").append(enc(text.length() > 20000 ? text.substring(0, 20000) : text));
        List<Uri> streams = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) streams.addAll(list);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) streams.add(one);
        }
        String fallbackType = intent.getType() == null ? "" : intent.getType();
        // Copying a long video can take a moment: done off the screen's thread, then the app opens it.
        new Thread(() -> {
            StringBuilder names = new StringBuilder();
            StringBuilder mimes = new StringBuilder();
            long stamp = System.currentTimeMillis();
            int i = 0;
            for (Uri uri : streams) {
                if (i >= 10) break; // up to 10 at once, like the picture button
                String type = getContentResolver().getType(uri);
                if (type == null || type.isEmpty() || type.endsWith("/*")) type = fallbackType;
                boolean video = type.startsWith("video/");
                if (!(type.startsWith("image/") || type.equals("application/pdf") || type.startsWith("audio/") || video)) continue;
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
                if (ext == null || !ext.matches("[a-z0-9]{2,5}")) ext = video ? "mp4" : type.startsWith("audio/") ? "m4a" : type.equals("application/pdf") ? "pdf" : "jpg";
                String name = "shared-" + stamp + "-" + i + "." + ext;
                // Copied into the app's own cache, where the screens can read it (videos up to 500 MB, the rest 15 MB).
                long max = video ? 500_000_000L : 15_000_000L;
                boolean ok = false;
                try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(new File(getCacheDir(), name))) {
                    byte[] buf = new byte[65536];
                    int n;
                    long total = 0;
                    while (in != null && (n = in.read(buf)) > 0) {
                        total += n;
                        if (total > max) break;
                        out.write(buf, 0, n);
                    }
                    ok = total > 0 && total <= max;
                } catch (Exception ignored) {
                    // This file couldn't be read: the others (and the text, if any) still come through.
                }
                if (!ok) continue;
                names.append(names.length() > 0 ? "," : "").append(name);
                mimes.append(mimes.length() > 0 ? "," : "").append(type);
                i++;
            }
            if (names.length() > 0) q.append("&files=").append(enc(names.toString())).append("&mimes=").append(enc(mimes.toString()));
            if (q.length() == 0) return;
            final String url = "https://localhost/share?" + q.substring(1);
            getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
        }).start();
    }
}
