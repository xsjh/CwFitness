import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

export const root = new URL('../', import.meta.url);
/**
 * The integration suite talks to its own database on the常驻 PostgreSQL service, not to the
 * development one: the suite truncates tables and rewrites rows, so sharing `cwfitness` would
 * wipe whatever the developer is looking at. A separate database gives that isolation for free —
 * an earlier version of this file started a second `prisma dev` instance instead, which also
 * meant the suite inherited that CLI's fragile lock and startup behaviour.
 *
 * The connection is configurable so CI (or a differently provisioned machine) can point it at
 * another server; the defaults match a stock local PostgreSQL install.
 */
export const testDatabaseName = process.env.CWFITNESS_TEST_DB_NAME ?? 'cwfitness_test';
export const databaseUrl = process.env.CWFITNESS_TEST_DATABASE_URL
  ?? `postgres://postgres:0131@127.0.0.1:5432/${testDatabaseName}?sslmode=disable`;
export const baseUrl = 'http://127.0.0.1:3100';
export const localEmailOutbox = join(tmpdir(), 'cwfitness-local-email-outbox.jsonl');
const systemDrive = process.env.SystemDrive ?? 'C:';
export const env = { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: 'cwfitness-integration-test-secret-not-for-production', BETTER_AUTH_URL: baseUrl, TEST_BASE_URL: baseUrl, PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', LOCAL_EMAIL_OUTBOX: localEmailOutbox, EMAIL_VERIFICATION_REQUIRED: 'false', PASSWORD_RESET_EXPIRES_IN_SECONDS: '2', CWFITNESS_DEV_INDICATOR: 'off', HOMEDRIVE: process.env.HOMEDRIVE ?? systemDrive, PROGRAMFILES: process.env.PROGRAMFILES ?? `${systemDrive}\\Program Files` };
export const node = process.execPath;
export const prismaCli = new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname.slice(1);
export const nextCli = new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname.slice(1);
export const playwrightCli = new URL('../node_modules/@playwright/test/cli.js', import.meta.url).pathname.slice(1);

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
export async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  // `next dev` re-execs its real HTTP listener as a grandchild process. Killing only the
  // direct child on Windows leaves that grandchild listening on the test port, and every
  // later run then silently talks to the stale server. Kill the whole tree instead.
  if (process.platform === 'win32') {
    await new Promise((resolve) => { const killer = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); killer.once('error', resolve); killer.once('exit', resolve); });
    return;
  }
  child.kill();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
export async function assertPortFree() {
  try { await fetch(`${baseUrl}/api/plans`, { signal: AbortSignal.timeout(1_000) }); } catch { return; }
  throw new Error(`${baseUrl} is already serving a Next.js instance. Stop it before running the integration tests, otherwise the suite silently runs against the stale server.`);
}
export async function waitForServer(serverProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) throw new Error('Next.js test server exited before it became ready (is the test port already in use?)');
    try { if ((await fetch(`${baseUrl}/api/plans`, { signal: AbortSignal.timeout(2_000) })).status === 401) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Next.js test server did not become ready within 30 seconds');
}
/**
 * Makes sure the test database exists on the常驻 service.
 *
 * `CREATE DATABASE` has no `IF NOT EXISTS`, so existence is checked first — re-running the suite
 * must be a no-op here, not an error. The maintenance database is `postgres`, because you cannot
 * create a database while connected to the one you are creating.
 */
export async function startDatabase() {
  await rm(localEmailOutbox, { force: true });
  const { Client } = await import('pg');
  const maintenance = databaseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const client = new Client({ connectionString: maintenance });
  await client.connect();
  try {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [testDatabaseName]);
    if (rowCount === 0) await client.query(`create database "${testDatabaseName}"`);
  } finally {
    await client.end();
  }
}
export async function migrateDatabase() { await run(node, [prismaCli, 'migrate', 'deploy']); }
export async function startServer() { await assertPortFree(); const server = spawn(node, [nextCli, 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3100'], { cwd: root, env, stdio: 'inherit' }); await waitForServer(server); return server; }
/**
 * Nothing to stop: the database is a service, and the next run rebuilds its state by migrating.
 * Kept as an exported no-op so `test-integration.mjs` keeps its symmetric try/finally shape.
 */
export async function stopDatabase() {}
