import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app (branch "android"): the same screens as the website, talking to the live site's server. */
const config: CapacitorConfig = {
  appId: 'app.scamcheck',
  appName: 'Scam Check',
  webDir: 'build',
  backgroundColor: '#EBF0F3',
  plugins: {
    // Requests go through Android itself (not the web view), so the live server answers without CORS limits.
    CapacitorHttp: { enabled: true },
    // The app is light: the phone's clock, battery and signal icons are shown dark so they are easy to read.
    SystemBars: { style: 'LIGHT', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
