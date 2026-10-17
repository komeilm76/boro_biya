import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createAppI18n } from '../../src/i18n/index.js';
import { authClient, AuthRequestError } from '../../src/auth-client.js';
import { startSecurityStream as connectSecurityStream } from '../../src/security-stream.js';
import SecurityNoticeStream from '../../src/components/SecurityNoticeStream.vue';
import { useSessionStore } from '../../src/stores/session.js';
function startSecurityStream(
  token: string,
  onNotice: Parameters<typeof connectSecurityStream>[1],
  onStatus: Parameters<typeof connectSecurityStream>[2],
) {
  return connectSecurityStream(
    async () => {
      const { csrfToken } = await authClient.csrf();
      return authClient.securityStreamTicket(token, csrfToken);
    },
    onNotice,
    onStatus,
  );
}
const id = '01902c60-0000-7000-8000-000000000001',
  second = '01902c60-0000-7000-8000-000000000002';
const notice = { id, event: 'password_reset', createdAt: '2026-10-17T10:00:00Z' };
class Source {
  static all: Source[] = [];
  readonly close = vi.fn();
  onopen?: () => void;
  onerror?: () => void;
  listener?: (event: MessageEvent<string>) => void;
  constructor(readonly url: string) {
    Source.all.push(this);
  }
  addEventListener(_name: string, listener: (event: MessageEvent<string>) => void) {
    this.listener = listener;
  }
  emit(value: unknown = notice, last = id) {
    this.listener?.({ data: JSON.stringify(value), lastEventId: last } as MessageEvent<string>);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  Source.all = [];
  vi.stubGlobal('EventSource', Source);
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'C'.repeat(43) });
  vi.spyOn(authClient, 'securityStreamTicket').mockResolvedValue({
    ticket: 'A'.repeat(43),
    expiresAt: '2026-10-17T10:00:15Z',
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('memory-only single-use-ticket notification transport', () => {
  it('uses relative ticket URLs, validates/deduplicates events and reconnects with a fresh ticket/cursor', async () => {
    const accept = vi.fn(),
      status = vi.fn(),
      stop = startSecurityStream('bearer', accept, status);
    await flushPromises();
    const first = Source.all[0]!;
    expect(first.url).not.toContain('bearer');
    expect(first.url).toMatch(/^\/api\/v1\/streams\/events\?ticket=/);
    first.onopen?.();
    first.emit();
    first.emit();
    expect(accept).toHaveBeenCalledTimes(1);
    first.onerror?.();
    expect(first.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(authClient.securityStreamTicket).toHaveBeenCalledTimes(2);
    expect(Source.all[1]?.url).toContain(`after=${id}`);
    stop();
    Source.all[1]?.emit({ ...notice, id: second }, second);
    expect(accept).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...notice, userId: 'foreign' },
    { ...notice, createdAt: '2026-10-17T10:00:00+00:00' },
    { ...notice, event: 'arbitrary' },
  ])('rejects untrusted event projection without changing session state', async (value) => {
    const accept = vi.fn(),
      stop = startSecurityStream('bearer', accept, vi.fn());
    await flushPromises();
    Source.all[0]!.emit(value);
    expect(accept).not.toHaveBeenCalled();
    expect(Source.all[0]!.close).toHaveBeenCalledOnce();
    stop();
  });
  it('rejects mismatched event IDs and oversized or malformed JSON', async () => {
    for (const mode of ['id', 'size', 'json']) {
      const accept = vi.fn(),
        stop = startSecurityStream('bearer', accept, vi.fn());
      await flushPromises();
      const source = Source.all.at(-1)!;
      if (mode === 'id') source.emit(notice, second);
      else
        source.listener?.({ data: mode === 'size' ? 'x'.repeat(2049) : '{', lastEventId: id } as MessageEvent<string>);
      expect(accept).not.toHaveBeenCalled();
      stop();
    }
  });
  it('does not open a stream after unmount/cancellation during ticket issuance', async () => {
    let finish!: (value: { ticket: string; expiresAt: string }) => void;
    vi.mocked(authClient.securityStreamTicket).mockReturnValue(
      new Promise((yes) => {
        finish = yes;
      }),
    );
    const stop = startSecurityStream('bearer', vi.fn(), vi.fn());
    await flushPromises();
    stop();
    finish({ ticket: 'A'.repeat(43), expiresAt: notice.createdAt });
    await flushPromises();
    expect(Source.all).toEqual([]);
  });
  it('does not continue after authentication denial and honours quota retry-after', async () => {
    vi.mocked(authClient.securityStreamTicket).mockRejectedValueOnce(new AuthRequestError(401));
    const stop = startSecurityStream('bearer', vi.fn(), vi.fn());
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60000);
    expect(authClient.securityStreamTicket).toHaveBeenCalledTimes(1);
    stop();
    vi.mocked(authClient.securityStreamTicket).mockRejectedValueOnce(new AuthRequestError(429, 60));
    const next = startSecurityStream('bearer', vi.fn(), vi.fn());
    await flushPromises();
    await vi.advanceTimersByTimeAsync(59999);
    expect(Source.all).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(Source.all).toHaveLength(1);
    next();
  });
  it('bounds repeated connection failures instead of retrying forever', async () => {
    vi.mocked(authClient.csrf).mockRejectedValue(new Error('offline'));
    const stop = startSecurityStream('bearer', vi.fn(), vi.fn());
    await flushPromises();
    for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(30000);
    expect(authClient.csrf).toHaveBeenCalledTimes(9);
    stop();
  });
});
describe('global bilingual in-app security notice display', () => {
  it.each(['en', 'fa'] as const)(
    'shows %s notices across routes without treating them as authorization decisions',
    async (locale) => {
      const pinia = createPinia(),
        session = useSessionStore(pinia);
      session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'bearer', userId: id });
      const wrapper = mount(SecurityNoticeStream, { global: { plugins: [pinia, createAppI18n(locale)] } });
      await flushPromises();
      Source.all[0]!.onopen?.();
      Source.all[0]!.emit();
      await flushPromises();
      expect(wrapper.text()).toContain(createAppI18n(locale).global.t('securityNotices.password_reset'));
      expect(session.isAuthenticated).toBe(true);
      session.clearSession();
      await flushPromises();
      expect(wrapper.text()).toBe('');
      expect(Source.all[0]!.close).toHaveBeenCalledOnce();
      wrapper.unmount();
    },
  );
  it('clears old identity notices and ignores late callbacks even when tokens are reused', async () => {
    const pinia = createPinia(),
      session = useSessionStore(pinia);
    session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'same', userId: id });
    const wrapper = mount(SecurityNoticeStream, { global: { plugins: [pinia, createAppI18n()] } });
    await flushPromises();
    const old = Source.all[0]!;
    old.emit();
    session.replaceSession({ isAuthenticated: true, roles: ['user'], accessToken: 'same', userId: second });
    old.emit();
    await flushPromises();
    expect(wrapper.text()).not.toContain('password was reset');
    expect(wrapper.findAll('aside')).toHaveLength(0);
    wrapper.unmount();
    expect(old.close).toHaveBeenCalledOnce();
  });
});
