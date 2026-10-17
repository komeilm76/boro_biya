import { defineStore } from 'pinia';
import { authClient, authRequest, emptyResponse } from '../auth-client.js';

/**
 * The session seam. Phase 1 has no authentication (GOV-02): the store starts unauthenticated
 * and nothing in this build can change that outside a test. Phase 2 replaces the contents with
 * the real session flow (ADR-021; AUTH-01 … AUTH-14) behind the same interface, so the route guards and
 * their tests do not change shape when authentication arrives.
 */
export interface SessionState {
  isAuthenticated: boolean;
  roles: string[];
  accessToken?: string;
  username?: string;
  csrf?: string;
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    isAuthenticated: false,
    roles: [],
    accessToken: '',
    username: '',
    csrf: '',
  }),
  getters: {
    isAdmin: (state): boolean => state.roles.includes('admin'),
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
        csrf: csrfToken,
        roles: [],
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
          csrf: csrfToken,
          roles: [],
        });
      } catch {
        this.clearSession();
      }
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
