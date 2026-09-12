import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const root = new URL('../', import.meta.url);
const testServerName = 'cwfitness-test';
const databaseUrl = 'postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable';
const baseUrl = 'http://127.0.0.1:3100';
const localEmailOutbox = join(tmpdir(), 'cwfitness-local-email-outbox.jsonl');
// npm sanitizes some Windows path variables when the runner is launched from a
// POSIX shell, which leaves Playwright unable to locate system browsers. Restore
// sensible fallbacks so `npm test` can launch Chrome on any drive layout.
const systemDrive = process.env.SystemDrive ?? 'C:';
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: 'cwfitness-integration-test-secret-not-for-production',
  BETTER_AUTH_URL: baseUrl,
  TEST_BASE_URL: baseUrl,
  PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  LOCAL_EMAIL_OUTBOX: localEmailOutbox,
  EMAIL_VERIFICATION_REQUIRED: 'false',
  PASSWORD_RESET_EXPIRES_IN_SECONDS: '2',
  // The dev indicator floats over the bottom-docked mobile navigation, so the browser
  // suite cannot reach the "今日" control while it is on screen.
  CWFITNESS_DEV_INDICATOR: 'off',
  HOMEDRIVE: process.env.HOMEDRIVE ?? systemDrive,
  PROGRAMFILES: process.env.PROGRAMFILES ?? `${systemDrive}\\Program Files`,
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  // `next dev` re-execs its real HTTP listener as a grandchild process. Killing only the
  // direct child on Windows leaves that grandchild listening on the test port, and every
  // later run then silently talks to the stale server. Kill the whole tree instead.
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      killer.once('error', resolve);
      killer.once('exit', resolve);
    });
    return;
  }
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function assertPortFree() {
  try {
    await fetch(`${baseUrl}/api/plans`, { signal: AbortSignal.timeout(1_000) });
  } catch {
    return;
  }
  throw new Error(
    `${baseUrl} is already serving a Next.js instance. Stop it before running the integration tests, `
    + 'otherwise the suite silently runs against the stale server.',
  );
}

async function waitForServer(serverProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      throw new Error('Next.js test server exited before it became ready (is the test port already in use?)');
    }
    try {
      const response = await fetch(`${baseUrl}/api/plans`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 401) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Next.js test server did not become ready within 30 seconds');
}

const node = process.execPath;
const prismaCli = new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname.slice(1);
const nextCli = new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname.slice(1);
const playwrightCli = new URL('../node_modules/@playwright/test/cli.js', import.meta.url).pathname.slice(1);

let databaseStarted = false;
let server;

try {
  await rm(localEmailOutbox, { force: true });
  await run(node, [prismaCli, 'dev', '--name', testServerName, '--port', '51213', '--db-port', '51214', '--shadow-db-port', '51215', '--detach']);
  databaseStarted = true;
  await run(node, [prismaCli, 'migrate', 'deploy']);

  await assertPortFree();
  server = spawn(node, [nextCli, 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3100'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  await waitForServer(server);
  await run(node, ['--test', 'tests/plans-api.test.mjs']);
  await run(node, [playwrightCli, 'test']);
} finally {
  if (server) await stopServer(server);
  if (databaseStarted) await run(node, [prismaCli, 'dev', 'stop', testServerName]);
}
