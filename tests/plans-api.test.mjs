import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEmailVerificationToken } from 'better-auth/api';
import pg from 'pg';

import { waitForLocalEmail } from './helpers/local-email-outbox.mjs';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3100';

async function setEmailVerified(email, emailVerified) {
  const normalizedEmail = email.toLowerCase();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query('UPDATE "user" SET "emailVerified" = $1 WHERE email = $2 RETURNING email, "emailVerified"', [emailVerified, normalizedEmail]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].emailVerified, emailVerified);
  } finally {
    await client.end();
  }
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      ...options.headers,
    },
  });
}

async function signUp(label) {
  return (await registerVerifiedUser(label)).cookie;
}

async function registerVerifiedUser(label) {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const response = await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: label, email, password: 'test-password-123' }),
  });

  if (response.status !== 200) assert.fail(`sign-up failed: ${await response.text()}`);
  assert.deepEqual(response.headers.getSetCookie(), [], 'unverified sign-up must not establish a session');
  const message = await waitForLocalEmail({ to: email, kind: 'verification' });
  const verificationUrl = new URL(message.url);
  const verification = await request(`${verificationUrl.pathname}${verificationUrl.search}`, { redirect: 'manual' });
  assert.equal(verification.status, 302);
  const setCookies = verification.headers.getSetCookie();
  const cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
  assert.ok(cookie, 'verification must establish a session cookie');
  assert.match(setCookies.join('; '), /HttpOnly/);
  assert.match(setCookies.join('; '), /SameSite=Lax/);
  if (baseUrl.startsWith('https:')) assert.match(setCookies.join('; '), /Secure/);
  return { cookie, email: email.toLowerCase() };
}

test('Home renders the interactive Split authentication flow', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-testid="auth-form"/);
  assert.match(html, /继续训练。/);
});

test('Sign-up remains pending until the User verifies their email', async () => {
  const email = `unverified-${crypto.randomUUID()}@example.com`;
  const response = await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unverified User', email, password: 'test-password-123' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.headers.getSetCookie(), []);
  const deniedSignIn = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  assert.equal(deniedSignIn.status, 403);

  const message = await waitForLocalEmail({ to: email, kind: 'verification' });
  assert.match(message.url, /\/api\/auth\/verify-email\?token=/);
});

test('Email verification rejects invalid and expired links and safely handles reuse', async () => {
  const email = `verification-errors-${crypto.randomUUID()}@example.com`;
  await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: 'Verification Errors', email, password: 'test-password-123' }),
  });

  const invalid = await request('/api/auth/verify-email?token=invalid&callbackURL=%2Fverify-email%2Fresult', { redirect: 'manual' });
  assert.equal(invalid.status, 302);
  assert.match(invalid.headers.get('location') ?? '', /error=INVALID_TOKEN/);

  const expiredToken = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET, email, undefined, -1);
  const expired = await request(`/api/auth/verify-email?token=${encodeURIComponent(expiredToken)}&callbackURL=%2Fverify-email%2Fresult`, { redirect: 'manual' });
  assert.equal(expired.status, 302);
  assert.match(expired.headers.get('location') ?? '', /error=TOKEN_EXPIRED/);

  const message = await waitForLocalEmail({ to: email, kind: 'verification' });
  const verificationUrl = new URL(message.url);
  const firstUse = await request(`${verificationUrl.pathname}${verificationUrl.search}`, { redirect: 'manual' });
  assert.equal(firstUse.status, 302);
  assert.doesNotMatch(firstUse.headers.get('location') ?? '', /error=/);

  const reuse = await request(`${verificationUrl.pathname}${verificationUrl.search}`, { redirect: 'manual' });
  assert.equal(reuse.status, 302);
  assert.doesNotMatch(reuse.headers.get('location') ?? '', /error=/);
});

test('Forgot-password responses do not reveal account existence and reset changes the password', async () => {
  const { email } = await registerVerifiedUser('PasswordReset');
  const missingEmail = `missing-${crypto.randomUUID()}@example.com`;

  const existing = await request('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: `${baseUrl}/reset-password` }),
  });
  const missing = await request('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: missingEmail, redirectTo: `${baseUrl}/reset-password` }),
  });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.deepEqual(await existing.json(), await missing.json());

  const message = await waitForLocalEmail({ to: email, kind: 'password-reset' });
  const resetUrl = new URL(message.url);
  const callback = await request(`${resetUrl.pathname}${resetUrl.search}`, { redirect: 'manual' });
  assert.equal(callback.status, 302);
  const token = new URL(callback.headers.get('location'), baseUrl).searchParams.get('token');
  assert.ok(token);

  const reset = await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword: 'new-test-password-456' }),
  });
  assert.equal(reset.status, 200);
  const invalidReset = await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: 'invalid-reset-token', newPassword: 'another-test-password' }),
  });
  assert.equal(invalidReset.status, 400);

  const oldPassword = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  assert.equal(oldPassword.status, 401);
  const newPassword = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'new-test-password-456' }),
  });
  assert.equal(newPassword.status, 200);
});

test('Expired password reset tokens fail safely', async () => {
  const { email } = await registerVerifiedUser('ExpiredReset');
  await request('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: `${baseUrl}/reset-password` }),
  });
  const message = await waitForLocalEmail({ to: email, kind: 'password-reset' });
  const resetUrl = new URL(message.url);
  const callback = await request(`${resetUrl.pathname}${resetUrl.search}`, { redirect: 'manual' });
  const token = new URL(callback.headers.get('location'), baseUrl).searchParams.get('token');

  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const reset = await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword: 'expired-reset-password' }),
  });
  assert.equal(reset.status, 400);
});

test('Sign-out invalidates the current Session cookie', async () => {
  const { cookie } = await registerVerifiedUser('SignOut');
  assert.equal((await request('/api/plans', { headers: { cookie } })).status, 200);

  const signOut = await request('/api/auth/sign-out', {
    method: 'POST',
    headers: { cookie },
    body: '{}',
  });
  assert.equal(signOut.status, 200);
  const clearedCookie = signOut.headers.getSetCookie().join('; ');
  assert.match(clearedCookie, /HttpOnly/);
  assert.match(clearedCookie, /SameSite=Lax/);
  if (baseUrl.startsWith('https:')) assert.match(clearedCookie, /Secure/);
  assert.equal((await request('/api/plans', { headers: { cookie } })).status, 401);
});

test('An unverified legacy Session cannot access protected APIs', async () => {
  const { cookie, email } = await registerVerifiedUser('LegacyUnverified');
  await setEmailVerified(email, false);

  const sessionResponse = await request('/api/auth/get-session?disableCookieCache=true', { headers: { cookie } });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).user.emailVerified, false);
  const protectedResponse = await request('/api/plans', { headers: { cookie } });
  assert.equal(protectedResponse.status, 401);
});

