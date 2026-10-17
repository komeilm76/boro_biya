import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { authClient } from '../../src/auth-client.js';
import { useSessionStore } from '../../src/stores/session.js';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'B'.repeat(43) });
  vi.spyOn(authClient, 'securityStreamTicket').mockResolvedValue({
    ticket: 'T'.repeat(43),
    expiresAt: '2026-10-17T10:00:15Z',
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function store() {
  const session = useSessionStore(createPinia());
  session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'bearer', userId: 'owner' });
  return session;
}
describe('stream-ticket cookie ordering with authentication mutations', () => {
  it('serializes pending stream CSRF with logout, never overwriting a newer logout CSRF cookie', async () => {
    const session = store(),
      pending = deferred<{ csrfToken: string }>();
    vi.mocked(authClient.csrf).mockReturnValueOnce(pending.promise);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const ticket = session.issueSecurityStreamTicket().catch(() => null);
    await flushPromises();
    const logout = session.logout();
    await flushPromises();
    expect(authClient.csrf).toHaveBeenCalledTimes(1);
    pending.resolve({ csrfToken: 'A'.repeat(43) });
    await logout;
    expect(await ticket).toBeNull();
    expect(authClient.securityStreamTicket).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'B'.repeat(43) });
    expect(session.isAuthenticated).toBe(false);
  });
  it('discards stale ticket responses after identity change and never mints while signed out', async () => {
    const session = store(),
      pending = deferred<{ ticket: string; expiresAt: string }>();
    vi.mocked(authClient.securityStreamTicket).mockReturnValueOnce(pending.promise);
    const outcome = session.issueSecurityStreamTicket().catch(() => null);
    await flushPromises();
    session.clearSession();
    pending.resolve({ ticket: 'T'.repeat(43), expiresAt: '2026-10-17T10:00:15Z' });
    expect(await outcome).toBeNull();
    await expect(session.issueSecurityStreamTicket()).rejects.toThrow('auth_request_rejected');
    expect(authClient.csrf).toHaveBeenCalledTimes(1);
  });
  it('returns a validated ticket only for its unchanged current identity', async () => {
    const session = store();
    expect((await session.issueSecurityStreamTicket()).ticket).toBe('T'.repeat(43));
    expect(authClient.securityStreamTicket).toHaveBeenCalledWith('bearer', 'B'.repeat(43));
  });
});
