import { describe, expect, it } from 'vitest';
import { USAGE, parseArgs } from '../../src/cli.js';
import { CLUSTER_SERVICES, serviceConnectionString } from '../../src/cluster.js';

describe('boro-db argument parsing', () => {
  it('parses commands and flags', () => {
    expect(parseArgs(['init-cluster']).command).toBe('init-cluster');
    expect(parseArgs(['help']).command).toBe('help');
    expect(parseArgs([]).command).toBe('help');

    const up = parseArgs([
      'up',
      '--service',
      'relation',
      '--admin-url',
      'postgres://a:b@h:1/db',
      '--env-file',
      '/tmp/x.env',
    ]);
    expect(up).toMatchObject({
      command: 'up',
      service: 'relation',
      adminUrl: 'postgres://a:b@h:1/db',
      envFile: '/tmp/x.env',
    });

    const down = parseArgs(['down', '--steps', '2']);
    expect(down).toMatchObject({ command: 'down', steps: 2 });
    const downTo = parseArgs(['down', '--to', '3']);
    expect(downTo).toMatchObject({ command: 'down', to: 3 });

    expect(parseArgs(['status', '--no-env-file']).envFile).toBeNull();
    expect(parseArgs(['up', '--repo-root', '/srv/repo']).repoRoot).toBe('/srv/repo');
  });

  it('rejects unknown commands, flags, services, and malformed numbers', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/unknown command/);
    expect(() => parseArgs(['up', '--wat'])).toThrow(/unknown flag/);
    expect(() => parseArgs(['up', '--service', 'billing'])).toThrow(/unknown service/);
    expect(() => parseArgs(['down', '--steps', '0'])).toThrow(/positive integer/);
    expect(() => parseArgs(['down', '--steps', 'x'])).toThrow(/positive integer/);
    expect(() => parseArgs(['down', '--to', '-1'])).toThrow(/non-negative integer/);
    expect(() => parseArgs(['up', '--service'])).toThrow(/needs a value/);
  });

  it('prints usage text that names every command', () => {
    for (const command of ['init-cluster', 'up', 'down', 'status']) {
      expect(USAGE).toContain(command);
    }
  });
});

describe('serviceConnectionString', () => {
  it('swaps role and password while preserving host, port, and database', () => {
    const core = CLUSTER_SERVICES.find((service) => service.key === 'core');
    if (core === undefined) throw new Error('cluster map lost the core service');
    const url = serviceConnectionString('postgresql://admin:admin-pw@db.internal:6543/boro_biya', core, 'role-pw');
    const parsed = new URL(url);
    expect(parsed.username).toBe('boro_core');
    expect(parsed.password).toBe('role-pw');
    expect(parsed.hostname).toBe('db.internal');
    expect(parsed.port).toBe('6543');
    expect(parsed.pathname).toBe('/boro_biya');
  });
});