test('Workout Plans are isolated by the authenticated User', async () => {
  const anonymous = await request('/api/plans');
  assert.equal(anonymous.status, 401);

  const aliceCookie = await signUp('Alice');
  const bobCookie = await signUp('Bob');

  const created = await request('/api/plans', {
    method: 'POST',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({ name: 'Strength Base' }),
  });
  if (created.status !== 201) assert.fail(`create failed: ${await created.text()}`);
  const createdBody = await created.json();
  assert.equal(typeof createdBody.plan.id, 'string');
  assert.equal(createdBody.plan.name, 'Strength Base');

  const alicePlans = await request('/api/plans', { headers: { cookie: aliceCookie } });
  assert.equal(alicePlans.status, 200);
  assert.equal((await alicePlans.json()).plans.length, 1);

  const bobPlans = await request('/api/plans', { headers: { cookie: bobCookie } });
  assert.equal(bobPlans.status, 200);
  assert.deepEqual(await bobPlans.json(), { plans: [] });
});

test('User settings persist the preferred weight unit and pounds are stored as grams', async () => {
  const cookie = await signUp('ImperialUser');
  const settings = await request('/api/settings', {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ timeZone: 'America/New_York', weightUnit: 'lb' }),
  });
  assert.equal(settings.status, 200);
  assert.deepEqual((await settings.json()).settings, { timeZone: 'America/New_York', weightUnit: 'lb' });

  const plan = await createPlan(cookie, 'Imperial Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Imperial Day');
  const exercise = await createExercise(cookie, { name: 'Imperial Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS' });
  const planned = await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 3, targetValue: 8, weight: 135, weightUnit: 'lb',
  });
  assert.equal(planned.weightGrams, 61_235);
});

test('Archived plans cannot start workouts and account deletion requires confirmation', async () => {
  const cookie = await signUp('LifecycleOwner');
  const plan = await createPlan(cookie, 'Archived Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Archived Day');
  const exercise = await createExercise(cookie, { name: 'Archive Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS' });
  await addPlannedExercise(cookie, plan.id, day.id, { exerciseId: exercise.id, setCount: 3, targetValue: 8, weight: 60, weightUnit: 'kg' });
  const currentPlan = await getPlan(cookie, plan.id);
  const archived = await request(`/api/plans/${plan.id}`, { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ archived: true, version: currentPlan.version }) });
  assert.equal(archived.status, 200);
  const blockedStart = await request('/api/workout-sessions', { method: 'POST', headers: { cookie }, body: JSON.stringify({ workoutDayId: day.id, timeZone: 'UTC' }) });
  assert.equal(blockedStart.status, 404);

  const unconfirmedDelete = await request('/api/account', { method: 'DELETE', headers: { cookie }, body: '{}' });
  assert.equal(unconfirmedDelete.status, 400);
  const deleted = await request('/api/account', { method: 'DELETE', headers: { cookie }, body: JSON.stringify({ confirmation: 'DELETE' }) });
  assert.equal(deleted.status, 204);
  assert.equal((await request('/api/plans', { headers: { cookie } })).status, 401);
});

async function createPlan(cookie, name) {
  const response = await request('/api/plans', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name }),
  });
  if (response.status !== 201) assert.fail(`create plan failed: ${await response.text()}`);
  return (await response.json()).plan;
}

test('User composes a Workout Plan from owned Exercises and Workout Days', async () => {
  const aliceCookie = await signUp('PlanAuthor');
  const bobCookie = await signUp('OtherUser');
  const plan = await createPlan(aliceCookie, 'Push Pull Legs');

  const createdExercise = await request('/api/exercises', {
    method: 'POST',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({
      name: 'Bench Press',
      resistanceType: 'WEIGHTED',
      targetType: 'REPETITIONS',
    }),
  });
  assert.equal(createdExercise.status, 201);
  const exercise = (await createdExercise.json()).exercise;

  const renamed = await request(`/api/exercises/${exercise.id}`, {
    method: 'PATCH',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({ name: 'Barbell Bench Press', version: exercise.version }),
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).exercise.id, exercise.id);

  const aliceExercises = await request('/api/exercises', { headers: { cookie: aliceCookie } });
  assert.deepEqual((await aliceExercises.json()).exercises, [{
    id: exercise.id,
    name: 'Barbell Bench Press',
    resistanceType: 'WEIGHTED',
    targetType: 'REPETITIONS',
    version: 2,
  }]);
  const bobExercises = await request('/api/exercises', { headers: { cookie: bobCookie } });
  assert.deepEqual(await bobExercises.json(), { exercises: [] });

  const dayResponse = await request(`/api/plans/${plan.id}/days`, {
    method: 'POST',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({ name: 'Push Day', suggestedWeekday: 1, version: plan.version }),
  });
  assert.equal(dayResponse.status, 201);
  const day = (await dayResponse.json()).workoutDay;

  const forbiddenDay = await request(`/api/plans/${plan.id}/days`, {
    method: 'POST',
    headers: { cookie: bobCookie },
    body: JSON.stringify({ name: 'Stolen Day', version: plan.version }),
  });
  assert.equal(forbiddenDay.status, 404);

  const invalidTarget = await request(`/api/plans/${plan.id}/days/${day.id}/exercises`, {
    method: 'POST',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({ exerciseId: exercise.id, setCount: 3, targetValue: 8 }),
  });
  assert.equal(invalidTarget.status, 400);

  const plannedResponse = await request(`/api/plans/${plan.id}/days/${day.id}/exercises`, {
    method: 'POST',
    headers: { cookie: aliceCookie },
    body: JSON.stringify({
      exerciseId: exercise.id,
      setCount: 3,
      targetValue: 8,
      weight: 60,
      weightUnit: 'kg',
      version: day.version,
    }),
  });
  assert.equal(plannedResponse.status, 201);
  const plannedExercise = (await plannedResponse.json()).plannedExercise;
  assert.equal(typeof plannedExercise.id, 'string');
  assert.deepEqual({ ...plannedExercise, id: undefined }, {
    id: undefined,
    exerciseId: exercise.id,
    setCount: 3,
    targetValue: 8,
    weightGrams: 60_000,
    version: 1,
  });
});

async function createExercise(cookie, data) {
  const response = await request('/api/exercises', {
    method: 'POST', headers: { cookie }, body: JSON.stringify(data),
  });
  assert.equal(response.status, 201);
  return (await response.json()).exercise;
}

async function createWorkoutDay(cookie, planId, name) {
  const plan = await getPlan(cookie, planId);
  const response = await request(`/api/plans/${planId}/days`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ name, version: plan.version }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).workoutDay;
}

async function addPlannedExercise(cookie, planId, dayId, data) {
  const plan = await getPlan(cookie, planId);
  const day = plan.workoutDays.find((item) => item.id === dayId);
  if (!day) assert.fail('Workout Day not found for Planned Exercise creation');
  const response = await request(`/api/plans/${planId}/days/${dayId}/exercises`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ ...data, version: day.version }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).plannedExercise;
}

