import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/messages/en.json';
import fa from '../../src/i18n/messages/fa.json';
import {
  applyDocumentDirection,
  createAppI18n,
  DEFAULT_LOCALE,
  directionForLocale,
  SUPPORTED_LOCALES,
} from '../../src/i18n/index.js';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  const keys: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.push(...flattenKeys(nested, prefix === '' ? key : `${prefix}.${key}`));
  }
  return keys;
}

describe('catalogue parity and defaults (ADR-017, ADR-018; seeds QA-17)', () => {
  it('ships exactly the same key set in every language — catalogues are complete together (UI-28)', () => {
    const english = flattenKeys(en).sort();
    const persian = flattenKeys(fa).sort();
    expect(persian).toEqual(english);
    expect(english.length).toBeGreaterThan(0);
  });

  it('defaults to English and never infers a locale (ADR-018)', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fa']);
    const i18n = createAppI18n();
    expect(String(i18n.global.locale.value)).toBe('en');
  });

  it('resolves messages through the composer', () => {
    const i18n = createAppI18n();
    const translate = i18n.global.t.bind(i18n.global) as (key: string) => string;
    expect(translate('notFound.title')).toBe('Page not found');
  });
});

describe('layout direction (UI-22)', () => {
  it('maps locales to directions', () => {
    expect(directionForLocale('en')).toBe('ltr');
    expect(directionForLocale('fa')).toBe('rtl');
  });

  it('keeps the document direction in sync', () => {
    applyDocumentDirection('fa');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('fa');
    applyDocumentDirection('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});
