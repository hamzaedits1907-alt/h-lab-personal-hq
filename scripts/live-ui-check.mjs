// Real-browser check of a deployed (or locally served) H/LAB against the LIVE database.
//   node scripts/live-ui-check.mjs <base-url>
// Reads the admin login from supabase/.secrets.local/hlab-admin-login.txt (gitignored).
// Leaves no data behind: it renames a project then restores the title, and uploads then deletes a 1x1 image.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:4200').replace(/\/$/, '');
const login = Object.fromEntries(
  readFileSync('supabase/.secrets.local/hlab-admin-login.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(': ')).map((l) => l.split(': ')),
);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) failed++; };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(base + '/');
  await page.getByRole('heading', { name: 'Projects' }).first().waitFor();
  ok('public site renders live projects', (await page.getByText('Project Genius').count()) > 0);

  await page.goto(base + '/admin');
  await page.getByLabel('Email').fill('wrong@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  ok('wrong credentials are rejected', await page.getByRole('alert').waitFor({ timeout: 8000 }).then(() => true, () => false));
  errors.length = 0; // the rejected sign-in legitimately logs a 400

  await page.getByLabel('Email').fill(login.email);
  await page.getByLabel('Password').fill(login.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
  ok('real admin login reaches the dashboard', true);

  // text edit + persistence
  await page.goto(base + '/admin/projects');
  await page.getByRole('link', { name: 'JARVIS', exact: true }).first().click();
  const title = page.getByLabel(/^Title/);
  await title.fill('JARVIS live-ui-check');
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.getByText('Project saved').waitFor();
  await page.goto(base + '/');
  ok('edited text appears on the public site', await page.getByText('JARVIS live-ui-check').first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  const anon = await browser.newPage();
  await anon.goto(base + '/');
  await anon.getByText('JARVIS live-ui-check').first().waitFor();
  ok('edit persisted in the database (fresh visitor session sees it)', true);
  await anon.close();
  await page.goto(base + '/admin/projects');
  await page.getByRole('link', { name: 'JARVIS live-ui-check' }).first().click();
  await page.getByLabel(/^Title/).fill('JARVIS');
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.getByText('Project saved').waitFor();
  ok('title restored', true);

  // image upload through the UI
  await page.goto(base + '/admin/media');
  await page.getByLabel('Image file').first().setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('Alt text').first().fill('live ui check pixel');
  await page.getByRole('button', { name: 'Upload' }).click();
  await page.getByText('Image uploaded').waitFor({ timeout: 15000 });
  ok('image upload to the live bucket succeeds', true);
  const src = await page.locator('img[src*="/storage/v1/object/public/hlab-media/"]').first().getAttribute('src');
  const r = src ? await fetch(src) : null;
  ok('uploaded image is served from storage', !!r && r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png'), src ? String(r?.status) : 'no <img>');
  await page.getByRole('button', { name: 'Delete' }).first().click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Delete' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.getByText(/Image deleted|deleted/i).first().waitFor({ timeout: 10000 }).catch(() => {});
  ok('no console errors', errors.filter((e) => !/favicon/.test(e)).length === 0, errors.slice(0, 2).join(' | '));
} catch (e) {
  ok('script completed', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL UI CHECKS PASSED');
process.exit(failed ? 1 : 0);
