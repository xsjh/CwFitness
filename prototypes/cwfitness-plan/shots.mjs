/**
 * Renders every variant of the plan-page prototype in a real browser and
 * screenshots it, so the throwaway prototype can be eyeballed without
 * hand-clicking four variants. Console errors and page errors fail the run.
 *
 * usage: node prototypes/cwfitness-plan/shots.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
const shots = `${here}screenshots`;
const variants = ['A', 'B', 'C', 'D'];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const problems = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`${viewport.name}: console ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`${viewport.name}: pageerror ${error.message}`));

  for (const variant of variants) {
    const url = `${pathToFileURL(`${here}index.html`).href}?variant=${variant}`;
    await page.goto(url);
    await page.waitForSelector('.shell');
    const counts = await page.evaluate(() => ({
      plans: document.querySelectorAll('[data-select-plan]').length,
      exercises: document.querySelectorAll('[data-planned]').length,
      chips: document.querySelectorAll('[data-select-day]').length,
    }));
    if (counts.plans === 0) problems.push(`${viewport.name}/${variant}: no plan rows rendered`);
    console.log(`${viewport.name}/${variant} plans=${counts.plans} dayChips=${counts.chips} exercises=${counts.exercises}`);
    await page.screenshot({ path: `${shots}/${viewport.name}-${variant}.png`, fullPage: false });
  }

  // exercise one mutation path per viewport so the delegated handlers are proven
  await page.goto(`${pathToFileURL(`${here}index.html`).href}?variant=A`);
  await page.waitForSelector('.shell');
  await page.click('[data-planned] .ex-actions [data-remove-planned]');
  await page.waitForSelector('.dialog');
  const impact = await page.textContent('.dialog .impact');
  console.log(`${viewport.name} confirm-layer impact: ${impact?.trim()}`);
  await page.click('.dialog .dialog-actions [data-cancel-dialog]');
  await page.waitForSelector('.dialog', { state: 'detached' });
  await page.close();
}

await browser.close();

if (problems.length > 0) {
  await writeFile(`${shots}/problems.txt`, problems.join('\n'));
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('all variants rendered without console or page errors');
}
