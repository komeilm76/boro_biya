import { SignJWT, jwtVerify } from 'jose';
import type { AuthConfig } from './config.js';

export function createAccessTokens(config: Pick<AuthConfig, 'secret' | 'origin' | 'accessTtlSeconds'>) {
  if (Buffer.byteLength(config.secret) < 32) throw new Error('access signing secret too short');
  const key = new TextEncoder().encode(config.secret);
  return {
    async sign(userId: string, sessionId: string): Promise<string> {
      return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer('boro-biya')
        .setAudience(config.origin)
        .setIssuedAt()
        .setExpirationTime(`${config.accessTtlSeconds}s`)
        .sign(key);
    },
    async verify(token: string): Promise<{ userId: string; sessionId: string } | null> {
      if (token.length > 4_096) return null;
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: 'boro-biya',
          audience: config.origin,
          typ: 'JWT',
          maxTokenAge: `${config.accessTtlSeconds}s`,
        });
        if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') return null;
        return { userId: payload.sub, sessionId: payload['sid'] };
      } catch {
        return null;
      }
    },
  };
}
