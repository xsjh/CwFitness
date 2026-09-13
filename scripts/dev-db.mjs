/**
 * Brings the development PostgreSQL back to the exact state `.env` expects.
 *
 * The development database is a `prisma dev` instance, not a常驻 service: it dies
 * whenever the machine restarts, the terminal that started it closes, or the
 * integration suite stops it (`test-env.mjs` runs against a different instance but
 * calls `prisma dev stop` on its own). `.env` pins a fixed port, so once the
 * instance is gone every auth request fails with ECONNREFUSED and the UI degrades
 * to "操作没有完成，请稍后重试。" — with no hint about why.
 *
 * Idempotent: reads the port and instance name out of `DATABASE_URL`, starts the
 * instance only when nothing is listening, applies only the migrations that are
 * actually missing. Running it against a healthy database is a no-op.
 *
 * usage: node scripts/dev-db.mjs [--status]
 *   --status  report the resolved instance, port and reachability without changing anything
 *
 * exit codes: 0 healthy (or repaired), 1 could not be made healthy
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = join(projectRoot, 'prisma', 'migrations');

/** The instance this project's `.env` points at; overridable for a differently named setup. */
const DEFAULT_INSTANCE_NAME = 'cwfitness-repro';

/**
 * A stopped instance needs a few seconds for its predecessor's lock to clear. The budget is
 * deliberately bounded well under a minute: this runs before `next dev`, and a healthy instance
 * is ready in a few seconds, so a long wait would only delay a start that is not going to succeed.
 */
const START_ATTEMPTS = 3;
const PORT_READY_TIMEOUT_MS = 12_000;
const LOCK_RELEASE_WAIT_MS = 5_000;

/** Reads `.env` into a plain object; no dependency, and no shell quoting surprises. */
export function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function parseDatabaseUrl(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error(`DATABASE_URL is not a valid URL: ${connectionString}`); }
  const database = url.pathname.replace(/^\//, '');
  const port = Number(url.port || '5432');
  if (!database) throw new Error('DATABASE_URL must name a database in its path');
  if (!Number.isInteger(port) || port <= 0) throw new Error(`DATABASE_URL has an unusable port: ${url.port}`);
  return { host: url.hostname, port, database };
}

