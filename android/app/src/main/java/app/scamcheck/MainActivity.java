package app.scamcheck;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;

/**
 * Scam Check in the phone's Share menu: a message, screenshot, photo or PDF shared from another app opens
 * the Check screen with it already filled in (the screens read /share?text=… or /share?file=…).
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
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        StringBuilder q = new StringBuilder();
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (subject != null) q.append("&title=").append(enc(subject));
        if (text != null) q.append("&text=").append(enc(text.length() > 20000 ? text.substring(0, 20000) : text));
        Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        String type = intent.getType() == null ? "" : intent.getType();
        if (stream != null && (type.startsWith("image/") || type.equals("application/pdf"))) {
            // Copied into the app's own cache, where the screens can read it (max 15 MB).
            String name = "shared-" + System.currentTimeMillis() + (type.equals("application/pdf") ? ".pdf" : ".jpg");
            try (InputStream in = getContentResolver().openInputStream(stream); OutputStream out = new FileOutputStream(new File(getCacheDir(), name))) {
                byte[] buf = new byte[65536];
                int n;
                long total = 0;
                while (in != null && (n = in.read(buf)) > 0) {
                    total += n;
                    if (total > 15_000_000) break;
                    out.write(buf, 0, n);
                }
                q.append("&file=").append(enc(name)).append("&mime=").append(enc(type));
            } catch (Exception ignored) {
                // The picture couldn't be read: the text (if any) still comes through.
            }
        }
        if (q.length() == 0) return;
        final String url = "https://localhost/share?" + q.substring(1);
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
