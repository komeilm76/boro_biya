// Optional actual-browser checks. Worker loading/capabilities/digest completion are
// selectively fault-injected below. Four new fault cases reuse one real issued nonce;
// server verification/admission and successful retries are never mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCredentialSequence } from './credential-sequence.mjs';

export async function runChallengeBrowserEdges({ browser, origin, password }) {
  const withCredentials = createCredentialSequence();
  const outcomes = await Promise.allSettled(
    ['en', 'fa'].flatMap((locale) =>
      [false, true].map(async (mobile) => {
        const result = { locale, viewport: mobile ? '390x844 (emulated)' : '1280x900', passed: false };
        const context = await browser.newContext({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
          isMobile: mobile,
          hasTouch: mobile,
        });
        let release;
        let stage = 'setup';
        const counts = { verification: 0, credentials: 0 };
        try {
          const messages = JSON.parse(
            await readFile(new URL(`../../apps/web/src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
          );
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          result.issuanceResponses = [];
          page.on('response', async (response) => {
            if (response.url() !== `${origin}/api/v1/auth/challenge` || response.request().method() !== 'POST') return;
            const observation = { stage, status: response.status() };
            result.issuanceResponses.push(observation);
            if (response.status() === 200) {
              try {
                const body = await response.json();
                if (Number.isInteger(body.bits) && body.bits >= 12 && body.bits <= 20) observation.bits = body.bits;
              } catch {
                /* No response values are retained on parse failure. */
              }
            }
          });
          page.on('request', (request) => {
            if (request.method() !== 'POST') return;
            if (request.url().endsWith('/api/v1/auth/challenge/verify')) counts.verification++;
            if (request.url().endsWith('/api/v1/auth/login')) counts.credentials++;
          });
          await page.goto(`${origin}/_auth/login`);
          await page.locator(`button[lang="${locale}"]`).click();
          const username = `browser_${locale}_${mobile ? 'mobile' : 'desktop'}`;
          await page.locator('#username').fill(username);
          await page.locator('#password').fill(password);
          const section = page.locator('section[aria-busy]');
          const status = section.locator('[role="status"]');
          const start = section.getByRole('button', { name: messages.challenge.start, exact: true });
          const activate = async () => {
            await start.focus();
            await page.keyboard.press('Enter');
          };
          const workerPattern = /\/challenge-worker\.ts(?:\?|$)/;
          const noSubmission = () => assert.equal(counts.credentials, 0);
          const untouchedCredentials = async () => {
            assert.equal(await page.locator('#username').inputValue(), username);
            assert.equal(await page.locator('#password').inputValue(), password);
          };
          assert.equal(
            await page.evaluate(
              () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
            ),
            true,
          );
          assert.equal(await status.getAttribute('aria-live'), 'polite');
          assert.equal(await status.innerText(), messages.challenge.idle);
          noSubmission();
          assert.equal(counts.verification, 0);

          stage = 'keyboard cancellation during Worker module loading';
          const gate = Promise.withResolvers();
          release = () => gate.resolve();
          await context.route(workerPattern, async (route) => {
            await gate.promise;
            // Terminating a loading Worker normally aborts this held request.
            await route.continue().catch(() => {});
          });
          await Promise.all([
            context.waitForEvent('request', {
              predicate: (request) => workerPattern.test(request.url()),
              timeout: 30_000,
            }),
            activate(),
          ]);
          stage = 'keyboard cancel activation';
          assert.equal(await section.getAttribute('aria-busy'), 'true');
          assert.equal(await page.locator('form button[type="submit"]').isDisabled(), true);
          await page.locator('#password').press('Enter');
          noSubmission();
          result.busySubmitBlocked = 'pass (keyboard submit while working sends no credentials)';
          const cancel = section.getByRole('button', { name: messages.challenge.cancel, exact: true });
          await cancel.focus();
          await page.keyboard.press('Enter');
          stage = 'release canceled Worker delivery';
          release();
          await context.unrouteAll({ behavior: 'wait' });
          assert.equal(await section.getAttribute('aria-busy'), 'false');
          assert.equal(await status.innerText(), messages.challenge.idle);
          assert.equal(await section.locator('[role="alert"]').count(), 0);
          assert.equal(counts.verification, 0);
          noSubmission();
          await untouchedCredentials();
          result.cancelDuringWorkerLoad = 'pass (keyboard; no verification or credential submission)';

          stage = 'Worker module network failure';
          await context.route(workerPattern, (route) => route.abort('failed').catch(() => {}));
          const [issued] = await Promise.all([
            page.waitForResponse(
              (response) =>
                response.url() === `${origin}/api/v1/auth/challenge` && response.request().method() === 'POST',
            ),
            activate(),
          ]);
          assert.equal(issued.status(), 200);
          const issuedChallenge = await issued.json();
          assert.equal(issuedChallenge.required, true);
          await section.locator('[role="alert"]').waitFor();
          assert.equal(await section.locator('[role="alert"]').innerText(), messages.challenge.failed);
          assert.equal(await section.getAttribute('aria-busy'), 'false');
          assert.equal(await start.isEnabled(), true);
          assert.equal(counts.verification, 0);
          noSubmission();
          await untouchedCredentials();
          result.workerLoadFailure = 'pass (localized generic alert; no verification or credential submission)';
          await context.unrouteAll({ behavior: 'wait' });

          // Start the shipped solver and complete one native SHA-256 call, then hold its
          // result pending. This deterministic seam lets keyboard cancellation happen after
          // hashing began instead of racing a fast proof. It never fabricates a valid proof.
          const digestMarker = 'phase2-native-digest-completed';
          const pendingDigest = `
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest = async (...args) => {
  await nativeDigest(...args);
  console.info('${digestMarker}');
  return new Promise(() => {});
};
`;
          const injectWorker = async (prefix) => {
            await context.route(workerPattern, async (route) => {
              const response = await route.fetch();
              await route.fulfill({ response, body: prefix + (await response.text()) });
            });
          };
          const beginPendingDigest = async () => {
            const [worker] = await Promise.all([
              page.waitForEvent('worker'),
              page.waitForEvent('console', { predicate: (message) => message.text() === digestMarker }),
              activate(),
            ]);
            const closed = Promise.withResolvers();
            worker.once('close', () => closed.resolve());
            return async () => {
              let timer;
              try {
                await Promise.race([
                  closed.promise,
                  new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Worker termination timeout')), 30_000);
                  }),
                ]);
              } finally {
                clearTimeout(timer);
              }
            };
          };
          const unchangedFailure = async () => {
            assert.equal(await section.getAttribute('aria-busy'), 'false');
            assert.equal(await start.isEnabled(), true);
            assert.equal(counts.verification, 0);
            noSubmission();
            await untouchedCredentials();
          };

          // These four deliberately non-verifying capability faults can use the same
          // unsolved native challenge from the preceding load failure. Replay only that
          // response, never a proof/grant or a verification. This isolates new fault cases
          // without raising/resetting the unchanged 30-issue server-origin budget.
          const challengePattern = `${origin}/api/v1/auth/challenge`;
          let capabilityReplays = 0;
          await context.route(challengePattern, (route) => {
            capabilityReplays++;
            return route.fulfill({ json: issuedChallenge });
          });
          result.capabilityFixture = 'four non-verifying faults reuse one native issued nonce; no quota/clock changes';

          stage = 'keyboard cancellation after native hashing begins';
          await injectWorker(pendingDigest);
          const canceledWorkerClosed = await beginPendingDigest();
          assert.equal(await section.getAttribute('aria-busy'), 'true');
          await section.getByRole('button', { name: messages.challenge.cancel, exact: true }).focus();
          await page.keyboard.press('Enter');
          await canceledWorkerClosed();
          await unchangedFailure();
          assert.equal(await status.innerText(), messages.challenge.idle);
          assert.equal(await section.locator('[role="alert"]').count(), 0);
          result.cancelAfterHashingStarts =
            'pass (native SHA-256 completed; result held pending; keyboard cancel closes Worker)';
          await context.unroute(workerPattern);

          stage = 'natural 45-second outer deadline with an unresolved digest';
          await injectWorker(pendingDigest);
          const stalledSince = Date.now();
          const stalledWorkerClosed = await beginPendingDigest();
          await section.locator('[role="alert"]').waitFor({ timeout: 50_000 });
          await stalledWorkerClosed();
          result.observedStalledDigestWaitMs = Date.now() - stalledSince;
          assert(result.observedStalledDigestWaitMs >= 45_000);
          assert.equal(await section.locator('[role="alert"]').innerText(), messages.challenge.failed);
          await unchangedFailure();
          result.stalledDigest = 'pass (native SHA-256 then unresolved digest; unchanged real deadline closes Worker)';
          await context.unroute(workerPattern);

          stage = 'missing Web Crypto capability in Worker';
          await injectWorker(`Object.defineProperty(crypto, 'subtle', { value: undefined });\n`);
          await activate();
          await section.locator('[role="alert"]').waitFor();
          assert.equal(await section.locator('[role="alert"]').innerText(), messages.challenge.failed);
          await unchangedFailure();
          result.unsupportedDigest =
            'pass (simulated absent Web Crypto; generic localized failure; no verification/submission)';
          await context.unroute(workerPattern);

          stage = 'missing Worker capability in browser';
          await page.evaluate(() => {
            globalThis.__phase2Worker = globalThis.Worker;
            globalThis.Worker = undefined;
          });
          try {
            await activate();
            await section.locator('[role="alert"]').waitFor();
            assert.equal(await section.locator('[role="alert"]').innerText(), messages.challenge.failed);
            await unchangedFailure();
            result.unsupportedWorker =
              'pass (simulated absent Worker; generic localized failure; no verification/submission)';
          } finally {
            await page.evaluate(() => {
              globalThis.Worker = globalThis.__phase2Worker;
              delete globalThis.__phase2Worker;
            });
          }

          assert.equal(capabilityReplays, 4);
          result.capabilityChallengeReplays = capabilityReplays;
          await context.unroute(challengePattern);

          stage = 'natural 45-second work deadline during stalled Worker delivery';
          const stalled = Promise.withResolvers();
          release = () => stalled.resolve();
          await context.route(workerPattern, async (route) => {
            await stalled.promise;
            await route.continue().catch(() => {});
          });
          const workStarted = Date.now();
          await Promise.all([
            context.waitForEvent('request', {
              predicate: (request) => workerPattern.test(request.url()),
              timeout: 30_000,
            }),
            activate(),
          ]);
          assert.equal(await section.locator('[role="alert"]').count(), 0);
          assert.equal(await section.getAttribute('aria-busy'), 'true');
          await section.locator('[role="alert"]').waitFor({ timeout: 50_000 });
          result.observedWorkDeadlineWaitMs = Date.now() - workStarted;
          assert(result.observedWorkDeadlineWaitMs >= 45_000);
          assert.equal(await section.locator('[role="alert"]').innerText(), messages.challenge.failed);
          assert.equal(await section.getAttribute('aria-busy'), 'false');
          assert.equal(await start.isEnabled(), true);
          assert.equal(counts.verification, 0);
          noSubmission();
          await untouchedCredentials();
          release();
          await context.unrouteAll({ behavior: 'wait' });
          result.naturalWorkDeadline = 'pass (real 45-second deadline; no clock overrides or automatic retry)';

          const solve = async () => {
            const [verified] = await Promise.all([
              page.waitForResponse(
                (response) =>
                  response.url().endsWith('/api/v1/auth/challenge/verify') && response.request().method() === 'POST',
              ),
              activate(),
            ]);
            result.lastVerificationStatus = verified.status();
            assert.equal(verified.status(), 200);
            const expiry = Date.parse((await verified.json()).expiresAt);
            assert(Number.isFinite(expiry));
            await section.getByText(messages.challenge.ready, { exact: true }).waitFor();
            assert.equal(await section.locator('[role="alert"]').count(), 0);
            assert.equal(await section.getAttribute('aria-busy'), 'false');
            return expiry;
          };
          stage = 'explicit retry after Worker failure';
          const expiry = await solve();
          assert.equal(counts.verification, 1);
          noSubmission();
          await untouchedCredentials();
          result.retryAfterFailure = 'pass (real Worker and server verification; no automatic login)';

          stage = 'natural grant expiry on the unchanged real clock';
          const waitingSince = Date.now();
          await page.waitForFunction(
            (expected) =>
              globalThis.document.querySelector('section[aria-busy] [role="status"]')?.textContent?.trim() === expected,
            messages.challenge.idle,
            { timeout: 65_000, polling: 100 },
          );
          assert(Date.now() >= expiry);
          result.observedExpiryWaitMs = Date.now() - waitingSince;
          assert.equal(counts.verification, 1);
          noSubmission();
          await untouchedCredentials();
          result.naturalGrantExpiry = 'pass (no clock overrides, shortened TTL or automatic login)';

          stage = 'explicit credential submission after the UI cleared its expired grant';
          const [denied] = await Promise.all([
            page.waitForResponse(
              (response) => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
            ),
            page.locator('#password').press('Enter'),
          ]);
          assert.equal(denied.status(), 403);
          await page.waitForFunction(() => !globalThis.document.querySelector('form button[type="submit"]').disabled);
          assert.equal(await page.locator('form [role="alert"]').innerText(), messages.auth.rejected);
          assert.equal(await page.locator('#password').inputValue(), '');
          assert.equal(counts.credentials, 1);
          assert.equal(counts.verification, 1);
          result.expiredAdmission = 'pass (403 and generic feedback; password cleared; no automatic retry)';

          stage = 'explicit new proof and deliberate new credential submission';
          await withCredentials(async () => {
            await page.locator('#password').fill(password);
            await solve();
            assert.equal(counts.credentials, 1);
            assert.equal(counts.verification, 2);
            const [accepted] = await Promise.all([
              page.waitForResponse(
                (response) => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
              ),
              page.locator('#password').press('Enter'),
            ]);
            result.finalLoginStatus = accepted.status();
            assert.equal(accepted.status(), 200);
            await page.waitForURL(`${origin}/_user`);
            await page.locator('time').first().waitFor();
            assert.equal(counts.credentials, 2);
            assert.equal(counts.verification, 2);
          });
          result.manualRetry = 'pass (fresh real proof and explicit login)';
          result.passed = true;
        } catch (error) {
          // Never retain Playwright messages: they can contain filled credentials.
          result.failureStage = stage;
          result.failureType = error instanceof Error ? error.name : 'unknown';
        } finally {
          result.requests = { ...counts };
          release?.();
          await context.close();
        }
        return result;
      }),
    ),
  );
  return outcomes.map((outcome, index) =>
    outcome.status === 'fulfilled'
      ? outcome.value
      : {
          locale: index < 2 ? 'en' : 'fa',
          viewport: index % 2 ? '390x844 (emulated)' : '1280x900',
          passed: false,
          failureStage: 'context setup/teardown',
          failureType: 'BrowserContextError',
        },
  );
}