async function getPlan(cookie, planId) {
  const response = await request('/api/plans', { headers: { cookie } });
  assert.equal(response.status, 200);
  const plan = (await response.json()).plans.find((item) => item.id === planId);
  if (!plan) assert.fail(`Workout Plan ${planId} not found`);
  return plan;
}

test('A User previews and restores a complete versioned JSON backup without partial imports', async () => {
  const cookie = await signUp('BackupOwner');
  const settings = await request('/api/settings', {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ timeZone: 'America/New_York', weightUnit: 'lb' }),
  });
  assert.equal(settings.status, 200);
  const plan = await createPlan(cookie, 'Backup Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Backup Day');
  const exercise = await createExercise(cookie, { name: 'Backup Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS' });
  await addPlannedExercise(cookie, plan.id, day.id, { exerciseId: exercise.id, setCount: 1, targetValue: 8, weight: 60, weightUnit: 'kg' });
  await completeSingleSetSession(cookie, day.id, 9, 65);

  const exported = await request('/api/backup', { headers: { cookie } });
  assert.equal(exported.status, 200);
  const backup = (await exported.json()).backup;
  assert.equal(backup.schemaVersion, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(backup.settings.weightUnit, 'lb');
  assert.equal(backup.plans[0].id, plan.id);
  assert.equal(backup.exercises[0].id, exercise.id);
  assert.equal(backup.workoutSessions[0].exercises[0].setResults[0].actualValue, 9);
  assert.equal(JSON.stringify(backup).includes('password'), false);
  const versionBeforeRestore = await request('/api/backup/version', { headers: { cookie } });
  assert.equal(versionBeforeRestore.status, 200);
  const beforeDataVersion = (await versionBeforeRestore.json()).dataVersion;

  const preview = await request('/api/backup/restore', { method: 'POST', headers: { cookie }, body: JSON.stringify({ backup }) });
  assert.equal(preview.status, 200);
  assert.deepEqual((await preview.json()).summary, { plans: 1, workoutDays: 1, plannedExercises: 1, exercises: 1, workoutSessions: 1, sessionExercises: 1, setResults: 1 });

  const malformed = await request('/api/backup/restore', { method: 'POST', headers: { cookie }, body: JSON.stringify({ backup: { ...backup, schemaVersion: 99 }, confirmation: 'RESTORE' }) });
  assert.equal(malformed.status, 400);
  const brokenReference = structuredClone(backup);
  brokenReference.plans[0].workoutDays[0].plannedExercises[0].exerciseId = 'missing-exercise';
  const rejected = await request('/api/backup/restore', { method: 'POST', headers: { cookie }, body: JSON.stringify({ backup: brokenReference, confirmation: 'RESTORE' }) });
  assert.equal(rejected.status, 400);
  assert.equal((await getPlan(cookie, plan.id)).name, 'Backup Plan', 'validation failures leave existing data untouched');

  const currentBeforeChange = await getPlan(cookie, plan.id);
  const changed = await request(`/api/plans/${plan.id}`, { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ name: 'Changed after export', version: currentBeforeChange.version }) });
  assert.equal(changed.status, 200);
  const restored = await request('/api/backup/restore', { method: 'POST', headers: { cookie }, body: JSON.stringify({ backup, confirmation: 'RESTORE' }) });
  assert.equal(restored.status, 200);
  const versionAfterRestore = await request('/api/backup/version', { headers: { cookie } });
  assert.equal((await versionAfterRestore.json()).dataVersion, beforeDataVersion + 1, 'restore publishes a newer data version for other devices');
  assert.equal((await getPlan(cookie, plan.id)).name, 'Backup Plan');
  const restoredSettings = await request('/api/settings', { headers: { cookie } });
  assert.deepEqual((await restoredSettings.json()).settings, { timeZone: 'America/New_York', weightUnit: 'lb' });
});

test('A User controls sanitized telemetry and explicitly deletes every owned record', async () => {
  const cookie = await signUp('PrivacyOwner');
  const privacy = await request('/api/privacy', { headers: { cookie } });
  assert.deepEqual(await privacy.json(), { telemetryEnabled: true });
  const recorded = await request('/api/telemetry', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ category: 'page_visit', planName: 'Private Plan', exerciseName: 'Private Exercise', weight: 120, repetitions: 8, duration: 60, trainingDate: '2001-01-01' }),
  });
  assert.equal(recorded.status, 204);
  const telemetry = await request('/api/telemetry', { headers: { cookie } });
  const events = (await telemetry.json()).events;
  assert.deepEqual(events.map((event) => event.category), ['page_visit']);
  assert.equal(JSON.stringify(events).match(/Private Plan|Private Exercise|120|2001-01-01/), null, 'telemetry redacts training data');
  const optedOut = await request('/api/privacy', { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ telemetryEnabled: false }) });
  assert.deepEqual(await optedOut.json(), { telemetryEnabled: false });
  assert.equal((await request('/api/telemetry', { method: 'POST', headers: { cookie }, body: JSON.stringify({ category: 'sync_failure' }) })).status, 204);
  assert.equal((await (await request('/api/telemetry', { headers: { cookie } })).json()).events.length, 1, 'opt-out stops new telemetry');

  const plan = await createPlan(cookie, 'Deletion Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Deletion Day');
  const exercise = await createExercise(cookie, { name: 'Deletion Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS' });
  await addPlannedExercise(cookie, plan.id, day.id, { exerciseId: exercise.id, setCount: 1, targetValue: 8, weight: 60, weightUnit: 'kg' });
  await completeSingleSetSession(cookie, day.id, 8, 60);
  const impact = await request('/api/account', { headers: { cookie } });
  assert.deepEqual((await impact.json()).summary, { plans: 1, workoutDays: 1, plannedExercises: 1, exercises: 1, workoutSessions: 1, sessionExercises: 1, setResults: 1, telemetryEvents: 1 });
  assert.equal((await request('/api/account', { method: 'DELETE', headers: { cookie }, body: '{}' })).status, 400);
  assert.equal((await request('/api/plans', { headers: { cookie } })).status, 200, 'cancelling deletion preserves the account');
  assert.equal((await request('/api/account', { method: 'DELETE', headers: { cookie }, body: JSON.stringify({ confirmation: 'DELETE' }) })).status, 204);
  assert.equal((await request('/api/plans', { headers: { cookie } })).status, 401, 'deletion revokes the authenticated Session');
});

test('Workout Day ordering is versioned and persists through plan reads', async () => {
  const cookie = await signUp('DayOrdering');
  const plan = await createPlan(cookie, 'Ordered Plan');
  const first = await createWorkoutDay(cookie, plan.id, 'First');
  const second = await createWorkoutDay(cookie, plan.id, 'Second');
  const current = await getPlan(cookie, plan.id);
  const response = await request(`/api/plans/${plan.id}/days/order`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ dayIds: [second.id, first.id], version: current.version }),
  });
  assert.equal(response.status, 200);
  const refreshed = await getPlan(cookie, plan.id);
  assert.deepEqual(refreshed.workoutDays.map((day) => day.id), [second.id, first.id]);
  assert.equal(refreshed.version, current.version + 1);
});

