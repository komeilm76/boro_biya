#!/usr/bin/env node
// Optional real-browser rehearsal, not a replacement for device/screen-reader acceptance.
// Build first; provide an external playwright-core installation and a Chromium executable.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startTestDatabaseServer } from '../../packages/test-utils/dist/pg/index.js';
import { createDb, initCluster } from '../../packages/db/dist/index.js';
import { makeServerConfigFixture } from '../../packages/test-utils/dist/index.js';
import { createLogger, createMetricsRegistry } from '../../packages/server-runtime/dist/index.js';
import { buildApp } from '../../apps/api/dist/app.js';
import { createAuthService } from '../../apps/api/dist/auth/service.js';
import { runChallengeBrowserEdges } from './challenge-browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.env.PHASE2_BROWSER_TOOLS || !process.env.PHASE2_BROWSER_EXECUTABLE) {
  console.error(
    'Set PHASE2_BROWSER_TOOLS (external playwright-core installation) and PHASE2_BROWSER_EXECUTABLE. Build first.',
  );
  process.exit(1);
}
const tools = createRequire(join(resolve(process.env.PHASE2_BROWSER_TOOLS), 'package.json'));
const origin = 'http://localhost:39202';
const password = 'Sailing!violet782';
const replacement = 'Another!violet428';
const report = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
  kind: 'real headless Chromium; mobile viewport emulation, not a physical device or screen reader',
  browser: null,
  automationVersion: null,
  node: process.version,
  startedAt: new Date().toISOString(),
  results: [],
  disabledRecoveryLocales: [],
  returnNavigationRejections: [],
  challengeEdgeCases: [],
  passed: false,
};
let pg, database, db, app, web, browser;
let step = 'setup';
try {
  const { chromium } = tools('playwright-core');
  report.automationVersion = tools('playwright-core/package.json').version;
  const webRequire = createRequire(join(root, 'apps/web/package.json'));
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
  pg = await startTestDatabaseServer();
  database = await pg.createDatabase('phase2_browser');
  const passwords = {
    core: 'disposable-browser-only',
    relation: 'disposable-browser-only',
    sos: 'disposable-browser-only',
  };
  await initCluster({ adminConnectionString: database.adminConnectionString, passwords, repoRoot: root });
  const url = new URL(database.adminConnectionString);
  url.username = 'boro_core';
  url.password = passwords.core;
  db = createDb({ connectionString: url.toString() });
  const authConfig = {
    secret: 'disposable-browser-only-signing-material',
    origin,
    secureCookies: false,
    accessTtlSeconds: 900,
    refreshTtlSeconds: 30 * 86_400,
    maxAccountAttempts: 10,
    maxOriginAttempts: 30,
    windowSeconds: 900,
    lockoutSeconds: 900,
    delayMaxSeconds: 30,
    recoveryEnabled: true,
    recoveryAttempts: 10,
    recoveryChallengeTtlSeconds: 300,
    recoveryGrantTtlSeconds: 300,
    captchaEnabled: false,
    captchaPolicy: {
      secret: 'disposable-browser-challenge-key-material',
      adaptive: true,
      bits: 14,
      threshold: 3,
      ttlSeconds: 300,
      maxAttempts: 5,
      cleanup: false,
    },
  };
  const auth = await createAuthService(db, authConfig);
  app = buildApp({
    config: makeServerConfigFixture({ apiHost: '0.0.0.0' }),
    auth,
    registry: createMetricsRegistry(),
    logger: createLogger({
      service: 'api',
      version: 'browser-rehearsal',
      commit: report.sha,
      level: 'error',
      sink: () => {},
    }),
  });
  await app.listen({ host: '0.0.0.0', port: 39201 });
  process.env.API_PROXY_TARGET = 'http://127.0.0.1:39201';
  web = await createServer({
    root: join(root, 'apps/web'),
    configFile: join(root, 'apps/web/vite.config.ts'),
    logLevel: 'error',
    server: { host: '0.0.0.0', port: 39202, strictPort: true },
  });
  await web.listen();
  // Container sandboxing is unavailable; browser web-security/isolation checks stay enabled.
  browser = await chromium.launch({
    executablePath: process.env.PHASE2_BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  report.browser = browser.version();
  for (const locale of ['en', 'fa'])
    for (const mobile of [false, true]) {
      const label = `${locale}/${mobile ? 'mobile-emulation' : 'desktop'}`;
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        timezoneId: 'Asia/Tehran',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const pageErrors = [];
      page.on('pageerror', () => pageErrors.push('uncaught browser error'));
      async function language(target) {
        await target.locator(`button[lang="${locale}"]`).click();
        await target.waitForFunction((locale) => globalThis.document.documentElement.lang === locale, locale);
        assert.equal(await target.locator('html').getAttribute('dir'), locale === 'fa' ? 'rtl' : 'ltr');
      }
      async function login(target, secret) {
        const destination = '/_user?tab=sessions#security';
        await target.goto(`${origin}${destination}`);
        await target.waitForURL(
          (url) => url.pathname === '/_auth/login' && url.searchParams.get('redirect') === destination,
        );
        await target.locator('#username').fill(`browser_${locale}_${mobile ? 'mobile' : 'desktop'}`);
        await target.locator('#password').fill(secret);
        await target.locator('#password').press('Enter');
        await target.waitForURL(`${origin}${destination}`);
        await target.locator('time').first().waitFor();
      }
      step = `${label}: registration`;
      await page.goto(`${origin}/_auth/register`);
      await language(page);
      assert.equal(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
        ),
        true,
      );
      await page.locator('a[href="/_public/privacy"]').click();
      await page.locator('[data-policy="effective"]').waitFor();
      await page.goto(`${origin}/_auth/register`);
      await page.locator('#register-user').fill(`browser_${locale}_${mobile ? 'mobile' : 'desktop'}`);
      await page.locator('#register-password').fill(password);
      await page.locator('#register-repeat').fill(password);
      for (let index = 0; index < 5; index++)
        await page.locator(`#answer-${index}`).fill(`invented answer ${index + 1}`);
      await page.locator('form button[type="submit"]').click();
      await page.waitForFunction(() => !globalThis.document.querySelector('#register-user'));
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      step = `${label}: login/settings/time disclosure`;
      await login(page, password);
      const instant = await page.locator('time').first().getAttribute('datetime');
      const year = new Intl.DateTimeFormat(
        locale === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-GB-u-ca-gregory-nu-latn',
        { year: 'numeric', timeZone: 'Asia/Tehran' },
      ).format(new Date(instant));
      assert((await page.locator('time').first().innerText()).includes(year));
      const disclosure = page.locator('time').first().locator('..').locator('button');
      await disclosure.focus();
      await page.keyboard.press('Enter');
      assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
      assert.match(await page.locator('code[dir="ltr"]').first().innerText(), /Z$/);
      assert.equal(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
        ),
        true,
      );
      assert((await page.locator('body').ariaSnapshot()).length > 50);
      step = `${label}: recovery and live owner notification`;
      // Wait for actual SSE admission before resetting from an independent cookie context.
      await page.waitForFunction(
        () => globalThis.document.querySelectorAll('section[aria-label] > p[role="status"]').length === 0,
      );
      const recoveryContext = await browser.newContext({ timezoneId: 'Asia/Tehran' });
      try {
        const recovery = await recoveryContext.newPage();
        recovery.setDefaultTimeout(15_000);
        await recovery.goto(`${origin}/_auth/recover`);
        await language(recovery);
        await recovery.locator('#recovery-username').fill(`browser_${locale}_${mobile ? 'mobile' : 'desktop'}`);
        await recovery.locator('form button[type="submit"]').first().click();
        await recovery.locator('input[id^="recovery-answer-"]').first().waitFor();
        for (const answer of await recovery.locator('input[id^="recovery-answer-"]').all()) {
          const id = await answer.getAttribute('id');
          await answer.fill(`invented answer ${id.split('-').at(-1)}`);
        }
        await recovery.locator('form button[type="submit"]').first().click();
        await recovery.locator('#recovery-password').fill(replacement);
        await recovery.locator('#recovery-repeat').fill(replacement);
        await recovery.locator('form button[type="submit"]').first().click();
        await recovery.waitForFunction(() => !globalThis.document.querySelector('form'));
        await page.locator('section[aria-label] aside[role="status"]').first().waitFor();
        assert.equal(await page.locator('section[aria-label] aside[role="status"]').count(), 1);
      } finally {
        await recoveryContext.close();
      }
      step = `${label}: sign-out and privacy/report journey`;
      step = `${label}: activate logout`;
      await page.locator('[data-action="logout"]').click();
      step = `${label}: logout redirect`;
      await page.waitForURL(`${origin}/_auth/login`);
      await page.goto(`${origin}/_user`);
      await page.waitForURL((url) => url.pathname === '/_auth/login');
      step = `${label}: login after recovery`;
      await login(page, replacement);
      step = `${label}: session revocation`;
      const revokeOthers = page.waitForResponse(
        (response) => response.url().endsWith('/api/v1/auth/sessions') && response.request().method() === 'DELETE',
      );
      await page.locator('[data-action="revoke-others"]').click();
      assert.equal((await revokeOthers).status(), 204);
      const revoke = page.waitForResponse(
        (response) =>
          /\/api\/v1\/auth\/sessions\/[^/]+$/.test(response.url()) && response.request().method() === 'DELETE',
      );
      await page.locator('[data-action="revoke-session"]').first().click();
      assert.equal((await revoke).status(), 204);
      await page.locator('p[role="alert"]').waitFor();
      await page.locator('[data-action="logout"]').click();
      await page.waitForURL(`${origin}/_auth/login`);
      await login(page, replacement);
      step = `${label}: privacy navigation`;
      await page.locator('a[href="/_public/privacy"]').click();
      step = `${label}: effective policy`;
      await page.locator('[data-policy="effective"]').waitFor();
      await page.locator('a[href="/_public/report"]').click();
      // Reporting must also work with a separate, signed-out cookie context.
      // Clear signed-in memory by using a fresh context for the actual anonymous submission.
      step = `${label}: anonymous reporting`;
      const anonymousContext = await browser.newContext();
      try {
        const anonymous = await anonymousContext.newPage();
        await anonymous.goto(`${origin}/_public/report`);
        await language(anonymous);
        await anonymous
          .locator('#report-message')
          .fill('A completely invented anonymous security report for this disposable rehearsal.');
        await anonymous.locator('button[type="submit"]').click();
        await anonymous.locator('p[role="status"]').waitFor();
        assert.equal(await anonymous.locator('#report-message').inputValue(), '');
      } finally {
        await anonymousContext.close();
      }
      step = `${label}: inbox verification`;
      const reports = await db.query('SELECT count(*)::int AS count FROM core.security_reports');
      assert.equal(reports.rows[0].count, report.results.length + 1);
      assert.deepEqual(pageErrors, []);
      report.results.push({
        locale,
        viewport: mobile ? '390x844 (emulated)' : '1280x900',
        registration: 'pass',
        keyboardSubmit: 'pass',
        privateReturnNavigation: 'pass (query and hash retained)',
        login: 'pass',
        sessionRevocation: 'pass',
        utcDisclosure: 'pass',
        recovery: 'pass',
        liveNotice: 'pass',
        privacy: 'pass',
        anonymousReport: 'pass',
        physicalDevice: 'not run',
        screenReader: 'not run',
        enabledChallenge: 'not run',
      });
      console.log(`${label}: selected real-browser journeys passed`);
      await context.close();
    }
  // Real successful login must not follow an external target or grant administrative UX.
  for (const locale of ['en', 'fa'])
    for (const kind of ['external', 'unauthorised-admin']) {
      step = `${locale}: rejected ${kind} return target`;
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      try {
        const page = await context.newPage();
        const destination = kind === 'external' ? 'https://example.invalid/never' : '/_admin?tab=roles';
        await page.goto(`${origin}/_auth/login?redirect=${encodeURIComponent(destination)}`);
        await page.locator(`button[lang="${locale}"]`).click();
        await page.locator('#username').fill(`browser_${locale}_desktop`);
        await page.locator('#password').fill(replacement);
        await page.locator('#password').press('Enter');
        await page.waitForURL(`${origin}/_user`);
        await page.locator('time').first().waitFor();
        report.returnNavigationRejections.push({ locale, kind, result: 'pass' });
      } finally {
        await context.close();
      }
    }
  // The same disposable configuration now exercises the enabled branch at default work/risk
  // settings. This is a rehearsal setting, never a change to application defaults or CI budgets.
  authConfig.captchaEnabled = true;
  for (const locale of ['en', 'fa']) {
    step = `${locale}: enabled challenge worker`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${origin}/_auth/login`);
    await page.locator(`button[lang="${locale}"]`).click();
    if (locale === 'en') {
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.locator('#username').fill(`missing_browser_account_${attempt}`);
        await page.locator('#password').fill('invented invalid password');
        const denied = page.waitForResponse(
          (response) => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
        );
        await page.locator('#password').press('Enter');
        assert.equal((await denied).status(), 401);
        await page.waitForFunction(() => !globalThis.document.querySelector('form button[type="submit"]').disabled);
      }
    }
    const verified = page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/auth/challenge/verify') && response.request().method() === 'POST',
    );
    await page.locator('section[aria-busy] > button[type="button"]').first().focus();
    await page.keyboard.press('Enter');
    assert.equal((await verified).status(), 200);
    await page.locator('section[aria-busy="false"]').waitFor();
    await page.locator('#username').fill(`browser_${locale}_desktop`);
    await page.locator('#password').fill(replacement);
    await page.locator('#password').press('Enter');
    await page.waitForURL(`${origin}/_user`);
    report.results.find((result) => result.locale === locale && result.viewport === '1280x900').enabledChallenge =
      'pass (real worker and server verification)';
    console.log(`${locale}: enabled computational challenge passed`);
    await context.close();
  }
  step = 'challenge cancellation/failure/expiry/manual-retry matrix';
  report.challengeEdgeCases = await runChallengeBrowserEdges({ browser, origin, password: replacement });
  assert.equal(report.challengeEdgeCases.length, 4);
  assert(report.challengeEdgeCases.every((result) => result.passed));
  for (const result of report.challengeEdgeCases) {
    report.results.find(
      (primary) => primary.locale === result.locale && primary.viewport === result.viewport,
    ).enabledChallenge = 'pass (real Worker and server verification; edge cases recorded separately)';
  }
  console.log('EN/FA desktop/mobile-emulation challenge cancellation/failure/natural-expiry/manual-retry passed');
  authConfig.recoveryEnabled = false;
  for (const locale of ['en', 'fa']) {
    step = `${locale}: disabled recovery warning`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/_auth/recover`);
    await page.locator(`button[lang="${locale}"]`).click();
    await page.waitForFunction(() => globalThis.document.querySelector('section p[role="status"]'));
    assert.equal(await page.locator('#recovery-username').count(), 0);
    assert((await page.locator('body').ariaSnapshot()).includes('status'));
    report.disabledRecoveryLocales.push(locale);
    console.log(`${locale}: disabled recovery warning passed`);
    await context.close();
  }
  report.passed = true;
} catch (error) {
  report.failureType = error instanceof Error ? error.name : 'unknown';
  // Playwright call logs can include filled secrets. Report the stage, never raw traces.
  report.failure = step;
  console.error(`phase2 browser rehearsal failed at ${step}; credential-bearing traces are intentionally suppressed`);
} finally {
  for (const close of [
    () => browser?.close(),
    () => web?.close(),
    () => app?.close(),
    () => db?.close(),
    () => database?.drop(),
    () => pg?.stop(),
  ]) {
    try {
      await close();
    } catch {
      report.passed = false;
      report.failure ??= 'teardown';
      report.failureType ??= 'CleanupError';
    }
  }
  await mkdir(join(root, 'var'), { recursive: true });
  await writeFile(join(root, 'var/phase2-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
}
// The embedded server's exit hook must not turn a failed rehearsal into exit zero.
process.exit(report.passed ? 0 : 1);
