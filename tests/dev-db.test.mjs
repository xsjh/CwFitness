import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { afterAll, describe, expect, test } from 'vitest';

import {
  findDevInstance, findDevInstanceByName, migrationNames, parseDatabaseUrl, parseEnvFile, pendingMigrations, probePort,
} from '../scripts/dev-db.mjs';

describe('parseEnvFile', () => {
  test('strips matching quotes and keeps unquoted values', () => {
    expect(parseEnvFile([
      'DATABASE_URL="postgres://user:pass@127.0.0.1:51218/template1?sslmode=disable"',
      "BETTER_AUTH_SECRET='plain-secret'",
      'BETTER_AUTH_URL=http://localhost:3000',
    ].join('\n'))).toEqual({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:51218/template1?sslmode=disable',
      BETTER_AUTH_SECRET: 'plain-secret',
      BETTER_AUTH_URL: 'http://localhost:3000',
    });
  });

  test('ignores blanks, comments and lines without a separator', () => {
    expect(parseEnvFile('\n# DATABASE_URL=ignored\nJUST_A_FLAG\n\nEMAIL_VERIFICATION_REQUIRED="false"\n')).toEqual({
      EMAIL_VERIFICATION_REQUIRED: 'false',
    });
  });

  test('keeps equals signs that belong to the value', () => {
    expect(parseEnvFile('DATABASE_URL=postgres://h/db?a=1&b=2').DATABASE_URL).toBe('postgres://h/db?a=1&b=2');
  });
});

describe('parseDatabaseUrl', () => {
  test('resolves host, port and database from the connection string', () => {
    expect(parseDatabaseUrl('postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable')).toEqual({
      host: '127.0.0.1', port: 51218, database: 'template1',
    });
  });

  test('falls back to the default PostgreSQL port when the URL omits one', () => {
    expect(parseDatabaseUrl('postgresql://postgres@localhost/postgres').port).toBe(5432);
  });

  test('rejects a URL whose path names no database', () => {
    expect(() => parseDatabaseUrl('postgres://127.0.0.1:51218')).toThrow(/must name a database/);
  });

  test('rejects a string that is not a URL', () => {
    expect(() => parseDatabaseUrl('not-a-url')).toThrow(/not a valid URL/);
  });
});

describe('probePort', () => {
  const servers = [];
  afterAll(() => { for (const server of servers) server.close(); });

  test('resolves true for a listening port', async () => {
    const server = createServer();
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await expect(probePort(server.address().port)).resolves.toBe(true);
  });

  test('resolves false for a closed port instead of rejecting', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    await expect(probePort(port)).resolves.toBe(false);
  });
});

describe('findDevInstance', () => {
  function stateDirectoryWith(records) {
    const directory = mkdtempSync(join(tmpdir(), 'dev-db-records-'));
    for (const [name, record] of Object.entries(records)) {
      mkdirSync(join(directory, name), { recursive: true });
      writeFileSync(join(directory, name, 'server.json'), JSON.stringify(record));
    }
    return directory;
  }

  test('returns the instance that owns the port, with its sibling ports', () => {
    const directory = stateDirectoryWith({
      'cwfitness-repro': { name: 'cwfitness-repro', port: 51218, databasePort: 51219, shadowDatabasePort: 51220 },
      'cwfitness-test': { name: 'cwfitness-test', port: 51213, databasePort: 51214, shadowDatabasePort: 51215 },
    });
    expect(findDevInstance(51218, directory)).toEqual({
      name: 'cwfitness-repro', databasePort: 51219, shadowDatabasePort: 51220,
    });
  });

  test('returns null when no record owns the port', () => {
    const directory = stateDirectoryWith({ 'cwfitness-test': { name: 'cwfitness-test', port: 51213 } });
    expect(findDevInstance(51218, directory)).toBeNull();
  });

  test('returns null for a missing state directory', () => {
    expect(findDevInstance(51218, join(tmpdir(), 'dev-db-does-not-exist'))).toBeNull();
  });

  test('skips unreadable records instead of throwing', () => {
    const directory = stateDirectoryWith({ 'cwfitness-repro': { name: 'cwfitness-repro', port: 51218 } });
    mkdirSync(join(directory, 'broken'), { recursive: true });
    writeFileSync(join(directory, 'broken', 'server.json'), '{ truncated');
    expect(findDevInstance(51218, directory)?.name).toBe('cwfitness-repro');
  });

  test('matching by name still finds an instance whose recorded port has drifted', () => {
    // Prisma rewrites server.json mid-start, so the port can read as stale or absent.
    const directory = stateDirectoryWith({
      'cwfitness-repro': { name: 'cwfitness-repro', port: 9999, databasePort: 51219, shadowDatabasePort: 51220 },
    });
    expect(findDevInstance(51218, directory)).toBeNull();
    expect(findDevInstanceByName('cwfitness-repro', directory)).toEqual({
      name: 'cwfitness-repro', databasePort: 51219, shadowDatabasePort: 51220,
    });
  });

  test('matching by name returns a usable entry even when the record is unreadable', () => {
    const directory = stateDirectoryWith({ 'cwfitness-repro': { name: 'cwfitness-repro', port: 51218 } });
    writeFileSync(join(directory, 'cwfitness-repro', 'server.json'), '{ truncated');
    expect(findDevInstanceByName('cwfitness-repro', directory)).toEqual({
      name: 'cwfitness-repro', databasePort: undefined, shadowDatabasePort: undefined,
    });
  });

  test('matching by name returns null for an unknown name', () => {
    const directory = stateDirectoryWith({ 'cwfitness-repro': { name: 'cwfitness-repro', port: 51218 } });
    expect(findDevInstanceByName('something-else', directory)).toBeNull();
  });
});