async function completeSingleSetSession(cookie, dayId, actualValue, actualWeight) {
  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ workoutDayId: dayId, timeZone: 'UTC' }),
  });
  assert.equal(started.status, 201);
  const session = (await started.json()).workoutSession;
  const recorded = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ actualValue, actualWeight, weightUnit: 'kg', version: session.version }),
  });
  assert.equal(recorded.status, 200);
  const active = await request('/api/workout-sessions/active', { headers: { cookie } });
  assert.equal(active.status, 200);
  const updated = (await active.json()).workoutSession;
  const completed = await request(`/api/workout-sessions/${session.id}/complete`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: updated.version }),
  });
  assert.equal(completed.status, 200);
}

test('Progression Suggestions reset when a Planned Exercise target changes and later changes back', async () => {
  const cookie = await signUp('SuggestionReset');
  const plan = await createPlan(cookie, 'Suggestion Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Strength Day');
  const exercise = await createExercise(cookie, { name: 'Bench Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS' });
  await addPlannedExercise(cookie, plan.id, day.id, { exerciseId: exercise.id, setCount: 1, targetValue: 6, weight: 100, weightUnit: 'kg' });

  await completeSingleSetSession(cookie, day.id, 7, 110);
  let current = await getPlan(cookie, plan.id);
  let planned = current.workoutDays[0].plannedExercises[0];
  let changed = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ setCount: 1, targetValue: 7, weight: 100, weightUnit: 'kg', version: planned.version }),
  });
  assert.equal(changed.status, 200);
  await completeSingleSetSession(cookie, day.id, 8, 110);
  current = await getPlan(cookie, plan.id);
  planned = current.workoutDays[0].plannedExercises[0];
  changed = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ setCount: 1, targetValue: 6, weight: 100, weightUnit: 'kg', version: planned.version }),
  });
  assert.equal(changed.status, 200);
  await completeSingleSetSession(cookie, day.id, 7, 110);
  await completeSingleSetSession(cookie, day.id, 7, 110);

  const progress = await request(`/api/plans/${plan.id}/progress`, { headers: { cookie } });
  assert.equal(progress.status, 200);
  assert.equal((await progress.json()).progress[0].progressionSuggestion, false);
});

