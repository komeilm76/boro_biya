import { describe, expect, it } from 'vitest';
import { messages } from './messages.js';

describe('message catalogues', () => {
  it('ships exactly English and Persian in this release baseline', () => {
    expect(Object.keys(messages).sort()).toEqual(['en', 'fa']);
  });

  it('has identical message keys in both catalogues', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fa).sort());
  });

  it('uses English as the default locale', async () => {
    const { i18n } = await import('./index.js');
    expect(i18n.global.locale.value).toBe('en');
  });

  it('provides translated content for every current route shell', () => {
    expect(messages.en['home.title']).toBeTruthy();
    expect(messages.fa['home.title']).toBeTruthy();
    expect(messages.en['admin.home.body']).toBeTruthy();
    expect(messages.fa['admin.home.body']).toBeTruthy();
  });

  it('does not include unfinished catalogue values', () => {
    const values = Object.values(messages.fa);
    expect(values.every((value) => value.trim().length > 0)).toBe(true);
    expect(values.some((value) => value.includes('TODO'))).toBe(false);
  });

  it('ships the direction and language labels in both locales', () => {
    expect(messages.en['nav.language']).toBeTruthy();
    expect(messages.fa['nav.language']).toBeTruthy();
  });
});
