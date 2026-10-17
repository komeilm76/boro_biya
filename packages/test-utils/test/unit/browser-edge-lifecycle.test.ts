import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function run(script: string) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).not.toContain('invented-private-marker');
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('optional recovery expiry browser evidence fails closed', () => {
  it.each(['construction', 'page', 'teardown'])(
    'releases setup waiters, closes owned contexts and reports only safe %s diagnostics',
    (mode) => {
      const outcome = run(`
        import {runRecoveryExpiryBrowserEdges} from './scripts/qa/recovery-expiry-browser.mjs';
        let closed=0, ready=0;
        const mode=${JSON.stringify(mode)};
        const browser={async newContext(){
          if(mode==='construction')throw new Error('invented-private-marker');
          return {on(){},async newPage(){throw new Error('invented-private-marker')},async close(){closed++;if(mode==='teardown')throw new Error('invented-private-marker')}};
        }};
        const results=await runRecoveryExpiryBrowserEdges({browser,origin:'http://fixture.invalid',db:{},onReady(){ready++}});
        console.log(JSON.stringify({closed,ready,results}));
      `);
      expect(outcome.closed).toBe(mode === 'construction' ? 0 : 8);
      expect(outcome.ready).toBe(4);
      const results = outcome.results as Array<{
        locale: string;
        viewport: string;
        passed: boolean;
        failureType: string;
        failureStage: string;
        requests: { verification: number; reset: number };
      }>;
      expect(results.map(({ locale, viewport }) => [locale, viewport])).toEqual([
        ['en', '1280x900'],
        ['en', '390x844 (emulated)'],
        ['fa', '1280x900'],
        ['fa', '390x844 (emulated)'],
      ]);
      for (const result of results) {
        expect(result.passed).toBe(false);
        expect(result.failureType).toBe(mode === 'teardown' ? 'BrowserContextError' : 'Error');
        expect(result.failureStage).toBe(
          mode === 'teardown'
            ? 'context teardown'
            : mode === 'page'
              ? 'question flow and recovery network outage'
              : 'context setup',
        );
        expect(result.requests).toEqual({ verification: 0, reset: 0 });
      }
    },
  );
  it('sequences explicit credential actions once and continues after a rejection without retry', () => {
    const outcome = run(`
      import {createCredentialSequence} from './scripts/qa/credential-sequence.mjs';
      const sequence=createCredentialSequence(),gate=Promise.withResolvers();
      let active=0,peak=0;const calls=[];
      const first=sequence(async()=>{calls.push(1);active++;peak=Math.max(peak,active);await gate.promise;active--;throw new Error('invented-private-marker')});
      const second=sequence(async()=>{calls.push(2);active++;peak=Math.max(peak,active);active--;return 7});
      await Promise.resolve();gate.resolve();
      const settled=await Promise.allSettled([first,second]);
      console.log(JSON.stringify({calls,peak,statuses:settled.map(x=>x.status),value:settled[1].value}));
    `);
    expect(outcome).toEqual({ calls: [1, 2], peak: 1, statuses: ['rejected', 'fulfilled'], value: 7 });
  });
});