test('Progression Suggestions name the correct next step for each Exercise type after two excess sessions', async () => {
  const cookie = await signUp('SuggestionTypes');
  const plan = await createPlan(cookie, 'Suggestion Types');
  const cases = [
    { name: 'Weighted Reps', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS', suggestion: '建议增加重量', weight: 100 },
    { name: 'Bodyweight Reps', resistanceType: 'BODYWEIGHT', targetType: 'REPETITIONS', suggestion: '建议增加次数' },
    { name: 'Bodyweight Duration', resistanceType: 'BODYWEIGHT', targetType: 'DURATION', suggestion: '建议增加时长' },
    { name: 'Weighted Duration', resistanceType: 'WEIGHTED', targetType: 'DURATION', suggestion: '建议增加重量或时长', weight: 20 },
  ];

  for (const item of cases) {
    const day = await createWorkoutDay(cookie, plan.id, item.name);
    const exercise = await createExercise(cookie, item);
    await addPlannedExercise(cookie, plan.id, day.id, { exerciseId: exercise.id, setCount: 1, targetValue: 6, ...(item.weight === undefined ? {} : { weight: item.weight, weightUnit: 'kg' }) });
    await completeSingleSetSession(cookie, day.id, 6, item.weight);
    await completeSingleSetSession(cookie, day.id, 7, item.weight === undefined ? undefined : item.weight + 1);
    await completeSingleSetSession(cookie, day.id, 7, item.weight === undefined ? undefined : item.weight + 1);
  }

  const progress = await request(`/api/plans/${plan.id}/progress`, { headers: { cookie } });
  assert.equal(progress.status, 200);
  assert.deepEqual((await progress.json()).progress.map((item) => item.suggestion).sort(), cases.map((item) => item.suggestion).sort());
});

test('User starts one snapshotted Workout Session and completes its timed lifecycle', async () => {
  const cookie = await signUp('SessionOwner');
  const otherCookie = await signUp('SessionOther');
  const plan = await createPlan(cookie, 'Session Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Strength Day');
  const exercise = await createExercise(cookie, {
    name: 'Back Squat', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  const planned = await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 4, targetValue: 6, weight: 100, weightUnit: 'kg',
  });

  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(started.status, 201);
  const session = (await started.json()).workoutSession;
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.timeZone, 'Asia/Shanghai');
  assert.match(session.localStartDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof session.exercises[0].id, 'string');
  assert.deepEqual(session.exercises.map((item) => ({
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseName,
    resistanceType: item.resistanceType,
    targetType: item.targetType,
    setCount: item.setCount,
    targetValue: item.targetValue,
    weightGrams: item.weightGrams,
  })), [{
    exerciseId: exercise.id,
    exerciseName: 'Back Squat',
    resistanceType: 'WEIGHTED',
    targetType: 'REPETITIONS',
    setCount: 4,
    targetValue: 6,
    weightGrams: 100_000,
  }]);

  const duplicate = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(duplicate.status, 409);

  const hidden = await request(`/api/workout-sessions/${session.id}/pause`, {
    method: 'POST', headers: { cookie: otherCookie }, body: JSON.stringify({ version: session.version }),
  });
  assert.equal(hidden.status, 404);

  const heartbeat = await request(`/api/workout-sessions/${session.id}/heartbeat`, {
    method: 'POST', headers: { cookie }, body: '{}',
  });
  assert.equal(heartbeat.status, 204);

  const paused = await request(`/api/workout-sessions/${session.id}/pause`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: session.version }),
  });
  assert.equal(paused.status, 200);
  const pausedSession = (await paused.json()).workoutSession;
  assert.equal(pausedSession.status, 'PAUSED');

  const active = await request('/api/workout-sessions/active', { headers: { cookie } });
  assert.equal(active.status, 200);
  assert.equal((await active.json()).workoutSession.id, session.id);

  const resumed = await request(`/api/workout-sessions/${session.id}/resume`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: pausedSession.version }),
  });
  assert.equal(resumed.status, 200);
  const resumedSession = (await resumed.json()).workoutSession;
  assert.equal(resumedSession.status, 'ACTIVE');

  const completed = await request(`/api/workout-sessions/${session.id}/complete`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: resumedSession.version }),
  });
  assert.equal(completed.status, 200);
  const completedSession = (await completed.json()).workoutSession;
  assert.equal(completedSession.status, 'COMPLETED');
  assert.equal(Number.isInteger(completedSession.trainingTimeSeconds), true);
  assert.equal(completedSession.trainingTimeSeconds >= 0, true);
  assert.equal(completedSession.exercises[0].setResults.filter((result) => result.skipped).length, 4);
  const history = await request('/api/workout-sessions', { headers: { cookie } });
  assert.equal(history.status, 200);
  let [historySession] = (await history.json()).workoutSessions;
  assert.equal(historySession.id, session.id);
  assert.equal(historySession.workoutPlanName, 'Session Plan');
  assert.equal(historySession.workoutDayName, 'Strength Day');
  assert.equal(historySession.modifiedAt, null);
  assert.deepEqual(historySession.exerciseResults, [{
    sessionExerciseId: session.exercises[0].id,
    exerciseId: exercise.id,
    exerciseName: 'Back Squat',
    achievementRate: 0,
    excessTargetValue: 0,
    excessWeightGrams: 0,
  }]);
  const progress = await request(`/api/plans/${plan.id}/progress`, { headers: { cookie } });
  assert.equal(progress.status, 200);
  assert.deepEqual((await progress.json()).progress, [{
    workoutPlanId: plan.id,
    plannedExerciseId: planned.id,
    exerciseId: exercise.id,
    recent: [{
      date: session.localStartDate,
      sessionExerciseId: session.exercises[0].id,
      exerciseId: exercise.id,
      exerciseName: 'Back Squat',
      achievementRate: 0,
      excessTargetValue: 0,
      excessWeightGrams: 0,
    }],
    progressionSuggestion: false,
    suggestion: null,
  }]);

  const renamed = await request(`/api/exercises/${exercise.id}`, {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ name: 'Competition Back Squat', version: exercise.version }),
  });
  assert.equal(renamed.status, 200);
  const renamedHistory = await request('/api/workout-sessions', { headers: { cookie } });
  [historySession] = (await renamedHistory.json()).workoutSessions;
  assert.equal(historySession.exercises[0].exerciseName, 'Competition Back Squat');
  assert.deepEqual({
    exerciseId: historySession.exercises[0].exerciseId,
    setCount: historySession.exercises[0].setCount,
    targetValue: historySession.exercises[0].targetValue,
    weightGrams: historySession.exercises[0].weightGrams,
  }, { exerciseId: exercise.id, setCount: 4, targetValue: 6, weightGrams: 100_000 });
  assert.equal(historySession.workoutPlanName, 'Session Plan');

  const forbiddenCorrection = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}/sets/1`, {
    method: 'PUT', headers: { cookie: otherCookie }, body: JSON.stringify({ actualValue: 8, actualWeight: 110, weightUnit: 'kg', version: historySession.version }),
  });
  assert.equal(forbiddenCorrection.status, 404);
  const completedAdd = await request(`/api/workout-sessions/${session.id}/exercises`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ exerciseId: exercise.id, setCount: 1, targetValue: 6, weight: 100, weightUnit: 'kg', version: historySession.version }),
  });
  assert.equal(completedAdd.status, 409);
  const completedRemove = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ version: historySession.version }),
  });
  assert.equal(completedRemove.status, 404);

  const correction = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ actualValue: 8, actualWeight: 110, weightUnit: 'kg', version: historySession.version }),
  });
  assert.equal(correction.status, 200);
  const correctedHistory = await request('/api/workout-sessions', { headers: { cookie } });
  [historySession] = (await correctedHistory.json()).workoutSessions;
  assert.equal(typeof historySession.modifiedAt, 'string');
  assert.equal(historySession.version, completedSession.version + 1);
  assert.deepEqual(historySession.exerciseResults[0], {
    sessionExerciseId: session.exercises[0].id,
    exerciseId: exercise.id,
    exerciseName: 'Competition Back Squat',
    achievementRate: 25,
    excessTargetValue: 2,
    excessWeightGrams: 10_000,
  });
  const correctedProgress = await request(`/api/plans/${plan.id}/progress`, { headers: { cookie } });
  assert.deepEqual((await correctedProgress.json()).progress[0].recent[0], {
    date: session.localStartDate,
    sessionExerciseId: session.exercises[0].id,
    exerciseId: exercise.id,
    exerciseName: 'Competition Back Squat',
    achievementRate: 25,
    excessTargetValue: 2,
    excessWeightGrams: 10_000,
  });

  const skipCorrection = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ skipped: true, version: historySession.version }),
  });
  assert.equal(skipCorrection.status, 200);
  const skippedHistory = await request('/api/workout-sessions', { headers: { cookie } });
  [historySession] = (await skippedHistory.json()).workoutSessions;
  assert.equal(historySession.exercises[0].setResults.find((result) => result.setIndex === 1).skipped, true);
  assert.equal(historySession.exerciseResults[0].achievementRate, 0);

  const restoreCorrection = await request(`/api/workout-sessions/${session.id}/exercises/${session.exercises[0].id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ actualValue: 8, actualWeight: 110, weightUnit: 'kg', version: historySession.version }),
  });
  assert.equal(restoreCorrection.status, 200);
  const restoredHistory = await request('/api/workout-sessions', { headers: { cookie } });
  [historySession] = (await restoredHistory.json()).workoutSessions;

  const unconfirmedDelete = await request(`/api/workout-sessions/${session.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ version: historySession.version }),
  });
  assert.equal(unconfirmedDelete.status, 400);
  const forbiddenDelete = await request(`/api/workout-sessions/${session.id}`, {
    method: 'DELETE', headers: { cookie: otherCookie }, body: JSON.stringify({ confirmation: 'DELETE', version: historySession.version }),
  });
  assert.equal(forbiddenDelete.status, 404);
  const deleted = await request(`/api/workout-sessions/${session.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ confirmation: 'DELETE', version: historySession.version }),
  });
  assert.equal(deleted.status, 204);

  const afterDeleteHistory = await request('/api/workout-sessions', { headers: { cookie } });
  assert.deepEqual((await afterDeleteHistory.json()).workoutSessions, []);
  const afterDeleteProgress = await request(`/api/plans/${plan.id}/progress`, { headers: { cookie } });
  assert.deepEqual((await afterDeleteProgress.json()).progress, []);
  assert.equal((await getPlan(cookie, plan.id)).id, plan.id);
  const remainingExercises = await request('/api/exercises', { headers: { cookie } });
  assert.equal((await remainingExercises.json()).exercises.find((item) => item.id === exercise.id).name, 'Competition Back Squat');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const remainingSetResults = await client.query('SELECT count(*)::int AS count FROM "session_set_result" WHERE "sessionExerciseId" = $1', [session.exercises[0].id]);
    assert.equal(remainingSetResults.rows[0].count, 0);
  } finally {
    await client.end();
  }
  assert.equal((await (await request('/api/workout-sessions/active', { headers: { cookie } })).json()).workoutSession, null);
});

