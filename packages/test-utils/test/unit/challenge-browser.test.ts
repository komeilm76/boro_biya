import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
describe('optional browser challenge evidence fails closed', () => {
  it.each(['construction', 'page', 'teardown'])(
    'reports bounded failures and closes owned contexts after %s failure',
    (mode) => {
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import {runChallengeBrowserEdges} from './scripts/qa/challenge-browser.mjs';
      const marker = 'invented-sensitive-fixture-must-not-be-reported';
      let closed = 0;
      const mode = ${JSON.stringify(mode)};
      const browser = {async newContext() {
        if(mode === 'construction') throw new Error(marker);
        return {async newPage(){throw new Error(marker)}, async close(){closed++;if(mode==='teardown')throw new Error(marker)}};
      }};
      const results = await runChallengeBrowserEdges({browser, origin:'http://fixture.invalid', password:'invented'});
      console.log(JSON.stringify({results, closed}));
    `,
        ],
        { cwd: root, encoding: 'utf8', timeout: 10_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).not.toContain('invented-sensitive-fixture-must-not-be-reported');
      const report = JSON.parse(result.stdout) as {
        closed: number;
        results: { locale: string; viewport: string; passed: boolean; failureStage: string; failureType: string }[];
      };
      expect(report.closed).toBe(mode === 'construction' ? 0 : 4);
      expect(report.results.map(({ locale, viewport }) => [locale, viewport])).toEqual([
        ['en', '1280x900'],
        ['en', '390x844 (emulated)'],
        ['fa', '1280x900'],
        ['fa', '390x844 (emulated)'],
      ]);
      for (const outcome of report.results) {
        expect(outcome.passed).toBe(false);
        expect(outcome.failureStage).toBe(mode === 'page' ? 'setup' : 'context setup/teardown');
        expect(outcome.failureType).toBe(mode === 'page' ? 'Error' : 'BrowserContextError');
      }
    },
  );
});
