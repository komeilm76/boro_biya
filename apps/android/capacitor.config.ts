import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor packaging configuration (OPS-30). This workspace is the home of the Android
 * packaging config from Phase 1; the Ionic shell affordances, the plugin allowlist, the native
 * build, and the Phase 8 CI matrix arrive in Phase 8 (GOV-02 — no Android feature work early).
 * The webDir points at the built web artefact: the mobile shell packages the same bundle the
 * web deploys (GOV-90).
 */
const config: CapacitorConfig = {
  appId: 'dev.borobiya.app',
  appName: 'Boro biya',
  webDir: '../web/dist',
  android: {
    // The release plan builds from pinned toolchains; Gradle output stays out of the repo
    // (.gitignore: apps/android/android/).
    allowMixedContent: false,
  },
  server: {
    // Production packaging serves the bundled artefact; no remote server origin is configured.
    androidScheme: 'https',
  },
};

export default config;
