import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { authOperations } from '@boro-biya/contracts';
import { applyAuthRoutes } from '../../src/auth/routes.js';
import type { AuthService } from '../../src/auth/service.js';

describe('canonical auth endpoint inventory', () => {
  it('matches every concrete JSON handler, with SSE explicitly separate', async () => {
    const app = Fastify();
    const routes = new Set<string>();
    app.addHook('onRoute', ({ method, url }) => {
      for (const verb of Array.isArray(method) ? method : [method]) {
        if (verb !== 'HEAD') routes.add(`${verb} ${url.replace(/:([^/]+)/g, '{$1}')}`);
      }
    });
    // Registration needs only cookie configuration; handlers are not called in this inventory proof.
    applyAuthRoutes(app, { config: { secureCookies: true } } as AuthService);
    try {
      await app.ready();
      expect(routes.delete('GET /api/v1/streams/events')).toBe(true);
      const contracts = new Set(Object.values(authOperations).map(({ spec }) => `${spec.method} ${spec.pathShape}`));
      expect(contracts.size).toBe(43);
      expect(authOperations.securityStreamTicket.csrfRequired).toBe(true);
      expect(authOperations.setupStatus.csrfRequired).toBe(false);
      expect(authOperations.login.csrfRequired).toBe(true);
      expect(authOperations.me.csrfRequired).toBe(false);
      expect(authOperations.reissueSetupCredential.permission).toBe('users.state');
      expect(routes).toEqual(contracts);
      expect(new Set(Object.values(authOperations).map(({ spec }) => spec.operationId)).size).toBe(43);
      for (const contract of Object.values(authOperations)) {
        expect(contract.spec.response[429]).toBeDefined();
        expect(contract.spec.response[contract.successStatus]).toBe(contract.success);
        if (contract.spec.pathShape.startsWith('/api/v1/admin/')) {
          expect(contract.protection).toBe('bearer');
          expect(contract.permission).toBeTruthy();
        }
      }
    } finally {
      await app.close();
    }
  });
});
