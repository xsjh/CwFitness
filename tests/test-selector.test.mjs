import { expect, test } from 'vitest';

import { resolveGroups } from '../scripts/test-selector.mjs';

const manifest = {
  groups: {
    auth: { match: ['lib/auth.ts', 'app/api/auth/**', 'tests/browser/account-smoke.spec.ts'] },
    plans: { match: ['app/api/plans/**', 'tests/browser/workout-session.spec.ts'] },
    'browser-core': { match: ['tests/browser/**'], always: true },
    'health-smoke': { match: ['tests/smoke-api.test.mjs'], always: true },
  },
  'escalate-full': ['tests/**', 'scripts/**', 'package.json'],
};

test('fixed fixture selects matching groups plus always-on groups', () => {
  expect(resolveGroups({ manifest, base: 'HEAD~1', changedPaths: ['app/api/auth/route.ts'], force: false })).toEqual({
    mode: 'fast', groups: ['auth', 'browser-core', 'health-smoke'], reason: 'selected',
  }, 'auth source change should select auth plus always-on fast groups');
});

test('escalate-full hit returns full mode and matching pattern', () => {
  expect(resolveGroups({ manifest, base: 'HEAD~1', changedPaths: ['tests/browser/account-smoke.spec.ts'], force: false })).toEqual({
    mode: 'full', groups: [], reason: 'escalate:tests/**',
  }, 'test path must escalate to full mode with its matching pattern');
});

test('empty changes return the health and browser core baseline', () => {
  expect(resolveGroups({ manifest, base: 'HEAD~1', changedPaths: [], force: false })).toEqual({
    mode: 'fast', groups: ['health-smoke', 'browser-core'], reason: 'no-changes',
  }, 'empty changes must select fast baseline with no-changes reason');
});

test('corrupted manifest falls back to full mode', () => {
  const result = resolveGroups({ manifest: new Error('Unexpected token'), base: 'HEAD~1', changedPaths: ['lib/auth.ts'], force: false });
  expect(result.mode, 'corrupted manifest input must select full mode').toBe('full');
  expect(result.reason, 'corrupted manifest input must name its reason').toBe('manifest:Unexpected token');
});

test('--force-full returns full mode regardless of changed paths', () => {
  expect(resolveGroups({ manifest, base: 'HEAD~1', changedPaths: ['lib/auth.ts'], force: true })).toEqual({
    mode: 'full', groups: [], reason: 'force-full',
  }, '--force-full must select full mode with force-full reason');
});
