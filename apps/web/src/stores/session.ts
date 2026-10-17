import { defineStore } from 'pinia';
import { authClient, authRequest, emptyResponse } from '../auth-client.js';

/** Memory-only bearer state. Route guards are UX only; the server authorizes requests. */
export interface SessionState {
  isAuthenticated: boolean;
  roles: string[];
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
    permissions: [],
    accessToken: '',
    username: '',
    userId: '',
    csrf: '',
    preferredLocale: 'en',
    securityNotices: [],
  }),
  getters: {
    isAdmin: (state): boolean => state.roles.includes('admin') || (state.permissions?.length ?? 0) > 0,
  },
  actions: {
    async login(username: string, password: string): Promise<void> {
      this.clearSession();
      const { csrfToken } = await authClient.csrf();
      const grant = await authClient.login(username, password, csrfToken);
      const account = await authClient.me(grant.accessToken);
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
    },
    async restore(): Promise<void> {
      try {
        const { csrfToken } = await authClient.csrf();
        const grant = await authClient.refresh(csrfToken);
        const account = await authClient.me(grant.accessToken);
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
        this.clearSession();
      }
    },
    async saveLocale(locale: 'en' | 'fa'): Promise<boolean> {
      const token = this.accessToken;
      if (!this.isAuthenticated || !token) throw new Error('auth_request_rejected');
      const saved = await authClient.savePreferences(token, locale);
      // A response from a previous identity must never overwrite a newly signed-in account.
      if (!this.isAuthenticated || this.accessToken !== token) return false;
      this.preferredLocale = saved.locale;
      return true;
    },
    async logout(): Promise<void> {
      try {
        await authRequest('/api/v1/auth/logout', emptyResponse, {
          method: 'POST',
          token: this.accessToken ?? '',
          csrf: this.csrf ?? '',
        });
      } finally {
        this.clearSession();
      }
    },
    /**
     * Replace the whole session state. Until Phase 2 wires the real flow, this action exists so
     * guard behaviour can be exercised against the session shapes the guards must handle. It is
     * never a security control: guards are user experience only, and the server authorizes every
     * request (UI-06, ADR-012).
     */
    replaceSession(next: SessionState): void {
      this.$patch({ isAuthenticated: next.isAuthenticated, roles: [...next.roles] });
    },
    clearSession(): void {
      this.$reset();
    },
  },
});