test('User records sets and receives per-Exercise achievement without removed Exercises', async () => {
  const cookie = await signUp('SetRecorder');
  const plan = await createPlan(cookie, 'Scoring Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Full Body');
  const weighted = await createExercise(cookie, {
    name: 'Deadlift', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: weighted.id, setCount: 2, targetValue: 10, weight: 100, weightUnit: 'kg',
  });
  const underTarget = await createExercise(cookie, {
    name: 'Overweight Partial Reps', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: underTarget.id, setCount: 1, targetValue: 10, weight: 100, weightUnit: 'kg',
  });
  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(started.status, 201);
  const session = (await started.json()).workoutSession;
  const sessionExercise = session.exercises.find((item) => item.exerciseId === weighted.id);
  const underTargetSessionExercise = session.exercises.find((item) => item.exerciseId === underTarget.id);
  assert.ok(sessionExercise);
  assert.ok(underTargetSessionExercise);

  const firstSet = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ actualValue: 12, actualWeight: 110, weightUnit: 'kg', operationId: `${session.id}-record-deadlift-set-1`, version: session.version }),
  });
  assert.equal(firstSet.status, 200);
  assert.deepEqual((await firstSet.json()).setResult, {
    setIndex: 1, actualValue: 12, actualWeightGrams: 110_000, skipped: false,
  });
  const repeatedSet = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ actualValue: 1, actualWeight: 1, weightUnit: 'kg', operationId: `${session.id}-record-deadlift-set-1`, version: session.version }),
  });
  assert.equal(repeatedSet.status, 200);
  assert.deepEqual((await repeatedSet.json()).setResult, { setIndex: 1, actualValue: 12, actualWeightGrams: 110_000, skipped: false });

  const updatedOperationId = `${session.id}-update-deadlift-set-1`;
  const updatedSet = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ actualValue: 11, actualWeight: 105, weightUnit: 'kg', operationId: updatedOperationId, version: session.version }),
  });
  assert.equal(updatedSet.status, 200);
  const retriedUpdatedSet = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ actualValue: 1, actualWeight: 1, weightUnit: 'kg', operationId: updatedOperationId, version: session.version }),
  });
  assert.equal(retriedUpdatedSet.status, 200);
  assert.deepEqual((await retriedUpdatedSet.json()).setResult, { setIndex: 1, actualValue: 11, actualWeightGrams: 105_000, skipped: false });

  const partialWeightSet = await request(`/api/workout-sessions/${session.id}/exercises/${underTargetSessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ actualValue: 8, actualWeight: 110, weightUnit: 'kg', version: session.version }),
  });
  assert.equal(partialWeightSet.status, 200);

  const paused = await request(`/api/workout-sessions/${session.id}/pause`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: session.version }),
  });
  assert.equal(paused.status, 200);
  const pausedSession = (await paused.json()).workoutSession;
  const blockedWhilePaused = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/2`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ skipped: true, version: pausedSession.version }),
  });
  assert.equal(blockedWhilePaused.status, 409);
  const resumed = await request(`/api/workout-sessions/${session.id}/resume`, { method: 'POST', headers: { cookie }, body: JSON.stringify({ version: pausedSession.version }) });
  const resumedSession = (await resumed.json()).workoutSession;

  const skippedSet = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/2`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ skipped: true, version: resumedSession.version }),
  });
  assert.equal(skippedSet.status, 200);

  const duration = await createExercise(cookie, {
    name: 'Plank', resistanceType: 'BODYWEIGHT', targetType: 'DURATION',
  });
  const incompleteAdded = await request(`/api/workout-sessions/${session.id}/exercises`, {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ exerciseId: duration.id, setCount: 1, version: resumedSession.version }),
  });
  assert.equal(incompleteAdded.status, 400);
  const addedResponse = await request(`/api/workout-sessions/${session.id}/exercises`, {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ exerciseId: duration.id, setCount: 1, targetValue: 30, version: resumedSession.version }),
  });
  assert.equal(addedResponse.status, 201);
  const added = (await addedResponse.json()).sessionExercise;
  assert.equal(added.source, 'ADDED');
  const afterAdd = (await (await request('/api/workout-sessions/active', { headers: { cookie } })).json()).workoutSession;
  const addedSet = await request(`/api/workout-sessions/${session.id}/exercises/${added.id}/sets/1`, {
    method: 'PUT', headers: { cookie }, body: JSON.stringify({ actualValue: 45, version: afterAdd.version }),
  });
  assert.equal(addedSet.status, 200);
  assert.deepEqual((await addedSet.json()).setResult, {
    setIndex: 1, actualValue: 45, actualWeightGrams: null, skipped: false,
  });
  const removed = await request(`/api/workout-sessions/${session.id}/exercises/${added.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ version: afterAdd.version }),
  });
  assert.equal(removed.status, 204);
  const afterRemove = (await (await request('/api/workout-sessions/active', { headers: { cookie } })).json()).workoutSession;

  const completed = await request(`/api/workout-sessions/${session.id}/complete`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: afterRemove.version }),
  });
  assert.equal(completed.status, 200);
  assert.deepEqual((await completed.json()).exerciseResults, [{
    sessionExerciseId: sessionExercise.id,
    exerciseId: weighted.id,
    exerciseName: 'Deadlift',
    achievementRate: 50,
    excessTargetValue: 1,
    excessWeightGrams: 5_000,
  }, {
    sessionExerciseId: underTargetSessionExercise.id,
    exerciseId: underTarget.id,
    exerciseName: 'Overweight Partial Reps',
    achievementRate: 80,
    excessTargetValue: 0,
    excessWeightGrams: 0,
  }]);
});

