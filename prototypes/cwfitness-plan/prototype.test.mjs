import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

// The four variants answered four different questions about the plan page.
for (const variant of ['A', 'B', 'C', 'D']) {
  assert.ok(new RegExp(`function variant${variant}\\(`).test(html), `missing variant ${variant}`);
}
assert.match(html, /const VARIANTS_MAP = \{ A: variantA, B: variantB, C: variantC, D: variantD \}/, 'variant map must cover A-D');
assert.match(html, /function step\(delta\)/, 'missing variant stepper');

// Decisions the prototype exists to show.
for (const decision of [
  '[data-select-plan]',              // master-detail tree navigation
  '[data-select-day]',               // day switching inside a plan
  'data-edit-title',                 // inline rename, no <details> round trip
  'data-move-day',                   // reorder via arrow buttons, not drag
  'data-move-planned',
  'data-close-layer',                // our own confirm layer, not window.confirm
  'data-remove-day',
]) {
  assert.ok(html.includes(decision), `missing interaction: ${decision}`);
}

// The two features the user asked to drop must not come back.
assert.ok(!html.includes('accentColor'), 'accent color feature must stay removed');
assert.ok(!html.includes('coverKey'), 'cover feature must stay removed');
assert.ok(!html.includes('plan-cover-'), 'dead plan-cover-* class must stay removed');

// Index must be a narrow tree beside a single content column, plus a mobile drawer.
assert.ok(
  html.includes('.vB .vB-grid{display:grid;grid-template-columns:296px minmax(0,1fr)'),
  'variant B must pair a narrow plan tree with one content column',
);
assert.ok(html.includes('data-open-drawer'), 'mobile index must collapse into a drawer');

// Guardrails inherited from the earlier prototype work.
for (const query of ['prefers-reduced-motion', 'prefers-reduced-transparency', 'prefers-contrast']) {
  assert.ok(html.includes(`@media(${query}:`), `missing ${query} handling`);
}
assert.ok(!html.includes('transition: all'), 'transition: all must not ship');
assert.ok(!html.includes('ease-in;'), 'ease-in UI animation must not ship');
assert.ok(!html.includes('window.confirm'), 'native confirm must not ship in the prototype');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length > 0, 'prototype must include a behavior script');
assert.doesNotThrow(() => new Function(scripts.at(-1)[1]), 'inline behavior script must parse');

console.log('Plan-page prototype: variants A-D, decisions, dropped features, and guardrails passed.');
