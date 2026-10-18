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

describe('optional browser accessibility evidence', () => {
  it('inspects label associations and ID references without returning text, URLs or field values', () => {
    const result = run(`
      import {Window} from 'happy-dom';
      import {inspectAccessibilityDocument,assertAccessibilityInventory} from './scripts/qa/accessibility-browser.mjs';
      const window=new Window();globalThis.document=window.document;
      const document=window.document;
      document.documentElement.lang='en';document.documentElement.dir='ltr';
      Object.defineProperty(document.documentElement,'clientWidth',{value:390});
      Object.defineProperty(document.documentElement,'scrollWidth',{value:390});
      // Geometry is mocked only in this DOM unit fixture; the browser uses real rectangles.
      window.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}]};
      document.body.innerHTML='<button>Language</button><label for="secret">Password</label><input id="secret" type="password" value="invented-private-marker"><input type="hidden" value="invented-private-marker"><button hidden>Hidden</button><p id="help">Help</p><textarea aria-label="Report" aria-describedby="help"></textarea><a href="https://fixture.invalid/invented-private-marker">Link</a>';
      const valid=inspectAccessibilityDocument();assertAccessibilityInventory(valid,'en');
      const tagged=document.querySelectorAll('[data-qa-focus-index]').length;
      document.querySelector('label').remove();
      document.querySelector('textarea').setAttribute('aria-describedby','missing');
      const duplicate=document.createElement('p');duplicate.id='help';document.body.append(duplicate);
      const invalid=inspectAccessibilityDocument();
      let rejected=false;try{assertAccessibilityInventory(invalid,'en')}catch{rejected=true}
      console.log(JSON.stringify({valid,tagged,invalid,rejected}));
    `);
    expect(result.valid).toMatchObject({ controls: 4, unnamedControls: 0, duplicateIds: 0, brokenReferences: 0 });
    expect(result.tagged).toBe(4);
    expect(result.invalid).toMatchObject({ unnamedControls: 1, duplicateIds: 1, brokenReferences: 1 });
    expect(result.rejected).toBe(true);
  });

  it.each([
    'language',
    'direction',
    'duplicateIds',
    'brokenReferences',
    'unnamedControls',
    'positiveTabIndices',
    'controls',
    'scrollWidth',
  ])('rejects an invalid %s inventory instead of claiming accessibility passed', (field) => {
    const result = run(`
        import {assertAccessibilityInventory} from './scripts/qa/accessibility-browser.mjs';
        const snapshot={language:'en',direction:'ltr',duplicateIds:0,brokenReferences:0,unnamedControls:0,positiveTabIndices:0,controls:3,width:390,scrollWidth:390};
        const field=${JSON.stringify(field)};
        snapshot[field]=field==='language'?'fa':field==='direction'?'rtl':field==='controls'?0:field==='scrollWidth'?391:1;
        let rejected=false;try{assertAccessibilityInventory(snapshot,'en')}catch{rejected=true}
        console.log(JSON.stringify({rejected}));
      `);
    expect(result.rejected).toBe(true);
  });

  it('removes enlarged-text styling and temporary markers when the enlarged inventory fails', () => {
    const result = run(`
      import {runAccessibilityBrowserChecks} from './scripts/qa/accessibility-browser.mjs';
      let inventories=0,removed=0,cleaned=0,active='0';
      const snapshot={language:'fa',direction:'rtl',duplicateIds:0,brokenReferences:0,unnamedControls:0,positiveTabIndices:0,controls:2,width:390,scrollWidth:390};
      const page={
        locator(selector){return {async focus(){active=selector.includes('"1"')?'1':'0'}}},
        keyboard:{async press(key){active=key==='Shift+Tab'?'0':'1'}},
        async addStyleTag(){return {async evaluate(){removed++}}},
        async evaluate(fn){
          if(fn.name==='inspectAccessibilityDocument')return {...snapshot,scrollWidth:++inventories===2?600:390};
          if(fn.toString().includes('activeElement'))return active;
          if(fn.toString().includes('fontSize'))return 16;
          cleaned++;
        },
      };
      let rejected=false;try{await runAccessibilityBrowserChecks({page,locale:'fa'})}catch{rejected=true}
      console.log(JSON.stringify({rejected,removed,cleaned,inventories}));
    `);
    expect(result).toEqual({ rejected: true, removed: 1, cleaned: 1, inventories: 2 });
  });
});
