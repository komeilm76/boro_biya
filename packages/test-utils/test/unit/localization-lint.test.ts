import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Exercise the real repository configuration, not a weaker rule-only test configuration.
const eslint = new ESLint({ cwd: resolve('.') });
const filePath = resolve('apps/web/src/pages/PublicLanding.vue');
beforeAll(async () => {
  await eslint.lintText('<template><div /></template>', { filePath });
}, 30000);

describe('active localization lint (UI-21, QA-17)', () => {
  it.each([
    '<template><p>Sign in</p></template>',
    '<template><input placeholder="Password" /></template>',
    '<template><nav aria-label="Language" /></template>',
    '<template><p>{{ "Hard-coded prose" }}</p></template>',
    '<template><button :aria-label="\'Sign in\'" /></template>',
  ])('rejects user-visible literals through the existing lint gate: %s', async (source) => {
    const results = await eslint.lintText(source, { filePath });
    expect(
      results
        .flatMap((result) => result.messages)
        .some(
          (message) =>
            ['vue/no-bare-strings-in-template', 'vue/no-restricted-syntax'].includes(message.ruleId ?? '') &&
            message.severity === 2,
        ),
    ).toBe(true);
  });
  it('accepts catalogue-backed text and accessible labels', async () => {
    const results = await eslint.lintText(
      "<template><nav :aria-label=\"$t('auth.language')\">{{ $t('auth.english') }}</nav></template>",
      { filePath },
    );
    expect(results.flatMap((result) => result.messages).filter((message) => message.severity === 2)).toEqual([]);
  });
});
