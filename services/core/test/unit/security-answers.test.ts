import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { createSecurityAnswerService } from '../../src/auth/security-answers.js';
import { readAuthConfig } from '../../src/auth/config.js';

const answers = [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: '  fresh   answer  ' }));
function fixture() {
  const state = { active: true, current: 'old', found: true, catalogue: 5, failNotice: false };
  const query = vi.fn(async (sql: string) => {
    await Promise.resolve();
    if (sql.includes('SELECT password_hash'))
      return { rows: state.found ? [{ password_hash: state.current }] : [], rowCount: state.found ? 1 : 0 };
    if (sql.includes('SELECT s.id FROM core.sessions')) return { rows: [], rowCount: state.active ? 1 : 0 };
    if (sql.includes('SELECT id FROM core.security_questions')) return { rows: [], rowCount: state.catalogue };
    if (sql.includes('INSERT INTO core.notifications') && state.failNotice) throw new Error('notice failed');
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  const hasher = { verify: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue('encoded') };
  const reserve = vi.fn().mockResolvedValue(undefined);
  const service = createSecurityAnswerService(
    db,
    readAuthConfig({ SESSION_SECRET: 'disposable-security-answers-unit-secret', WEB_ORIGIN: 'https://example.test' }),
    hasher,
    'dummy',
    reserve,
  );
  return {
    state,
    query,
    hasher,
    reserve,
    release,
    change: (input = answers, password = 'confirmed') =>
      service('user', 'session', password, input, 'origin', 'request'),
  };
}
describe('security-answer replacement orchestration', () => {
  it('normalizes and hashes sequentially, rechecks authorization and atomically invalidates credentials', async () => {
    const f = fixture();
    await f.change();
    expect(f.hasher.verify).toHaveBeenCalledWith('old', 'confirmed');
    expect(f.hasher.hash).toHaveBeenCalledTimes(5);
    expect(f.hasher.hash).toHaveBeenCalledWith('fresh answer');
    const sql = f.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DELETE FROM core.user_security_answers');
    expect(sql).toContain('UPDATE core.password_reset_challenges');
    expect(sql).toContain('UPDATE core.session_families');
    expect(sql).toContain('INSERT INTO core.audit_events');
    expect(sql).toContain('INSERT INTO core.notifications');
    expect(sql).toContain('COMMIT');
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.reserve).toHaveBeenCalledTimes(2);
  });
  it.each(
    [
      [],
      [answers[0]!, ...answers.slice(0, 4)],
      answers.map((answer) => ({ ...answer, questionId: 9 })),
      answers.map((answer) => ({ ...answer, answer: ' ' })),
    ].map((input) => ({ input })),
  )('rejects invalid selections before native work', async ({ input }) => {
    const f = fixture();
    await expect(f.change(input)).rejects.toMatchObject({ statusCode: 400 });
    expect(f.hasher.hash).not.toHaveBeenCalled();
  });
  it.each([true, false])('requires current-password proof even when the account exists=%s', async (found) => {
    const f = fixture();
    f.state.found = found;
    f.hasher.verify.mockResolvedValue(false);
    await expect(f.change()).rejects.toMatchObject({ statusCode: 401 });
    expect(f.hasher.verify).toHaveBeenCalledWith(found ? 'old' : 'dummy', 'confirmed');
    expect(f.hasher.hash).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'password', 'catalogue'])('rejects %s changes that win during native hashing', async (mode) => {
    const f = fixture();
    f.hasher.hash.mockImplementation(() => {
      if (mode === 'revoked') f.state.active = false;
      if (mode === 'password') f.state.current = 'changed';
      if (mode === 'catalogue') f.state.catalogue = 4;
      return Promise.resolve('encoded');
    });
    await expect(f.change()).rejects.toBeDefined();
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('rolls back answer replacement if notification persistence fails', async () => {
    const f = fixture();
    f.state.failNotice = true;
    await expect(f.change()).rejects.toThrow('notice failed');
    expect(f.query).toHaveBeenCalledWith('ROLLBACK');
    expect(f.query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('stops before hashing when the persisted admission budget is exhausted', async () => {
    const f = fixture();
    f.reserve.mockRejectedValueOnce(new Error('limited'));
    await expect(f.change()).rejects.toThrow('limited');
    expect(f.query).not.toHaveBeenCalled();
  });
});
