import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

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
