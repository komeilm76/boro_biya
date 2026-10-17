import { createI18n } from 'vue-i18n';
import en from './messages/en.json';
import fa from './messages/fa.json';

/**
 * The i18n seam (ADR-017, ADR-018, GOV-63): user-facing strings never live in components; they
 * come from catalogues. English is the default and the fallback, and nothing infers a locale
 * from headers or geo-IP. The catalogues ship together and stay complete in every language —
 * the parity test enforces identical key sets from the first build (the rule QA-17 gates in
 * full once the catalogues grow in Phase 2).
 */
export const SUPPORTED_LOCALES = ['en', 'fa'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export type AppMessages = typeof en;

export function createAppI18n(locale: SupportedLocale = DEFAULT_LOCALE) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { en, fa },
  });
}

/** Layout direction for a locale (UI-22): Persian is right-to-left, English left-to-right. */
export function directionForLocale(locale: string): 'ltr' | 'rtl' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

/** Keep the document direction in sync with the active locale. */
export function applyDocumentDirection(locale: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', directionForLocale(locale));
  document.documentElement.setAttribute('lang', locale);
}

/** Explicit saved choice only; never browser/header/geo detection (ADR-018). */
export function savedLocale(): SupportedLocale {
  try {
    return localStorage.getItem('boro-locale') === 'fa' ? 'fa' : 'en';
  } catch {
    return 'en';
  }
}
