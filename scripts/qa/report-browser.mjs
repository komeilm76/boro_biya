import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run after the four primary real submissions: the unchanged origin quota is five.
// Lose the fifth receipt after real acceptance; subsequent deliberate retries get real 429s.
export async function runReportBrowserEdges({ browser, origin, onStep }) {
  const results = [];
  for (const locale of ['en', 'fa'])
    for (const mobile of [false, true]) {
      const result = { locale, viewport: mobile ? '390x844 (emulated)' : '1280x900' };
      const messages = JSON.parse(
        await readFile(new URL(`../../apps/web/src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
      );
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const gate = Promise.withResolvers();
      try {
        let requests = 0;
        let pageErrors = 0;
        let routeFailure = false;
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.on('pageerror', () => pageErrors++);
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().endsWith('/api/v1/security/reports')) requests++;
        });
        onStep(`${locale}/${result.viewport}: reporting network failure`);
        await page.goto(`${origin}/_public/report`);
        await page.locator(`button[lang="${locale}"]`).click();
        assert.equal(await page.locator('html').getAttribute('dir'), locale === 'fa' ? 'rtl' : 'ltr');
        const draft = 'Completely invented reporting outage fixture; no personal data or actual incident.';
        await page.locator('#report-message').fill(draft);
        const pattern = '**/api/v1/security/reports';
        await context.route(pattern, async (route) => {
          try {
            await gate.promise;
            if (locale === 'en' && !mobile) {
              const upstream = await route.fetch();
              result.lostReceiptUpstreamStatus = upstream.status();
            }
          } catch {
            routeFailure = true;
          } finally {
            await route.abort('failed').catch(() => {
              routeFailure = true;
            });
          }
        });
        const started = page.waitForRequest(
          (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/security/reports'),
        );
        await page.locator('button[type="submit"]').click();
        await started;
        assert.equal(await page.locator('form').getAttribute('aria-busy'), 'true');
        for (const control of ['#report-message', '#report-category', 'button[type="submit"]'])
          assert.equal(await page.locator(control).isDisabled(), true);
        // Exercise the native form API while the real request is pending; busy guard must win.
        await page.locator('form').evaluate((form) => form.requestSubmit());
        assert.equal(requests, 1);
        gate.resolve();
        await page.locator('[role="alert"]').waitFor();
        assert.equal(await page.locator('[role="alert"]').innerText(), messages.report.failed);
        assert.equal(await page.locator('[role="status"]').count(), 0);
        assert.equal(await page.locator('#report-message').inputValue(), draft);
        assert.equal(await page.locator('button[type="submit"]').isDisabled(), false);
        assert.equal(requests, 1);
        assert.equal(routeFailure, false);
        if (locale === 'en' && !mobile) assert.equal(result.lostReceiptUpstreamStatus, 202);
        await context.unroute(pattern);

        onStep(`${locale}/${result.viewport}: reporting quota rejection`);
        const denied = page.waitForResponse(
          (response) => response.url().endsWith('/api/v1/security/reports') && response.request().method() === 'POST',
        );
        await page.locator('button[type="submit"]').click();
        const response = await denied;
        result.quotaStatus = response.status();
        assert.equal(result.quotaStatus, 429);
        const retryAfter = response.headers()['retry-after'];
        assert.match(retryAfter, /^[1-9][0-9]*$/);
        await page.waitForFunction(
          (expected) => globalThis.document.querySelector('[role="alert"]')?.textContent === expected,
          messages.report.limited,
        );
        assert.equal(await page.locator('[role="status"]').count(), 0);
        assert.equal(await page.locator('#report-message').inputValue(), draft);
        assert.equal(await page.locator('button[type="submit"]').isDisabled(), false);
        assert.equal(requests, 2);
        assert.equal(pageErrors, 0);
        assert.equal(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
          ),
          true,
        );
        const storage = await page.evaluate(() => ({
          local: Object.keys(globalThis.localStorage).sort(),
          session: Object.keys(globalThis.sessionStorage),
        }));
        assert.deepEqual(storage, { local: ['boro-locale'], session: [] });
        assert.equal(
          (await context.cookies()).some((cookie) => /boro_(refresh|recovery|reset)$/.test(cookie.name)),
          false,
        );
        results.push({
          ...result,
          networkFailure: 'pass',
          draftRetained: 'pass',
          busyDuplicateBlocked: 'pass',
          submissions: requests,
          automaticReplay: 'absent',
          viewportOverflow: 'pass',
          persistentDraftStorage: 'none in local/session storage',
        });
      } finally {
        gate.resolve();
        await context.close();
      }
    }
  return results;
}