test('User edits plan structure and permanently deletes an Exercise', async () => {
  const cookie = await signUp('PlanEditor');
  const plan = await createPlan(cookie, 'Editable Plan');
  const exercise = await createExercise(cookie, {
    name: 'Front Squat', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  const day = await createWorkoutDay(cookie, plan.id, 'Leg Day');
  const planned = await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 3, targetValue: 8, weight: 80, weightUnit: 'kg',
  });
  const currentPlan = await getPlan(cookie, plan.id);
  const currentDay = currentPlan.workoutDays.find((item) => item.id === day.id);
  assert.ok(currentDay);

  const renamedPlan = await request(`/api/plans/${plan.id}`, {
    method: 'PATCH', headers: { cookie }, body: JSON.stringify({ name: 'Edited Plan', version: currentPlan.version }),
  });
  assert.equal(renamedPlan.status, 200);

  const updatedDay = await request(`/api/plans/${plan.id}/days/${day.id}`, {
    method: 'PATCH', headers: { cookie },
    body: JSON.stringify({ name: 'Heavy Leg Day', suggestedWeekday: 4, version: currentDay.version }),
  });
  assert.equal(updatedDay.status, 200);
  const updatedDayRecord = (await updatedDay.json()).workoutDay;
  assert.equal(updatedDayRecord.version, 3);

  const updatedPlanned = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'PATCH', headers: { cookie },
    body: JSON.stringify({ setCount: 4, targetValue: 6, weight: 85, weightUnit: 'kg', version: planned.version }),
  });
  assert.equal(updatedPlanned.status, 200);
  const updatedPlannedBody = await updatedPlanned.json();
  const updatedPlannedRecord = updatedPlannedBody.plannedExercise;
  assert.deepEqual(updatedPlannedBody, {
    plannedExercise: {
      id: planned.id,
      exerciseId: exercise.id,
      setCount: 4,
      targetValue: 6,
      weightGrams: 85_000,
      version: 2,
    },
  });

  const plansBody = await request('/api/plans', { headers: { cookie } });
  assert.equal(plansBody.status, 200);
  const [savedPlan] = (await plansBody.json()).plans;
  assert.equal(savedPlan.name, 'Edited Plan');
  assert.equal(savedPlan.workoutDays[0].name, 'Heavy Leg Day');
  assert.equal(savedPlan.workoutDays[0].suggestedWeekday, 4);
  assert.equal(savedPlan.workoutDays[0].plannedExercises[0].exercise.name, 'Front Squat');

  const impact = await request(`/api/exercises/${exercise.id}`, { headers: { cookie } });
  assert.equal(impact.status, 200);
  assert.deepEqual((await impact.json()).exercise.plannedExerciseCount, 1);

  const removedPlanned = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ version: updatedPlannedRecord.version }),
  });
  assert.equal(removedPlanned.status, 204);

  const planAfterPlannedRemoval = await getPlan(cookie, plan.id);
  const dayAfterPlannedRemoval = planAfterPlannedRemoval.workoutDays.find((item) => item.id === day.id);
  assert.ok(dayAfterPlannedRemoval);
  const removedDay = await request(`/api/plans/${plan.id}/days/${day.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ version: dayAfterPlannedRemoval.version }),
  });
  assert.equal(removedDay.status, 204);

  const unconfirmedDelete = await request(`/api/exercises/${exercise.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({}),
  });
  assert.equal(unconfirmedDelete.status, 400);

  const deletedExercise = await request(`/api/exercises/${exercise.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ confirmation: 'DELETE', version: exercise.version }),
  });
  assert.equal(deletedExercise.status, 204);
  assert.deepEqual(await (await request('/api/exercises', { headers: { cookie } })).json(), { exercises: [] });
});

test('A Workout Day without Planned Exercises cannot start a Session', async () => {
  const cookie = await signUp('EmptyDay');
  const plan = await createPlan(cookie, 'Empty Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Empty Day');

  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(started.status, 409);
  const active = await request('/api/workout-sessions/active', { headers: { cookie } });
  assert.equal(active.status, 200);
  assert.equal((await active.json()).workoutSession, null);
});

test('Plan structure edits and deletes are isolated by owner', async () => {
  const aliceCookie = await signUp('PlanStructureOwner');
  const bobCookie = await signUp('PlanStructureOther');
  const plan = await createPlan(aliceCookie, 'Owner Plan');
  const exercise = await createExercise(aliceCookie, {
    name: 'Owned Press', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  const day = await createWorkoutDay(aliceCookie, plan.id, 'Owner Day');
  const planned = await addPlannedExercise(aliceCookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 2, targetValue: 8, weight: 70, weightUnit: 'kg',
  });

  const forbiddenPlan = await request(`/api/plans/${plan.id}`, {
    method: 'PATCH', headers: { cookie: bobCookie }, body: JSON.stringify({ name: 'Stolen Plan', version: plan.version }),
  });
  assert.equal(forbiddenPlan.status, 404);

  const forbiddenDay = await request(`/api/plans/${plan.id}/days/${day.id}`, {
    method: 'PATCH', headers: { cookie: bobCookie },
    body: JSON.stringify({ name: 'Stolen Day', suggestedWeekday: 2, version: day.version }),
  });
  assert.equal(forbiddenDay.status, 404);

  const forbiddenPlanned = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'PATCH', headers: { cookie: bobCookie },
    body: JSON.stringify({ setCount: 9, targetValue: 1, weight: 1, weightUnit: 'kg', version: planned.version }),
  });
  assert.equal(forbiddenPlanned.status, 404);

  const forbiddenPlannedDelete = await request(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
    method: 'DELETE', headers: { cookie: bobCookie }, body: JSON.stringify({ version: planned.version }),
  });
  assert.equal(forbiddenPlannedDelete.status, 404);

  const forbiddenDayDelete = await request(`/api/plans/${plan.id}/days/${day.id}`, {
    method: 'DELETE', headers: { cookie: bobCookie }, body: JSON.stringify({ version: day.version }),
  });
  assert.equal(forbiddenDayDelete.status, 404);

  const bobPlans = await request('/api/plans', { headers: { cookie: bobCookie } });
  assert.deepEqual(await bobPlans.json(), { plans: [] });

  const alicePlans = await request('/api/plans', { headers: { cookie: aliceCookie } });
  const [savedPlan] = (await alicePlans.json()).plans;
  assert.equal(savedPlan.name, 'Owner Plan');
  assert.equal(savedPlan.workoutDays[0].name, 'Owner Day');
  assert.equal(savedPlan.workoutDays[0].plannedExercises[0].setCount, 2);
});

test('Two devices editing the same Workout Plan receive an explicit conflict', async () => {
  const { cookie: firstDevice, email } = await registerVerifiedUser('PlanConflict');
  const secondSignIn = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  assert.equal(secondSignIn.status, 200);
  const secondDevice = secondSignIn.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const plan = await createPlan(firstDevice, 'Concurrent Plan');
  assert.equal(plan.version, 1);

  const firstEdit = await request(`/api/plans/${plan.id}`, {
    method: 'PATCH',
    headers: { cookie: firstDevice },
    body: JSON.stringify({ name: 'First Device Edit', version: plan.version }),
  });
  assert.equal(firstEdit.status, 200);

  const staleEdit = await request(`/api/plans/${plan.id}`, {
    method: 'PATCH',
    headers: { cookie: secondDevice },
    body: JSON.stringify({ name: 'Stale Second Device Edit', version: plan.version }),
  });
  assert.equal(staleEdit.status, 409);
  const conflict = await staleEdit.json();
  assert.equal(conflict.code, 'VERSION_CONFLICT');
  assert.equal(conflict.current.name, 'First Device Edit');
  assert.equal(conflict.current.version, 2);
});

test('A stale parent version cannot add a Workout Day', async () => {
  const { cookie: firstDevice, email } = await registerVerifiedUser('PlanChildConflict');
  const secondSignIn = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  const secondDevice = secondSignIn.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const plan = await createPlan(firstDevice, 'Child Conflict Plan');

  const firstDay = await request(`/api/plans/${plan.id}/days`, {
    method: 'POST',
    headers: { cookie: firstDevice },
    body: JSON.stringify({ name: 'First Day', version: plan.version }),
  });
  assert.equal(firstDay.status, 201);

  const staleDay = await request(`/api/plans/${plan.id}/days`, {
    method: 'POST',
    headers: { cookie: secondDevice },
    body: JSON.stringify({ name: 'Stale Day', version: plan.version }),
  });
  assert.equal(staleDay.status, 409);
  const conflict = await staleDay.json();
  assert.equal(conflict.code, 'VERSION_CONFLICT');
  assert.equal(conflict.current.version, 2);
});

test('A second device can explicitly take over an In-progress Session', async () => {
  const { cookie: firstDevice, email } = await registerVerifiedUser('SessionTakeover');
  const secondSignIn = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  assert.equal(secondSignIn.status, 200);
  const secondDevice = secondSignIn.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const thirdSignIn = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  assert.equal(thirdSignIn.status, 200);
  const thirdDevice = thirdSignIn.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const plan = await createPlan(firstDevice, 'Takeover Plan');
  const day = await createWorkoutDay(firstDevice, plan.id, 'Takeover Day');
  const exercise = await createExercise(firstDevice, {
    name: 'Takeover Press', resistanceType: 'BODYWEIGHT', targetType: 'REPETITIONS',
  });
  await addPlannedExercise(firstDevice, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 1, targetValue: 8,
  });
  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie: firstDevice },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(started.status, 201);
  const session = (await started.json()).workoutSession;
  const sessionExercise = session.exercises[0];

  const denied = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie: secondDevice },
    body: JSON.stringify({ actualValue: 8, version: session.version }),
  });
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).code, 'SESSION_TAKEN_OVER');

  const takeoverResponses = await Promise.all([
    request(`/api/workout-sessions/${session.id}/takeover`, {
      method: 'POST', headers: { cookie: secondDevice }, body: JSON.stringify({ version: session.version }),
    }),
    request(`/api/workout-sessions/${session.id}/takeover`, {
      method: 'POST', headers: { cookie: thirdDevice }, body: JSON.stringify({ version: session.version }),
    }),
  ]);
  assert.deepEqual(takeoverResponses.map((response) => response.status).sort(), [200, 409]);
  const winnerIndex = takeoverResponses.findIndex((response) => response.status === 200);
  const winningDevice = winnerIndex === 0 ? secondDevice : thirdDevice;
  const takenOver = (await takeoverResponses[winnerIndex].json()).workoutSession;
  assert.equal((await takeoverResponses[1 - winnerIndex].json()).code, 'VERSION_CONFLICT');
  assert.notEqual(takenOver.editingDeviceId, session.editingDeviceId);
  assert.equal(takenOver.version, session.version + 1);

  const oldDeviceWrite = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie: firstDevice },
    body: JSON.stringify({ actualValue: 8, version: takenOver.version }),
  });
  assert.equal(oldDeviceWrite.status, 409);
  assert.equal((await oldDeviceWrite.json()).code, 'SESSION_TAKEN_OVER');

  const newDeviceWrite = await request(`/api/workout-sessions/${session.id}/exercises/${sessionExercise.id}/sets/1`, {
    method: 'PUT', headers: { cookie: winningDevice },
    body: JSON.stringify({ actualValue: 8, version: takenOver.version }),
  });
  assert.equal(newDeviceWrite.status, 200);

  const completed = await request(`/api/workout-sessions/${session.id}/complete`, {
    method: 'POST', headers: { cookie: winningDevice }, body: JSON.stringify({ version: takenOver.version }),
  });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).workoutSession.editingDeviceId, null);
});

test('Session Exercise order can be changed and replayed idempotently', async () => {
  const cookie = await signUp('SessionOrder');
  const plan = await createPlan(cookie, 'Order Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Order Day');
  const firstExercise = await createExercise(cookie, {
    name: 'First Exercise', resistanceType: 'BODYWEIGHT', targetType: 'REPETITIONS',
  });
  const secondExercise = await createExercise(cookie, {
    name: 'Second Exercise', resistanceType: 'BODYWEIGHT', targetType: 'REPETITIONS',
  });
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: firstExercise.id, setCount: 1, targetValue: 8,
  });
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: secondExercise.id, setCount: 1, targetValue: 10,
  });
  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  const session = (await started.json()).workoutSession;
  const exerciseIds = session.exercises.map((exercise) => exercise.id).reverse();

  const reordered = await request(`/api/workout-sessions/${session.id}/exercises/order`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ exerciseIds, version: session.version }),
  });
  assert.equal(reordered.status, 200);
  const reorderedSession = (await reordered.json()).workoutSession;
  assert.deepEqual(reorderedSession.exercises.map((exercise) => exercise.id), exerciseIds);
  assert.equal(reorderedSession.version, session.version + 1);

  const replayed = await request(`/api/workout-sessions/${session.id}/exercises/order`, {
    method: 'PUT', headers: { cookie },
    body: JSON.stringify({ exerciseIds, version: session.version }),
  });
  assert.equal(replayed.status, 200);
  assert.deepEqual((await replayed.json()).workoutSession.exercises.map((exercise) => exercise.id), exerciseIds);
});

test('Abandoning an In-progress Session releases its editing lease', async () => {
  const { cookie } = await registerVerifiedUser('SessionAbandon');
  const plan = await createPlan(cookie, 'Abandon Plan');
  const day = await createWorkoutDay(cookie, plan.id, 'Abandon Day');
  const exercise = await createExercise(cookie, {
    name: 'Abandon Squat', resistanceType: 'BODYWEIGHT', targetType: 'REPETITIONS',
  });
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 1, targetValue: 5,
  });
  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  const session = (await started.json()).workoutSession;

  const abandoned = await request(`/api/workout-sessions/${session.id}/abandon`, {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ version: session.version }),
  });
  assert.equal(abandoned.status, 204);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const stored = await client.query('SELECT "editingDeviceId" FROM "workout_session" WHERE id = $1', [session.id]);
    assert.equal(stored.rows[0].editingDeviceId, null);
  } finally {
    await client.end();
  }
});

test('Permanent Exercise deletion is blocked by an In-progress Session', async () => {
  const cookie = await signUp('ProtectedExerciseOwner');
  const plan = await createPlan(cookie, 'Protected Exercise Plan');
  const exercise = await createExercise(cookie, {
    name: 'Protected Row', resistanceType: 'WEIGHTED', targetType: 'REPETITIONS',
  });
  const day = await createWorkoutDay(cookie, plan.id, 'Protected Day');
  await addPlannedExercise(cookie, plan.id, day.id, {
    exerciseId: exercise.id, setCount: 2, targetValue: 10, weight: 60, weightUnit: 'kg',
  });

  const started = await request('/api/workout-sessions', {
    method: 'POST', headers: { cookie },
    body: JSON.stringify({ workoutDayId: day.id, timeZone: 'Asia/Shanghai' }),
  });
  assert.equal(started.status, 201);

  const blockedDelete = await request(`/api/exercises/${exercise.id}`, {
    method: 'DELETE', headers: { cookie }, body: JSON.stringify({ confirmation: 'DELETE', version: exercise.version }),
  });
  assert.equal(blockedDelete.status, 409);

  const exercises = await request('/api/exercises', { headers: { cookie } });
  assert.equal((await exercises.json()).exercises.some((item) => item.id === exercise.id), true);
});
