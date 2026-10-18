import assert from 'node:assert/strict';

// Synthetic durable notices, real HTTP/SSE/tickets/database. Rewind only the browser's
// reconnect cursor to force real server replay; never mock an event or expose ticket URLs.
export async function runStreamBrowserEdges({ context, page, db, username, disconnect, onStep }) {
  let protocol;
  const eventsPath = '/api/v1/streams/events';
  const pattern = '**/api/v1/streams/events?*';
  const notices = page.locator('section[aria-label] aside[role="status"]');
  const owner = (await db.query('SELECT id FROM core.users WHERE username_normalized=$1', [username])).rows[0].id;
  const previous = (
    await db.query('SELECT id FROM core.notifications WHERE recipient_id=$1 ORDER BY id DESC LIMIT 1', [owner])
  ).rows[0].id;
  let tickets = 0,
    streams = 0,
    credentials = 0,
    routeFailure = false,
    cursorMatched = false;
  const request = (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/streams/ticket') tickets++;
    if (request.method() === 'GET' && path === eventsPath) streams++;
    if (request.method() === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/refresh'].includes(path)) credentials++;
  };
  const insert = async () =>
    (
      await db.query(
        "INSERT INTO core.notifications(recipient_id,event_type) VALUES ($1,'password_changed') RETURNING id,created_at",
        [owner],
      )
    ).rows[0];
  page.on('request', request);
  try {
    onStep('live synthetic owner notice');
    await page.waitForFunction(
      () => globalThis.document.querySelectorAll('section[aria-label] > p[role="status"]').length === 0,
    );
    assert.equal(await notices.count(), 0);
    const first = await insert();
    await notices.first().waitFor();
    assert.equal(await notices.count(), 1);
    const firstInstant = first.created_at.toISOString();
    assert.equal(await notices.locator(`time[datetime="${firstInstant}"]`).count(), 1);

    onStep('real transport disconnect and cursor replay');
    protocol = await context.newCDPSession(page);
    await protocol.send('Network.enable');
    let replayedFrames = 0;
    protocol.on('Network.eventSourceMessageReceived', (event) => {
      if (event.eventName === 'security-notice' && event.eventId === first.id) replayedFrames++;
    });
    // The application must request the last validated ID. The test rewinds it only
    // after checking that value, causing the real server to redeliver the first notice.
    await context.route(pattern, async (route) => {
      try {
        const url = new URL(route.request().url());
        cursorMatched = url.searchParams.get('after') === first.id;
        url.searchParams.set('after', previous);
        await route.continue({ url: url.href });
      } catch {
        routeFailure = true;
        await route.abort().catch(() => {});
      }
    });
    const reopened = page.waitForResponse((response) => new URL(response.url()).pathname === eventsPath);
    assert.equal(disconnect(), 1);
    const second = await insert();
    onStep('stream reconnect headers');
    assert.equal((await reopened).status(), 200);
    onStep('replayed and offline notices');
    await notices.locator(`time[datetime="${second.created_at.toISOString()}"]`).waitFor();
    assert.equal(cursorMatched, true);
    assert.equal(replayedFrames, 1);
    assert.equal(routeFailure, false);
    assert.equal(await notices.count(), 2);
    assert.equal(await notices.locator(`time[datetime="${firstInstant}"]`).count(), 1);
    assert.equal(tickets, 1);
    assert.equal(streams, 1);
    assert.equal(credentials, 0);
    await page.waitForFunction(
      () => globalThis.document.querySelectorAll('section[aria-label] > p[role="status"]').length === 0,
    );
    return {
      reconnectStatus: 200,
      freshTickets: tickets,
      reconnects: streams,
      lastValidatedCursor: 'pass',
      actualServerReplay: 'pass',
      replayedFrames,
      uniqueVisibleNotices: 2,
      credentialReplay: 'absent',
    };
  } finally {
    page.off('request', request);
    try {
      await context.unroute(pattern);
    } finally {
      await protocol?.detach();
    }
  }
}
