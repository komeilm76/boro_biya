import { describe, expect, it, vi } from 'vitest';
import { assertCatalogueParity, catalogueEntries } from './catalogue.js';
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

describe('complete catalogue values and interpolation contracts', () => {
  it('keeps every shipped value nonempty and every interpolation name aligned', () => {
    expect(() => assertCatalogueParity(en, fa)).not.toThrow();
  });
  it.each([
    { reference: { hello: 'Hello' }, translated: {} },
    { reference: { hello: 'Hello' }, translated: { hello: '' } },
    { reference: { hello: 'Hello' }, translated: { hello: 1 } },
    { reference: { hello: 'Hello {name}' }, translated: { hello: 'سلام {other}' } },
    { reference: { hello: 'Hello {name}' }, translated: { hello: 'سلام' } },
  ])('fails closed for incomplete translations %j', ({ reference, translated }) => {
    expect(() => assertCatalogueParity(reference, translated)).toThrow();
  });
  it.each(['en', 'fa'] as const)(
    'renders every catalogue entry in %s without missing-key fallback or parser warnings',
    (locale) => {
      const warnings = vi.spyOn(console, 'warn');
      const diagnostics = vi.spyOn(console, 'error');
      const errors: unknown[] = [];
      const i18n = createAppI18n(locale);
      const messages = catalogueEntries(locale === 'en' ? en : fa);
      for (const [key, message] of Object.entries(messages)) {
        const params = Object.fromEntries(
          [...message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => [match[1]!, 7]),
        );
        const rendered = i18n.global.t(key, params);
        if (!rendered.trim() || rendered === key) errors.push(key);
      }
      expect(errors).toEqual([]);
      expect(warnings).not.toHaveBeenCalled();
      expect(diagnostics).not.toHaveBeenCalled();
      warnings.mockRestore();
      diagnostics.mockRestore();
    },
  );
});
