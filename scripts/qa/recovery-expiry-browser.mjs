import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCredentialSequence } from './credential-sequence.mjs';

// Real 300-second server expiry. Raw proofs exist only in browser-test memory.
// Replay changes only the client's cookie retention, never the original token or server TTL.
export async function runRecoveryExpiryBrowserEdges({ browser, origin, db, onReady }) {
  const withCredentials = createCredentialSequence();
  return Promise.all(
    ['en', 'fa'].flatMap((locale) =>
      [false, true].map(async (mobile) => {
        const result = { locale, viewport: mobile ? '390x844 (emulated)' : '1280x900', passed: false };
        const contexts = [];
        let stage = 'context setup';
        let ready = false;
        function prepared() {
          if (!ready) {
            ready = true;
            onReady?.();
          }
        }
        let verificationRequests = 0,
          resetRequests = 0,
          pageErrors = 0;
        const username = `browser_${locale}_${mobile ? 'mobile' : 'desktop'}`;
        const proofNames = new Set(['boro_recovery', 'boro_reset']);
        const flowHash = (cookies) =>
          createHash('sha256')
            .update(cookies.find((cookie) => cookie.name === 'boro_recovery').value)
            .digest('hex');
        async function state(hash) {
          return (
            await db.query(
              `SELECT phase,attempts,expires_at <= clock_timestamp() AS expired,
         grant_expires_at <= clock_timestamp() AS grant_expired,
         GREATEST(0,extract(epoch FROM (GREATEST(expires_at,COALESCE(grant_expires_at,expires_at))-clock_timestamp()))*1000)::float8 AS remaining
         FROM core.password_reset_challenges WHERE token_hash=$1`,
              [hash],
            )
          ).rows[0];
        }
        try {
          const messages = JSON.parse(
            await readFile(new URL(`../../apps/web/src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
          );
          const options = {
            viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
            isMobile: mobile,
            hasTouch: mobile,
          };
          const questionContext = await browser.newContext(options);
          contexts.push(questionContext);
          const resetContext = await browser.newContext(options);
          contexts.push(resetContext);
          for (const context of contexts) {
            context.on('page', (page) => page.on('pageerror', () => pageErrors++));
            context.on('request', (request) => {
              if (request.method() !== 'POST') return;
              if (request.url().endsWith('/api/v1/auth/password/recover/verify')) verificationRequests++;
              if (request.url().endsWith('/api/v1/auth/password/recover/reset')) resetRequests++;
            });
          }
          async function start(context) {
            const page = await context.newPage();
            page.setDefaultTimeout(15_000);
            await page.goto(`${origin}/_auth/recover`);
            await page.locator(`button[lang="${locale}"]`).click();
            assert.equal(await page.locator('html').getAttribute('dir'), locale === 'fa' ? 'rtl' : 'ltr');
            await page.locator('#recovery-username').fill(username);
            await page.locator('form button[type="submit"]').first().click();
            await page.locator('input[id^="recovery-answer-"]').first().waitFor();
            assert.equal(await page.locator('input[id^="recovery-answer-"]').count(), 3);
            return page;
          }
          async function answers(page) {
            for (const input of await page.locator('input[id^="recovery-answer-"]').all()) {
              const id = (await input.getAttribute('id')).split('-').at(-1);
              await input.fill(`invented answer ${id}`);
            }
          }
          async function submit(page, endpoint) {
            const response = page.waitForResponse(
              (response) => response.url().endsWith(endpoint) && response.request().method() === 'POST',
            );
            await page.locator('form button[type="submit"]').first().click();
            return (await response).status();
          }
          async function failed(page) {
            await page.locator('[role="alert"]').waitFor();
            assert.equal(await page.locator('[role="alert"]').count(), 1);
            assert.equal(await page.locator('[role="alert"]').innerText(), messages.recovery.failed);
            await page.waitForFunction(() =>
              [...globalThis.document.querySelectorAll('input[type="password"]')].every((input) => input.value === ''),
            );
            assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
            assert.equal(
              await page.evaluate(
                () =>
                  globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
              ),
              true,
            );
          }
          const proofs = async (context) => (await context.cookies()).filter((cookie) => proofNames.has(cookie.name));
          const replay = async (context, cookies) => {
            assert(cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === 'Strict'));
            assert(cookies.find((cookie) => cookie.name === 'boro_reset').expires * 1000 < Date.now());
            assert(cookies.find((cookie) => cookie.name === 'boro_recovery').expires * 1000 > Date.now());
            // Only retain the expired grant in the client as a session cookie. Keep
            // the still-live flow cookie unchanged; server proof lifetimes stay real.
            await context.addCookies(
              cookies.map((cookie) => (cookie.name === 'boro_reset' ? { ...cookie, expires: -1 } : cookie)),
            );
            assert.equal((await proofs(context)).length, cookies.length);
          };
          stage = 'question flow and recovery network outage';
          const questions = await start(questionContext);
          const questionProof = await proofs(questionContext);
          assert.equal(questionProof.length, 1);
          const reset = await start(resetContext);
          const initialResetProof = await proofs(resetContext);
          const resetHash = flowHash(initialResetProof);
          await answers(reset);
          let routeFailure = false;
          const verifyPattern = '**/api/v1/auth/password/recover/verify';
          await resetContext.route(verifyPattern, (route) =>
            route.abort('failed').catch(() => {
              routeFailure = true;
            }),
          );
          await reset.locator('form button[type="submit"]').first().click();
          await failed(reset);
          assert.equal(routeFailure, false);
          assert.equal(verificationRequests, 1);
          assert.equal((await state(resetHash)).attempts, 0);
          await resetContext.unroute(verifyPattern);
          stage = 'explicit correct-answer retry after outage';
          await withCredentials(async () => {
            await answers(reset);
            assert.equal(await submit(reset, '/api/v1/auth/password/recover/verify'), 200);
            await reset.locator('#recovery-password').waitFor();
          });
          const resetProof = await proofs(resetContext);
          assert.equal(resetProof.length, 2);
          const questionHash = flowHash(questionProof);
          const beforeQuestion = await state(questionHash),
            beforeReset = await state(resetHash);
          assert.equal(beforeQuestion.phase, 'challenge');
          assert.equal(beforeQuestion.attempts, 0);
          assert.equal(beforeReset.phase, 'verified');
          assert.equal(beforeReset.attempts, 1);
          assert.equal(beforeQuestion.expired, false);
          assert.equal(beforeReset.grant_expired, false);
          stage = 'natural recovery expiry';
          const waitMs = Math.ceil(Math.max(beforeQuestion.remaining, beforeReset.remaining)) + 1100;
          const started = performance.now();
          prepared();
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          result.observedExpiryWaitMs = Math.round(performance.now() - started);
          assert.equal((await state(questionHash)).expired, true);
          const expiredReset = await state(resetHash);
          assert.equal(expiredReset.expired, true);
          assert.equal(expiredReset.grant_expired, true);
          // Flow-cookie retention is challenge TTL + grant TTL (600 seconds), not
          // the server challenge TTL. The grant cookie alone has naturally expired.
          assert.equal((await proofs(questionContext)).length, 1);
          assert.equal((await proofs(resetContext)).length, 1);
          assert.equal((await proofs(resetContext))[0].name, 'boro_recovery');
          assert.equal(verificationRequests, 2);
          assert.equal(resetRequests, 0);

          stage = 'expired question form with original browser-retained proof';
          await answers(questions);
          result.expiredQuestionsWithProof = await submit(questions, '/api/v1/auth/password/recover/verify');
          assert.equal(result.expiredQuestionsWithProof, 401);
          await failed(questions);
          await questionContext.clearCookies({ name: 'boro_recovery' });
          await answers(questions);
          result.expiredQuestionsWithoutCookies = await submit(questions, '/api/v1/auth/password/recover/verify');
          assert.equal(result.expiredQuestionsWithoutCookies, 401);
          await failed(questions);
          assert.equal(await questions.locator('#recovery-password').count(), 0);
          assert.equal(await questions.locator('input[id^="recovery-answer-"]').count(), 3);
          stage = 'expired reset form and original expired proof replay';
          for (const restore of [false, true]) {
            if (restore) await replay(resetContext, resetProof);
            await reset.locator('#recovery-password').fill('Invented!expired908');
            await reset.locator('#recovery-repeat').fill('Invented!expired908');
            const status = await submit(reset, '/api/v1/auth/password/recover/reset');
            assert.equal(status, 401);
            result[restore ? 'expiredResetWithProof' : 'expiredResetWithoutGrant'] = status;
            await failed(reset);
          }
          const finalQuestion = await state(questionHash),
            finalReset = await state(resetHash);
          assert.equal(finalQuestion.phase, beforeQuestion.phase);
          assert.equal(finalQuestion.attempts, beforeQuestion.attempts);
          assert.equal(finalReset.phase, beforeReset.phase);
          assert.equal(finalReset.attempts, beforeReset.attempts);
          for (const sql of [
            "SELECT count(*)::int AS count FROM core.audit_events WHERE action='password_reset' AND actor_id=(SELECT id FROM core.users WHERE username_normalized=$1)",
            "SELECT count(*)::int AS count FROM core.notifications WHERE event_type='password_reset' AND recipient_id=(SELECT id FROM core.users WHERE username_normalized=$1)",
          ])
            assert.equal((await db.query(sql, [username])).rows[0].count, 1);
          assert.equal(verificationRequests, 4);
          assert.equal(resetRequests, 2);
          assert.equal(pageErrors, 0);
          result.networkOutageAndExplicitRetry = 'pass';
          result.serverProofExpiry = 'pass (original proof values; test-only expired-grant client retention)';
          result.passed = true;
        } catch (error) {
          result.failureStage = stage;
          result.failureType = error instanceof Error ? error.name : 'unknown';
        } finally {
          prepared();
          result.requests = { verification: verificationRequests, reset: resetRequests };
          for (const context of contexts) {
            try {
              await context.close();
            } catch {
              result.passed = false;
              result.failureStage = 'context teardown';
              result.failureType = 'BrowserContextError';
            }
          }
        }
        return result;
      }),
    ),
  );
}
