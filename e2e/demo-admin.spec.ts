import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, watchErrors } from './helpers';

const LEGACY_ABOUT = {
  en: 'H/LAB is where I keep my personal projects: AI tools, desktop software, games and simulations. Everything here is a work in progress.',
  tr: 'H/LAB, kişisel projelerimi topladığım yer: yapay zekâ araçları, masaüstü yazılımları, oyunlar ve simülasyonlar. Buradaki her şey yapım aşamasında.',
};

test.describe('demo admin preview', () => {
  test('is visible on the public site, opens the REAL admin, and leads back', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const bar = page.getByRole('complementary', { name: 'Demo mode' });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('data stays in this browser');
    await noHorizontalOverflow(page);

    await bar.getByRole('button', { name: 'Open demo admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(); // the real React admin, signed in automatically
    const strip = page.getByRole('note').filter({ hasText: 'Demo admin' });
    await expect(strip).toContainText('local-only');
    await noHorizontalOverflow(page);

    // every admin section loads and is usable
    for (const [link, heading] of [
      ['Projects', 'Projects'],
      ['Sections', 'Sections'],
      ['Media', 'Media library'],
      ['Appearance', 'Appearance'],
      ['Site text', 'Site text'],
      ['Settings', 'Settings'],
      ['Dashboard', 'Dashboard'],
    ] as const) {
      await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }

    await strip.getByRole('link', { name: /Back to public site/ }).click();
    await expect(page).toHaveURL(/localhost:4199\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Projects in progress');
    expect(errors).toEqual([]);
  });

  test('the admin can edit a project and site text, and the public site reflects it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open demo admin' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.goto('/admin/projects');
    await page.getByRole('link', { name: 'Project Browser', exact: true }).first().click();
    await page.getByLabel('Short summary').fill('A fast, gaming-first browser.');
    await page.getByLabel(/Project link/).fill('https://example.org/browser');
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page.getByText('Project saved')).toBeVisible();

    await page.goto('/admin/text');
    await page.getByLabel('Footer text').fill('Edited in the demo admin.');
    await page.getByRole('button', { name: 'Save site text' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.goto('/?project=project-browser');
    const dialog = page.getByRole('dialog', { name: 'Project Browser' });
    await expect(dialog).toContainText('A fast, gaming-first browser.');
    await expect(dialog.getByRole('link', { name: /Open project/ })).toHaveAttribute('href', 'https://example.org/browser');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('contentinfo')).toContainText('Edited in the demo admin.');
  });

  test('Reset demo restores the starter content', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open demo admin' }).click();
    await page.goto('/admin/text');
    await page.getByLabel('Footer text').fill('Temporary text');
    await page.getByRole('button', { name: 'Save site text' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page).toHaveURL(/localhost:4199\/$/);
    await expect(page.getByRole('contentinfo')).toContainText('Built by hand. Always in progress.');
  });
});

test.describe('visible content', () => {
  test('the personal About copy is shown', async ({ page }) => {
    await page.goto('/');
    const about = page.locator('#about');
    await expect(about).toContainText("I'm a curious builder who likes turning ambitious ideas into real software.");
    await expect(about).toContainText('H/LAB is where I bring those experiments together.');
    for (const chip of ['AI assistants', 'Desktop apps', 'Browsers', 'Creative tools', 'Simulation worlds']) {
      await expect(about.locator('.chip', { hasText: chip })).toHaveCount(1);
    }
  });

  test('a browser holding the first release\'s saved data still gets the new About copy', async ({ page }) => {
    // Seed old-format data BEFORE the app runs: exactly the state that made the site look unchanged.
    await page.goto('/');
    await page.evaluate((legacy) => {
      const d = JSON.parse(localStorage.getItem('hlab-demo-data-v1')!);
      delete d.version;
      const about = d.blocks.find((b: { type: string }) => b.type === 'about');
      about.content.body = legacy;
      for (const p of d.projects) delete p.repoUrl;
      localStorage.setItem('hlab-demo-data-v1', JSON.stringify(d));
    }, LEGACY_ABOUT);
    await page.reload();
    await expect(page.locator('#about')).toContainText('curious builder');
    await expect(page.locator('#about')).not.toContainText('Everything here is a work in progress');
  });

  test('each project card shows its own cover artwork', async ({ page }) => {
    await page.goto('/');
    const arts = page.locator('.card .cover-art');
    await expect(arts).toHaveCount(7);
    expect(await arts.evaluateAll((els) => els.map((e) => e.getAttribute('data-art')))).toEqual([
      'project-genius',
      'project-browser',
      'project-frame',
      'jarvis',
      'edward',
      'lufthansa-launcher',
      'project-genesis',
    ]);
    const distinct = await arts.evaluateAll((els) => new Set(els.map((e) => e.innerHTML)).size);
    expect(distinct).toBe(7);
    // the art is actually painted (non-zero size), not an empty element
    for (const box of await arts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThan(80);
  });

  test('dialog shows real links only where they exist', async ({ page }) => {
    await page.goto('/?project=project-genius');
    let dialog = page.getByRole('dialog', { name: 'Project Genius' });
    await expect(dialog.locator('.cover-art')).toBeVisible();
    const open = dialog.getByRole('link', { name: /Open project/ });
    await expect(open).toHaveAttribute('href', 'https://project-genius.netlify.app/');
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', /noopener/);
    await expect(dialog.getByRole('link', { name: /Source code/ })).toHaveCount(0); // none set: no button

    await page.goto('/?project=lufthansa-launcher');
    dialog = page.getByRole('dialog', { name: 'Lufthansa Launcher' });
    await expect(dialog.getByRole('link', { name: /Open project/ })).toHaveAttribute('href', 'https://lufthansa-connect-ptfs.netlify.app/');

    await page.goto('/?project=project-browser'); // no verified website: no buttons, no dead links
    dialog = page.getByRole('dialog', { name: 'Project Browser' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link')).toHaveCount(0);
    expect(await page.locator('a[href="#"]').count()).toBe(0);
  });

  test('clicking a valid link opens its real destination in a new tab', async ({ page, context }) => {
    await page.goto('/?project=project-genius');
    // Intercept the destination so the test needs no network access, but still proves the tab target.
    await context.route('https://project-genius.netlify.app/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Project Genius</title>ok' }));
    const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: /Open project/ }).click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe('https://project-genius.netlify.app/');
    expect(await popup.evaluate(() => window.opener)).toBeNull(); // noopener: the new tab cannot reach this page
    await expect(page.getByRole('dialog', { name: 'Project Genius' })).toBeVisible(); // the dialog stayed open
  });
});
