import { createI18n } from 'vue-i18n';
import { messages } from './messages.js';

/** English-default bilingual catalogue with explicit RTL support for Persian. */
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages,
});
