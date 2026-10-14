import { defineStore } from 'pinia';

/**
 * The session seam. Phase 1 has no authentication (GOV-02): the store starts unauthenticated
 * and nothing in this build can change that outside a test. Phase 2 replaces the contents with
 * the real session flow (AUTH-29 … AUTH-44) behind the same interface, so the route guards and
 * their tests do not change shape when authentication arrives.
 */
export interface SessionState {
  isAuthenticated: boolean;
  roles: string[];
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    isAuthenticated: false,
    roles: [],
  }),
  getters: {
    isAdmin: (state): boolean => state.roles.includes('admin'),
  },
  actions: {
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
      this.$patch({ isAuthenticated: false, roles: [] });
    },
  },
});