/** Resolves a TCP connection within `timeoutMs`; never rejects. */
export function probePort(port, host = '127.0.0.1', timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    let settled = false;
    const done = (reachable) => { if (settled) return; settled = true; socket.destroy(); resolve(reachable); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

/**
 * Waits until a real query succeeds through `connectionString`.
 *
 * A listening TCP port is not enough: `prisma dev` accepts the connection on its
 * main port while the PostgreSQL process behind it is still starting, and the
 * driver surfaces that window as "Connection terminated unexpectedly". Only a
 * completed round trip proves the database is usable, so the readiness gate is a
 * query, not a socket.
 */
export async function waitForQuery(connectionString, { timeoutMs = PORT_READY_TIMEOUT_MS, intervalMs = 500, onWait } = {}) {
  const { Client } = await import('pg');
  const deadline = Date.now() + timeoutMs;
  let notified = false;
  let lastError = 'no attempt made';
  while (Date.now() < deadline) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
    // A failed connect leaves the client in a state whose `end()` can reject again; swallow that
    // so the error that actually explains the failure is the one reported.
    client.on('error', () => {});
    try {
      await client.connect();
      await client.query('select 1');
      await client.end().catch(() => {});
      return { ready: true, lastError: null };
    } catch (error) {
      lastError = error.message;
      await client.end().catch(() => {});
      if (!notified) { notified = true; onWait?.(); }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ready: false, lastError };
}

function readdirSafe(directory) {
  try { return readdirSync(directory); } catch { return []; }
}

/**
 * Finds the `prisma dev` instance that owns `port` by reading the records Prisma
 * keeps under its state directory. Returns null when the port belongs to something
 * else (a real PostgreSQL, a container) — then there is nothing to start.
 */
export function findDevInstance(port, stateDirectory) {
  for (const { record, name } of instanceRecords(stateDirectory)) {
    try {
      const parsed = JSON.parse(readFileSync(record, 'utf8'));
      if (parsed?.port !== port) continue;
      return {
        name: parsed.name ?? name,
        databasePort: parsed.databasePort,
        shadowDatabasePort: parsed.shadowDatabasePort,
      };
    } catch { /* An unreadable record is not the instance we are looking for. */ }
  }
  return null;
}

/**
 * The instance the record names, even when its recorded port does not match.
 *
 * Prisma rewrites `server.json` while an instance is starting, so a read that lands mid-write
 * sees a stale or absent port. Falling back to the recorded name lets the start still be
 * attempted; passing the expected port explicitly is harmless, because that is the port the
 * instance is meant to serve and the one `.env` is already pointing at.
 */
export function findDevInstanceByName(name, stateDirectory) {
  for (const entry of instanceRecords(stateDirectory)) {
    if (entry.name !== name) continue;
    try {
      const parsed = JSON.parse(readFileSync(entry.record, 'utf8'));
      return {
        name: parsed.name ?? entry.name,
        databasePort: parsed.databasePort,
        shadowDatabasePort: parsed.shadowDatabasePort,
      };
    } catch { return { name: entry.name, databasePort: undefined, shadowDatabasePort: undefined }; }
  }
  return null;
}

/** Every instance directory that carries a record, paired with the name and record path. */
function instanceRecords(stateDirectory) {
  const dataDirectory = stateDirectory
    ?? join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'prisma-dev-nodejs', 'Data');
  const entries = [];
  for (const name of readdirSafe(dataDirectory)) {
    const record = join(dataDirectory, name, 'server.json');
    if (existsSync(record)) entries.push({ name, record });
  }
  return entries;
}

/** Migration folder names, oldest first, ignoring anything that is not a migration. */
export function migrationNames(directory = migrationsDirectory) {
  return readdirSafe(directory).filter((name) => /^\d/.test(name)).sort();
}

/** Names in `wanted` that have no finished row in `applied`. */
export function pendingMigrations(applied, wanted) {
  return wanted.filter((name) => !applied.has(name));
}

/**
 * Migration names already finished in this database.
 *
 * A brand-new instance has no `_prisma_migrations` table at all, which is a
 * perfectly valid state meaning "nothing has been applied yet" — so a missing
 * relation is reported as an empty set rather than an error.
 */
async function appliedMigrationNames(connectionString) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query('select migration_name from _prisma_migrations where finished_at is not null');
    return new Set(rows.map((row) => row.migration_name));
  } catch (error) {
    if (error.code === '42P01') return new Set(); // undefined_table: a fresh instance
    throw error;
  } finally { await client.end(); }
}

function run(args, { stdio = 'inherit' } = {}) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio });
  if (result.error) throw result.error;
  return result;
}

/**
 * Detaches `prisma dev` so the instance outlives the process that started it.
 *
 * Spawning it as a plain child does not work: the database is served by the CLI
 * process itself, so when the parent shell exits the instance is torn down and the
 * port `.env` pins goes dark — exactly the failure this script repairs. `--detach`
 * puts Prisma's own supervisor in charge, and `detached: true` + `unref()` moves
 * the launcher out of this process' tree so nothing here can reap it.
 *
 * The sibling ports are passed explicitly rather than read back from Prisma's
 * state record, because that record is rewritten on every start and a first boot
 * has no record to read yet.
 */
