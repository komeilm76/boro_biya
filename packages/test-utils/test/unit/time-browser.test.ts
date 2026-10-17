import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('independent real-browser calendar fixture expectations', () => {
  it('pins Gregorian/Persian midnight, year rollover and both daylight-saving boundaries', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {timeFixtures} from './scripts/qa/time-browser.mjs';
      assert.equal(timeFixtures.length,8);
      for(const fixture of timeFixtures) for(const locale of ['en','fa']) {
        const formatter=new Intl.DateTimeFormat(locale==='en'?'en-GB-u-ca-gregory-nu-latn':'fa-IR-u-ca-persian-nu-latn', {
          timeZone:fixture.zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23', timeZoneName:'shortOffset'
        });
        const parts=Object.fromEntries(formatter.formatToParts(new Date(fixture.instant)).map(p=>[p.type,p.value]));
        assert.equal(parts.year+'-'+parts.month+'-'+parts.day,fixture[locale]);
        assert.equal(parts.hour+':'+parts.minute+':'+parts.second,fixture.clock);
        if(locale==='en')assert.equal(parts.timeZoneName,fixture.offset);
      }
      console.log('16 independent calendar/clock expectations passed');
    `,
      ],
      { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8', timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('16 independent calendar/clock expectations passed');
    expect(result.stderr).toBe('');
  });
});
