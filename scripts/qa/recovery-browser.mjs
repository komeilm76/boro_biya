import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Real HTTP/database recovery. Proof-cookie replay uses browser-automation access only;
// the application cannot read HttpOnly cookies. Never return or log cookie values.
export async function runRecoveryBrowserEdges({
  browser,
  origin,
  locale,
  mobile,
  username,
  password,
  ownerPage,
  onStep,
  onAccessibility = async () => {},
}) {
  const messages = JSON.parse(
    await readFile(new URL(`../../apps/web/src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
  );
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    timezoneId: 'Asia/Tehran',
  });
  let pageErrors = 0;
  context.on('page', (page) => page.on('pageerror', () => pageErrors++));
  let verificationRequests = 0;
  let resetRequests = 0;
  context.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().endsWith('/api/v1/auth/password/recover/verify')) verificationRequests++;
    if (request.url().endsWith('/api/v1/auth/password/recover/reset')) resetRequests++;
  });
  async function submit(page, endpoint) {
    const response = page.waitForResponse(
      (response) => response.url().endsWith(endpoint) && response.request().method() === 'POST',
    );
    await page.locator('form button[type="submit"]').first().click();
    return (await response).status();
  }
  async function questions(page) {
    page.setDefaultTimeout(15_000);
    await page.goto(`${origin}/_auth/recover`);
    await page.locator(`button[lang="${locale}"]`).click();
    assert.equal(await page.locator('html').getAttribute('dir'), locale === 'fa' ? 'rtl' : 'ltr');
    await page.locator('#recovery-username').waitFor();
    await onAccessibility(page, 'recovery account lookup');
    await page.locator('#recovery-username').fill(username);
    await page.locator('form button[type="submit"]').first().click();
    await page.locator('input[id^="recovery-answer-"]').first().waitFor();
    assert.equal(await page.locator('input[id^="recovery-answer-"]').count(), 3);
    await onAccessibility(page, 'recovery answers');
  }
  async function answers(page, wrong = false) {
    for (const answer of await page.locator('input[id^="recovery-answer-"]').all()) {
      const id = await answer.getAttribute('id');
      await answer.fill(wrong ? 'invented wrong recovery answer' : `invented answer ${id.split('-').at(-1)}`);
    }
  }
  async function failure(page) {
    await page.locator('[role="alert"]').waitFor();
    assert.equal(await page.locator('[role="alert"]').count(), 1);
    assert.equal(await page.locator('[role="alert"]').innerText(), messages.recovery.failed);
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll('input[type="password"]')].every((input) => input.value === ''),
    );
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
  }
  async function layout(page) {
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
      ),
      true,
    );
  }
  try {
    onStep('wrong-answer rejection');
    const stale = await context.newPage();
    await questions(stale);
    await answers(stale, true);
    const wrongAnswersStatus = await submit(stale, '/api/v1/auth/password/recover/verify');
    assert.equal(wrongAnswersStatus, 401);
    await failure(stale);
    await onAccessibility(stale, 'recovery rejected answers');
    assert.equal(await stale.locator('input[id^="recovery-answer-"]').count(), 3);
    assert.equal(await stale.locator('#recovery-password').count(), 0);
    await layout(stale);

    onStep('correct-answer retry');
    await answers(stale);
    const cleanRetryStatus = await submit(stale, '/api/v1/auth/password/recover/verify');
    assert.equal(cleanRetryStatus, 200);
    await stale.locator('#recovery-password').waitFor();
    await onAccessibility(stale, 'recovery replacement password');
    assert.equal(await stale.locator('input[id^="recovery-answer-"]').count(), 0);
    await layout(stale);

    // Leave the first tab's reset form open while a second tab completes recovery.
    // Shared cookies naturally select the second flow; both flows are consumed by reset.
    onStep('second-tab recovery');
    const active = await context.newPage();
    await questions(active);
    await answers(active);
    assert.equal(await submit(active, '/api/v1/auth/password/recover/verify'), 200);
    await active.locator('#recovery-password').fill(password);
    await active.locator('#recovery-repeat').fill(password);
    await layout(active);
    const proofNames = new Set(['boro_recovery', 'boro_reset']);
    const proofCookies = (await context.cookies()).filter((cookie) => proofNames.has(cookie.name));
    assert.equal(proofCookies.length, 2);
    assert(proofCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === 'Strict'));
    const resetStatus = await submit(active, '/api/v1/auth/password/recover/reset');
    assert.equal(resetStatus, 200);
    await active.waitForFunction(() => !globalThis.document.querySelector('form'));
    assert.equal((await context.cookies()).filter((cookie) => proofNames.has(cookie.name)).length, 0);
    await ownerPage.locator('section[aria-label] aside[role="status"]').first().waitFor();
    assert.equal(await ownerPage.locator('section[aria-label] aside[role="status"]').count(), 1);

    onStep('consumed-proof replay');
    // Deliberately restore the exact consumed HttpOnly proof pair in test memory.
    // This tests server rejection of actual consumed proof, not just missing cookies.
    assert(proofCookies.every((cookie) => cookie.expires > Date.now() / 1000));
    await context.addCookies(proofCookies);
    await stale.locator('#recovery-password').fill('Invented!replayed908');
    await stale.locator('#recovery-repeat').fill('Invented!replayed908');
    const consumedProofReplayStatus = await submit(stale, '/api/v1/auth/password/recover/reset');
    assert.equal(consumedProofReplayStatus, 401);
    await failure(stale);
    assert.equal(await stale.locator('#recovery-password').count(), 1);
    assert.equal(await stale.locator('#recovery-repeat').count(), 1);
    assert.equal(await ownerPage.locator('section[aria-label] aside[role="status"]').count(), 1);
    await layout(stale);
    await onAccessibility(stale, 'recovery rejected consumed proof');
    assert.equal(pageErrors, 0);
    assert.equal(verificationRequests, 3);
    assert.equal(resetRequests, 2);
    return {
      wrongAnswersStatus,
      cleanRetryStatus,
      resetStatus,
      consumedProofReplayStatus,
      verificationRequests,
      resetRequests,
      failedSecretsCleared: 'pass',
      genericLocalisedError: 'pass',
      viewportOverflow: 'pass',
    };
  } finally {
    await context.close();
  }
}