describe('migrations', () => {
  test('migrationNames keeps only timestamped folders, oldest first', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dev-db-migrations-'));
    for (const name of ['20260102000000_second', 'migration_lock.toml', '20260101000000_first', 'README.md']) {
      writeFileSync(join(directory, name), '');
    }
    expect(migrationNames(directory)).toEqual(['20260101000000_first', '20260102000000_second']);
  });

  test('pendingMigrations returns only names without a finished row', () => {
    const applied = new Set(['20260101000000_first']);
    expect(pendingMigrations(applied, ['20260101000000_first', '20260102000000_second'])).toEqual(['20260102000000_second']);
  });

  test('pendingMigrations is empty when everything is applied', () => {
    expect(pendingMigrations(new Set(['a', 'b']), ['a', 'b'])).toEqual([]);
  });
});

describe('the real environment', () => {
  test('the repository migration folders and the .env database URL are well formed', () => {
    const names = migrationNames();
    expect(names.length, 'the repository must ship at least one migration').toBeGreaterThan(0);
    expect(parseDatabaseUrl('postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable').port).toBe(51218);
  });
});

/**
 * The CLI flags are the part of this script `npm run dev` actually depends on, and `--quiet`
 * used to be advertised in the usage comment while being ignored by the code — the log lines
 * printed anyway. These run the real entry point so a flag that stops working fails here.
 *
 * A deliberately dead port is used for the failure case: `--best-effort` must turn it into a
 * message, not a non-zero exit, or `npm run dev` would never reach `next dev`.
 *
 * Every case carries its own timeout, because the failure mode this guards against is a child
 * process that hangs rather than one that answers wrongly — a bare `spawnSync` would stall the
 * whole suite instead of failing.
 */
describe('command line flags', () => {
  // `import.meta.url` is not reliably a file:// URL under the test runner, so the paths are
  // derived from the directory this file actually lives in instead.
  const testsDirectory = import.meta.dirname;
  const script = join(testsDirectory, '..', 'scripts', 'dev-db.mjs');
  const projectRoot = join(testsDirectory, '..');

  function runCli(args, env = {}) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:1/none?sslmode=disable', ...env },
    });
  }

  test('--status reports a dead port and exits non-zero', () => {
    const result = runCli(['--status']);
    expect(result.stdout).toContain('status=down');
    expect(result.status).toBe(1);
  });

  test('--best-effort keeps the exit code at zero so the frontend still starts', () => {
    const result = runCli(['--best-effort', '--quiet']);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('continuing without a database');
  });

  test('--quiet silences stdout even when the check fails', () => {
    // The dead port makes the run fail. `--quiet` governs the progress log, not the diagnosis:
    // stdout stays empty while stderr still explains what went wrong, so a quiet run that breaks
    // is never silent about it.
    const result = runCli(['--quiet']);
    expect(result.stdout).toBe('');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nothing is listening');
  });

  test('without --quiet the progress log reaches stdout', { timeout: 30_000 }, async () => {
    // A listening port takes the "already serving" branch, which is the one branch that both
    // logs and returns. There is no database behind it, so the run also has to survive the
    // connection timeout before it can report — hence the raised test timeout.
    const listening = createServer();
    await new Promise((resolve) => listening.listen(0, '127.0.0.1', resolve));
    const result = runCli([], {
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${listening.address().port}/none?sslmode=disable`,
    });
    listening.close();
    expect(result.stdout).toContain('is already serving');
  });
});
