# Android packaging (Capacitor)

This workspace holds the Capacitor packaging configuration for the mobile shell (OPS-30). It
exists from Phase 1 so the packaging config has a versioned home; the Ionic shell affordances
(camera, geolocation, haptics — the allowlist is fixed in SECURITY §11), the native project, and
the Phase 8 CI matrix (build, lint, unit, instrumented tests) arrive in Phase 8.

The mobile shell packages the same web artefact that `apps/web` builds (`webDir: ../web/dist`),
so the client pipelines stay independent of the backend runtime (GOV-90).
