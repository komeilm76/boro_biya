import assert from 'node:assert/strict';

// Executed inside the real page. Return counts/indices only: never form values, text,
// URLs, credentials or an accessibility-tree dump. This is not an assistive-reader test.
export function inspectAccessibilityDocument() {
  const document = globalThis.document;
  const visible = (element) =>
    element.getClientRects().length > 0 &&
    document.defaultView.getComputedStyle(element).visibility !== 'hidden' &&
    !element.closest('[inert], [aria-hidden="true"]');
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  const duplicateIds = ids.length - new Set(ids).size;
  let brokenReferences = 0;
  for (const element of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const id of (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) brokenReferences++;
      }
    }
  }
  const controls = [
    ...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]'),
  ].filter((element) => visible(element) && !element.matches(':disabled') && element.tabIndex >= 0);
  let unnamedControls = 0;
  for (const [index, element] of controls.entries()) {
    const labelled = (element.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .some((id) => document.getElementById(id)?.textContent?.trim());
    const labelledInput = [...(element.labels ?? [])].some((label) => label.textContent?.trim());
    const textControl = ['BUTTON', 'A', 'SUMMARY'].includes(element.tagName) && element.textContent?.trim();
    const inputButton =
      element.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(element.type) && element.value.trim();
    if (!(labelled || labelledInput || element.getAttribute('aria-label')?.trim() || textControl || inputButton))
      unnamedControls++;
    element.setAttribute('data-qa-focus-index', String(index));
  }
  return {
    duplicateIds,
    brokenReferences,
    unnamedControls,
    positiveTabIndices: controls.filter((element) => element.tabIndex > 0).length,
    controls: controls.length,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    language: document.documentElement.lang,
    direction: document.documentElement.dir,
  };
}

export function assertAccessibilityInventory(snapshot, locale) {
  assert.equal(snapshot.language, locale, 'Document language differs from the selected UI language');
  assert.equal(
    snapshot.direction,
    locale === 'fa' ? 'rtl' : 'ltr',
    'Document direction differs from the selected UI language',
  );
  assert.equal(snapshot.duplicateIds, 0, 'Duplicate document IDs');
  assert.equal(snapshot.brokenReferences, 0, 'Unresolved accessible-name/description/control reference');
  assert.equal(snapshot.unnamedControls, 0, 'An enabled visible control lacks an explicit label or text name');
  assert.equal(snapshot.positiveTabIndices, 0, 'Positive tabindex changes native document traversal');
  assert(snapshot.controls > 1 && snapshot.controls < 200, 'Unexpected keyboard-control inventory');
  assert(snapshot.width > 0 && snapshot.scrollWidth <= snapshot.width, 'Document has horizontal layout overflow');
}

export async function runAccessibilityBrowserChecks({ page, locale, onStep = () => {} }) {
  let style;
  try {
    onStep('labels and references');
    const snapshot = await page.evaluate(inspectAccessibilityDocument);
    assertAccessibilityInventory(snapshot, locale);
    onStep('native keyboard traversal');
    const first = page.locator('[data-qa-focus-index="0"]');
    await first.focus();
    // Every subsequent control must be reachable by real Tab navigation. No clicks,
    // forced focus per step, form submission or credential requests are used.
    for (let index = 1; index < snapshot.controls; index++) {
      await page.keyboard.press('Tab');
      const active = await page.evaluate(() => globalThis.document.activeElement?.getAttribute('data-qa-focus-index'));
      onStep(
        `native keyboard traversal (expected ${index}, observed ${active === null ? 'unmarked' : Number(active)})`,
      );
      assert.equal(active, String(index), 'Tab skipped a control or remained trapped');
    }
    await page.locator('[data-qa-focus-index="1"]').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => globalThis.document.activeElement?.getAttribute('data-qa-focus-index')),
      '0',
      'Reverse Tab cannot reach the first control',
    );
    const base = await page.evaluate(() =>
      Number.parseFloat(globalThis.getComputedStyle(globalThis.document.documentElement).fontSize),
    );
    // Explicit user-style text enlargement, not a claim of native browser zoom.
    style = await page.addStyleTag({ content: `html { font-size: ${base * 2}px !important; }` });
    const enlarged = await page.evaluate(inspectAccessibilityDocument);
    onStep(`200% text inventory (layout ${enlarged.scrollWidth}/${enlarged.width})`);
    assertAccessibilityInventory(enlarged, locale);
    assert.equal(enlarged.controls, snapshot.controls, 'Text enlargement hid an enabled control');
    return {
      controls: snapshot.controls,
      labelsAndReferences: 'pass',
      keyboardTraversal: 'pass',
      rootTextEnlargement: '200% user style; pass',
      nativeBrowserZoom: 'not run',
      screenReader: 'not run',
    };
  } finally {
    if (style) await style.evaluate((element) => element.remove());
    await page.evaluate(() => {
      for (const element of globalThis.document.querySelectorAll('[data-qa-focus-index]'))
        element.removeAttribute('data-qa-focus-index');
    });
  }
}
