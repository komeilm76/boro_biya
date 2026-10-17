import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { VApp, VBtn, VMain } from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import App from './App.vue';
import { useSessionStore } from './stores/session.js';
import { loadWebClientConfig } from './config.js';
import { applyDocumentDirection, createAppI18n, savedLocale } from './i18n/index.js';
import { createAppRouter } from './router/index.js';
import { installRouteGuards } from './router/guards.js';
import './styles/main.css';

/**
 * Composition root. Configuration is validated first and fails the startup loudly on an invalid
 * build environment. The i18n locale is the configured default — English — and is never inferred
 * from headers or geo-IP (ADR-018); direction follows the locale (UI-22).
 */
loadWebClientConfig();

const app = createApp(App);
app.use(createPinia());

const i18n = createAppI18n(savedLocale());
app.use(i18n);
applyDocumentDirection(String(i18n.global.locale.value));

// ADR-009: Vuetify owns the component layer. Components are registered explicitly — the
// tree-shaking plugin is deliberately not used (peer optional, verified 2026-10-14) — so later
// phases add the components they use here instead of shipping the whole library.
app.use(createVuetify({ components: { VApp, VBtn, VMain }, directives }));

await useSessionStore().restore();
const router = createAppRouter();
installRouteGuards(router);
app.use(router);

void router.isReady().then(() => {
  app.mount('#app');
});
