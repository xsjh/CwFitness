/**
 * Selects and runs integration tests. TEST_BASE overrides the git comparison base;
 * PLAYWRIGHT_CHANNEL and the integration environment variables are inherited from
 * test-env.mjs. Exit 0 means the selected run passed; exit 2 means fast selection
 * requires a full run; all other non-zero exits are test or infrastructure failures.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  migrateDatabase, node, playwrightCli, run, startDatabase, startServer, stopDatabase, stopServer,
} from './test-env.mjs';

const manifestUrl = new URL('../tests/selectors/path-groups.json', import.meta.url);

function globMatches(path, pattern) {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`).test(path.replaceAll('\\', '/'));
}

export function resolveGroups({ manifest, changedPaths, force }) {
  if (force) return { mode: 'full', groups: [], reason: 'force-full' };
  if (manifest instanceof Error || !manifest?.groups || !Array.isArray(manifest['escalate-full'])) {
    return { mode: 'full', groups: [], reason: `manifest:${manifest instanceof Error ? manifest.message : 'invalid manifest'}` };
  }
  for (const path of changedPaths) {
    const pattern = manifest['escalate-full'].find((item) => globMatches(path, item));
    if (pattern) return { mode: 'full', groups: [], reason: `escalate:${pattern}` };
  }
  if (changedPaths.length === 0) return { mode: 'fast', groups: ['health-smoke', 'browser-core'], reason: 'no-changes' };
  const groups = Object.entries(manifest.groups)
    .filter(([, group]) => group.always || group.match.some((pattern) => changedPaths.some((path) => globMatches(path, pattern))))
    .map(([name]) => name);
  return { mode: 'fast', groups, reason: 'selected' };
}

async function phase(name, action, timings) {
  const started = Date.now();
  try { return await action(); } finally { timings.push({ name, duration: Date.now() - started }); console.log(`[selector] phase=${name} duration_ms=${Date.now() - started}`); }
}

function browserSpecs(manifest, groups) {
  return groups.flatMap((name) => manifest.groups[name]?.match ?? []).filter((path) => path.startsWith('tests/browser/') && path.endsWith('.spec.ts'));
}

async function runPlaywright(project, specs) {
  if (specs.length === 0) return;
  await run(node, [playwrightCli, 'test', '--project', project, ...[...new Set(specs)]]);
}

async function loadManifest() {
  try { return JSON.parse(await readFile(manifestUrl, 'utf8')); } catch (error) { return error instanceof Error ? error : new Error(String(error)); }
}

function changedPaths(base) {
  try { return execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', base], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean); } catch (error) { throw new Error(`git diff failed for ${base}: ${error.message}`); }
}

async function main() {
  const command = process.argv[2] ?? 'fast';
  const force = process.argv.includes('--force-full');
  if (!['fast', 'full'].includes(command)) throw new Error('usage: node scripts/test-selector.mjs <fast|full> [--force-full]');
  const manifest = await loadManifest();
  const base = process.env.TEST_BASE ?? 'HEAD~1';
  const resolved = command === 'full' ? { mode: 'full', groups: Object.keys(manifest.groups ?? {}), reason: 'requested-full' } : resolveGroups({ manifest, base, changedPaths: changedPaths(base), force });
  console.log(`[selector] mode=${resolved.mode} reason=${resolved.reason}`);
  if (command === 'fast' && resolved.mode === 'full') { process.exitCode = 2; return; }
  if (manifest instanceof Error) throw manifest;

  const timings = [];
  const started = Date.now();
  let databaseStarted = false;
  let server;
  try {
    await phase('db-start', startDatabase, timings); databaseStarted = true;
    await phase('migrate', migrateDatabase, timings);
    server = await phase('server-boot', startServer, timings);
    await phase('vitest', () => run(node, ['./node_modules/vitest/vitest.mjs', 'run']), timings);
    await phase('http-smoke', () => run(node, ['--test', command === 'full' ? 'tests/plans-api.test.mjs' : 'tests/smoke-api.test.mjs']), timings);
    const specs = command === 'full' ? [] : browserSpecs(manifest, resolved.groups);
    await phase('browser-chromium', () => command === 'full' ? run(node, [playwrightCli, 'test', '--project', 'chromium']) : runPlaywright('chromium', specs), timings);
    const crossBrowserSpecs = command === 'full' ? [] : specs.filter((path) => manifest.groups['@cross-browser']?.match.includes(path));
    await phase('browser-firefox', () => command === 'full' ? run(node, [playwrightCli, 'test', '--project', 'firefox']) : runPlaywright('firefox', crossBrowserSpecs), timings);
    await phase('browser-webkit', () => command === 'full' ? run(node, [playwrightCli, 'test', '--project', 'webkit']) : runPlaywright('webkit', crossBrowserSpecs), timings);
  } finally {
    await phase('teardown', async () => { if (server) await stopServer(server); if (databaseStarted) await stopDatabase(); }, timings);
  }
  const total = Date.now() - started;
  console.log(`[selector] total duration_ms=${total} selected_groups=[${resolved.groups.join(', ')}]`);
  const budget = command === 'fast' ? 10 * 60_000 : 25 * 60_000;
  if (total > budget) {
    const slowest = timings.reduce((winner, current) => current.duration > winner.duration ? current : winner, timings[0]);
    console.warn(`[selector] warning=budget-exceeded budget_ms=${budget} slowest_phase=${slowest.name}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
