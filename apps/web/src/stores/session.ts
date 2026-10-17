import { administrativePermissionKeys } from '@boro-biya/validation';
import { defineStore } from 'pinia';
import { authClient, authRequest, emptyResponse } from '../auth-client.js';

// Serialize cookie-changing operations per store: a late logout response must not erase a
// newer sign-in cookie. The queue and generation are memory-only, never browser storage.
const authQueues = new WeakMap<object, Promise<unknown>>();
function serialized<T>(store: object, operation: () => Promise<T>): Promise<T> {
  const next = (authQueues.get(store) ?? Promise.resolve()).catch(() => undefined).then(operation);
  authQueues.set(store, next);
  const cleanup = () => {
    if (authQueues.get(store) === next) authQueues.delete(store);
  };
  void next.then(cleanup, cleanup);
  return next;
}

/** Memory-only bearer state. Route guards are UX only; the server authorizes requests. */
export interface SessionState {
  isAuthenticated: boolean;
  roles: string[];
  authVersion?: number;
  permissions?: string[];
  accessToken?: string;
  username?: string;
  userId?: string;
  csrf?: string;
  preferredLocale?: 'en' | 'fa';
  securityNotices?: Array<{
    event: 'password_reset' | 'password_changed' | 'security_answers_changed';
    createdAt: string;
  }>;
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    isAuthenticated: false,
    roles: [],
    authVersion: 0,
    permissions: [],
    accessToken: '',
    username: '',
    userId: '',
    csrf: '',
    preferredLocale: 'en',
    securityNotices: [],
  }),
  getters: {
    isAdmin: (state): boolean =>
      state.isAuthenticated &&
      administrativePermissionKeys.some((permission) => state.permissions?.includes(permission)),
  },
  actions: {
    async login(username: string, password: string, challenge?: string): Promise<void> {
      this.clearSession();
      const version = this.authVersion;
      return serialized(this, async () => {
        const current = () => {
          if (this.authVersion !== version) throw new Error('auth_request_rejected');
        };
        current();
        const { csrfToken } = await authClient.csrf();
        current();
        const grant = await authClient.login(username, password, csrfToken, challenge);
        current();
        const account = await authClient.me(grant.accessToken);
        current();
        this.$patch({
          isAuthenticated: true,
          accessToken: grant.accessToken,
          username: account.username,
          userId: account.id,
          preferredLocale: account.preferredLocale,
          securityNotices: account.securityNotices,
          csrf: csrfToken,
          roles: account.roles,
          permissions: account.permissions,
        });
      });
    },
    async restore(): Promise<void> {
      const version = (this.authVersion ?? 0) + 1;
      this.authVersion = version;
      return serialized(this, async () => {
        if (this.authVersion !== version) return;
        try {
          const { csrfToken } = await authClient.csrf();
          if (this.authVersion !== version) return;
          const grant = await authClient.refresh(csrfToken);
          if (this.authVersion !== version) return;
          const account = await authClient.me(grant.accessToken);
          if (this.authVersion !== version) return;
          this.$patch({
            isAuthenticated: true,
            accessToken: grant.accessToken,
            username: account.username,
            userId: account.id,
            preferredLocale: account.preferredLocale,
            securityNotices: account.securityNotices,
            csrf: csrfToken,
            roles: account.roles,
            permissions: account.permissions,
          });
        } catch {
          if (this.authVersion === version) this.clearSession();
        }
      });
    },
    async saveLocale(locale: 'en' | 'fa'): Promise<boolean> {
      const token = this.accessToken;
      if (!this.isAuthenticated || !token) throw new Error('auth_request_rejected');
      const version = this.authVersion;
      const saved = await authClient.savePreferences(token, locale);
      // A response from a previous identity must never overwrite a newly signed-in account.
      if (!this.isAuthenticated || this.accessToken !== token || this.authVersion !== version) return false;
      this.preferredLocale = saved.locale;
      return true;
    },
    async logout(): Promise<void> {
      const token = this.accessToken ?? '';
      this.clearSession();
      return serialized(this, async () => {
        const { csrfToken } = await authClient.csrf();
        await authRequest('/api/v1/auth/logout', emptyResponse, { method: 'POST', token, csrf: csrfToken });
      });
    },
    /**
     * Replace the whole session state, discarding the prior identity and pending auth work.
     * This seam also exercises route-guard session shapes in tests. It is
     * never a security control: guards are user experience only, and the server authorizes every
     * request (UI-06, ADR-012).
     */
    replaceSession(next: SessionState): void {
      this.clearSession();
      this.$patch({
        isAuthenticated: next.isAuthenticated,
        roles: [...next.roles],
        permissions: [...(next.permissions ?? [])],
        accessToken: next.accessToken ?? '',
        username: next.username ?? '',
        userId: next.userId ?? '',
        csrf: next.csrf ?? '',
        preferredLocale: next.preferredLocale ?? 'en',
        securityNotices: [...(next.securityNotices ?? [])],
      });
    },
    clearSession(): void {
      const version = (this.authVersion ?? 0) + 1;
      this.$reset();
      this.authVersion = version;
    },
  },
});