function spawnDetached(name, port, { dbPort, shadowDbPort } = {}) {
  const args = [prismaCli, 'dev', '--name', name, '--port', String(port)];
  if (dbPort) args.push('--db-port', String(dbPort));
  if (shadowDbPort) args.push('--shadow-db-port', String(shadowDbPort));
  args.push('--detach');
  const child = spawn(process.execPath, args, {
    cwd: projectRoot, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
}

/**
 * Starts a stopped instance and waits until it actually serves connections.
 *
 * Two things are retried here because both were observed on this setup:
 * `prisma dev` keeps a state lock for a few seconds after the previous holder
 * exits ("Lock file is already being held"), and the main port prints its
 * connection strings before the PostgreSQL process behind it is ready to answer.
 * Neither is an error worth surfacing — they just mean "wait, then try again".
 */
async function startInstance(instance, port, connectionString, log) {
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    log(`[dev-db] port ${port} is down — starting instance ${instance.name} (attempt ${attempt}/${START_ATTEMPTS})`);
    spawnDetached(instance.name, port, { dbPort: instance.databasePort, shadowDbPort: instance.shadowDatabasePort });
    const { ready, lastError } = await waitForQuery(connectionString, {
      onWait: () => log(`[dev-db] waiting for the database behind ${port} to answer queries…`),
    });
    if (ready) {
      log(`[dev-db] instance ${instance.name} is accepting queries on ${port}`);
      return;
    }
    log(`[dev-db] still not ready (${lastError})`);
    // A stale lock ("Lock file is already being held") is the usual cause here;
    // give its holder time to release it before trying again.
    await new Promise((resolve) => setTimeout(resolve, LOCK_RELEASE_WAIT_MS));
  }
  throw new Error(`instance ${instance.name} did not accept queries on ${port} after ${START_ATTEMPTS} attempts`);
}

export async function ensureDevelopmentDatabase({ envPath = new URL('../.env', import.meta.url), stateDirectory, log = console.log } = {}) {
  const fromFile = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
  const connectionString = process.env.DATABASE_URL ?? fromFile.DATABASE_URL;
  if (!connectionString) throw new Error(`DATABASE_URL is not set in ${fileURLToPath(envPath)} or the environment`);
  const target = parseDatabaseUrl(connectionString);
  let instanceName = null;

  if (await probePort(target.port, target.host)) {
    log(`[dev-db] port ${target.port} is already serving`);
  } else {
    // Match on the recorded port first, then fall back to the name: Prisma rewrites the record
    // while an instance starts, so a read that lands mid-write cannot be trusted to rule it out.
    const instance = findDevInstance(target.port, stateDirectory)
      ?? findDevInstanceByName(process.env.CWFITNESS_DEV_DB_NAME ?? DEFAULT_INSTANCE_NAME, stateDirectory);
    if (!instance) {
      throw new Error(`nothing is listening on ${target.host}:${target.port}, and no prisma dev instance owns that port.\n` +
        `        Point DATABASE_URL at a running PostgreSQL, or create the instance with:\n` +
        `        npx prisma dev --name ${DEFAULT_INSTANCE_NAME} --port ${target.port} --db-port ${target.port + 1} --detach`);
    }
    await startInstance(instance, target.port, connectionString, log);
    instanceName = instance.name;
  }

  // `migrate deploy` is idempotent, but checking first keeps a healthy start to one query.
  const applied = await appliedMigrationNames(connectionString);
  const missing = pendingMigrations(applied, migrationNames());
  if (missing.length === 0) {
    log(`[dev-db] schema up to date (${applied.size} migrations applied)`);
  } else {
    log(`[dev-db] applying ${missing.length} migration(s): ${missing.join(', ')}`);
    run([prismaCli, 'migrate', 'deploy']);
  }
  log('[dev-db] ready');
  return { port: target.port, instance: instanceName, appliedMigrations: applied.size };
}

async function main() {
  const argv = process.argv;
  const log = (...parts) => console.log(...parts);
  const envPath = new URL('../.env', import.meta.url);
  const connectionString = process.env.DATABASE_URL
    ?? (existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')).DATABASE_URL : undefined);
  if (!connectionString) throw new Error(`DATABASE_URL is not set in ${fileURLToPath(envPath)} or the environment`);
  const target = parseDatabaseUrl(connectionString);

  if (argv.includes('--status')) {
    const reachable = await probePort(target.port, target.host);
    console.log(`[dev-db] status=${reachable ? 'up' : 'down'} port=${target.port}`);
    if (!reachable) process.exitCode = 1;
    return;
  }

  // `npm run dev` chains this before `next dev`. A database that cannot be brought up must not
  // stop the frontend from starting: the app is still useful, and the auth routes now answer 503
  // with a cause, so the failure is visible in the browser instead of in a failed command.
  const bestEffort = argv.includes('--best-effort');
  try {
    await ensureDevelopmentDatabase({ envPath, log });
  } catch (error) {
    console.error(`[dev-db] ${error.message}`);
    if (!bestEffort) process.exitCode = 1;
    else console.error('[dev-db] continuing without a database; auth routes will answer 503');
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(`[dev-db] ${error.message}`); process.exitCode = 1; });
}
