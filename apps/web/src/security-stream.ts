import { securityNoticeEventSchema } from '@boro-biya/validation';
import { AuthRequestError, type authClient } from './auth-client.js';
export type SecurityNotice = ReturnType<typeof securityNoticeEventSchema.parse>;
/** One memory-only, identity-bound connection. Native EventSource reconnect is disabled:
 * every reconnect obtains a fresh one-shot ticket and passes the last validated event ID. */
export function startSecurityStream(
  issueTicket: () => ReturnType<typeof authClient.securityStreamTicket>,
  onNotice: (notice: SecurityNotice) => void,
  onStatus: (connected: boolean) => void,
) {
  let stopped = false,
    source: EventSource | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    cursor: string | undefined,
    failures = 0;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    source?.close();
    source = undefined;
  };
  function retry(delay?: number) {
    if (stopped) return;
    source?.close();
    source = undefined;
    onStatus(false);
    if (++failures > 8) {
      stop();
      return;
    }
    timer = setTimeout(
      () => {
        void connect();
      },
      delay ?? Math.min(30_000, 1000 * 2 ** failures),
    );
  }
  async function connect() {
    try {
      if (stopped) return;
      const ticket = await issueTicket();
      if (stopped) return;
      const query = new URLSearchParams({ ticket: ticket.ticket, ...(cursor ? { after: cursor } : {}) });
      const connection = new EventSource(`/api/v1/streams/events?${query}`);
      source = connection;
      connection.onopen = () => {
        if (!stopped && source === connection) {
          failures = 0;
          onStatus(true);
        }
      };
      connection.addEventListener('security-notice', (event: MessageEvent<string>) => {
        if (stopped || source !== connection) return;
        try {
          if (event.data.length > 2048) throw new Error('oversized');
          const notice = securityNoticeEventSchema.parse(JSON.parse(event.data));
          if (event.lastEventId !== notice.id) throw new Error('event binding');
          if (cursor && notice.id <= cursor) return;
          cursor = notice.id;
          onNotice(notice);
        } catch {
          retry();
        }
      });
      connection.onerror = () => {
        if (!stopped && source === connection) retry();
      };
    } catch (error) {
      if (stopped) return;
      if (error instanceof AuthRequestError && [401, 403].includes(error.status)) {
        onStatus(false);
        stop();
        return;
      }
      retry(
        error instanceof AuthRequestError && error.status === 429 && error.retryAfterSeconds
          ? error.retryAfterSeconds * 1000
          : undefined,
      );
    }
  }
  void connect();
  return stop;
}
