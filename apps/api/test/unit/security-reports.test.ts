import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@boro-biya/db';
import { securityReportSchema } from '@boro-biya/validation';
import { createReportingService, readSecurityReports } from '../../src/security/reports.js';
const input = { category: 'abuse', message: 'Synthetic report with no personal data.', locale: 'en' };
function fixture() {
  const query = vi
      .fn<(sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>()
      .mockResolvedValue({ rows: [{ id: 'report-id' }] }),
    release = vi.fn(),
    reserve = vi.fn().mockResolvedValue(undefined);
  const db = { pool: { query, connect: vi.fn().mockResolvedValue({ query, release }) } } as unknown as Pick<Db, 'pool'>;
  return { db, query, release, reserve, service: createReportingService(db, reserve) };
}
describe('private anonymous report intake', () => {
  it('strictly bounds input and supports Persian without account/contact fields', () => {
    expect(securityReportSchema.parse({ ...input, message: '  ' + input.message + '  ' }).message).toBe(input.message);
    expect(
      securityReportSchema.safeParse({ ...input, locale: 'fa', message: 'این یک گزارش آزمایشی بدون اطلاعات شخصی است.' })
        .success,
    ).toBe(true);
    for (const patch of [
      { message: 'short' },
      { message: '😀'.repeat(10) },
      { message: ' '.repeat(20) },
      { message: 'x'.repeat(4001) },
      { category: 'unknown' },
      { locale: 'de' },
      { contact: 'private' },
      { message: input.message + '\u0000' },
    ])
      expect(securityReportSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('reserves distinct persisted origin/global budgets before an atomic content-free audit', async () => {
    const f = fixture();
    await f.service.submit(input, 'raw-origin', 'request');
    expect(f.reserve.mock.calls).toEqual([
      ['security-report-origin', 'raw-origin', 5, 'request'],
      ['security-report-global', 'inbox', 100, 'request'],
    ]);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO core.security_reports'),
      expect.stringContaining('INSERT INTO core.audit_events'),
      'COMMIT',
    ]);
    expect(f.query.mock.calls[2]?.[1]).toEqual(['report-id', 'request']);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('does not write when validation or quota denies intake', async () => {
    const f = fixture();
    await expect(f.service.submit({ ...input, message: '' }, 'origin', 'request')).rejects.toThrow();
    expect(f.reserve).not.toHaveBeenCalled();
    f.reserve.mockRejectedValue(new Error('quota'));
    await expect(f.service.submit(input, 'origin', 'request')).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it('rolls intake back if audit fails', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'report-id' }] })
      .mockRejectedValueOnce(new Error('audit'));
    await expect(f.service.submit(input, 'origin', 'request')).rejects.toThrow('audit');
    expect(f.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('validates cursors before reading and preserves UTC in bounded operator output', async () => {
    const f = fixture();
    await expect(readSecurityReports(f.db, 'bad')).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
    f.query.mockResolvedValue({
      rows: Array.from({ length: 50 }, () => ({
        id: '01902c60-0000-7000-8000-000000000001',
        category: 'abuse',
        message: input.message,
        locale: 'en',
        created_at: new Date('2026-10-17T00:00:00Z'),
      })),
    });
    const page = await readSecurityReports(f.db);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe(page.items[49]!.id);
    expect(page.items[0]?.createdAt).toBe('2026-10-17T00:00:00.000Z');
    f.query.mockResolvedValue({ rows: [] });
    expect(await readSecurityReports(f.db, page.nextCursor!)).toEqual({ items: [], nextCursor: null });
  });
});
