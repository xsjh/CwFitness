import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const request = (path, options = {}) => fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', origin: baseUrl, ...options.headers } });

test('a User can register, log in, and list an empty set of Workout Plans', async () => {
  const email = `smoke-${crypto.randomUUID()}@example.com`;
  const register = await request('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name: 'Smoke User', email, password: 'test-password-123' }) });
  assert.equal(register.status, 200);
  const login = await request('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: 'test-password-123' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const plans = await request('/api/plans', { headers: { cookie } });
  assert.equal(plans.status, 200);
  assert.deepEqual(await plans.json(), { plans: [] });
});

test('GET /api/plans returns 401 without a Session', async () => {
  assert.equal((await request('/api/plans')).status, 401);
});
