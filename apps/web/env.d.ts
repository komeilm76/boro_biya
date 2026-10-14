/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Empty (same-origin) or a root-relative API base; the browser never names a host (OPS-64). */
  readonly VITE_API_BASE?: string;
  /** ADR-018: the default locale is English and is never inferred from headers or geo-IP. */
  readonly VITE_DEFAULT_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
