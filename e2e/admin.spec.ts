import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, signIn, watchErrors } from './helpers';

test.describe('admin', () => {
  test('is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
    await expect(page.getByText('Add a section')).toHaveCount(0);
  });

  test('wrong password is rejected', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Email').fill('demo@hlab.local');
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
  });

  test('edit a project, see it on the public site, then reorder and hide it', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page);

    await page.goto('/admin/projects');
    await page.getByRole('link', { name: 'Project Genius', exact: true }).first().click();
    const title = page.getByLabel(/^Title/);
    await title.fill('Genius Renamed');
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page.getByText('Project saved')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /Genius Renamed/ })).toBeVisible();

    await page.goto('/admin/projects');
    await page.getByRole('button', { name: 'Move Project Browser up' }).click();
    await expect(page.getByText('Order saved')).toBeVisible();
    await page.getByRole('switch', { name: 'Show Genius Renamed on the site' }).click();
    await expect(page.getByText('Project hidden')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('.card')).toHaveCount(6);
    await expect(page.locator('.card__title').first()).toHaveText('Project Browser');
    await expect(page.getByRole('link', { name: /Genius Renamed/ })).toHaveCount(0);

    // preview shows it again, clearly marked
    await page.goto('/?preview=1');
    await expect(page.locator('.card')).toHaveCount(7);
    await expect(page.getByRole('status').filter({ hasText: 'Preview' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('appearance changes preview live and persist', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/appearance');
    await page.getByRole('radio', { name: 'Lavender' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'lavender');
    await page.getByRole('button', { name: 'Save appearance' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'lavender');
  });

  test('upload an image (valid and invalid), use it as a cover, and see deletion blocked', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/media');
    await page.getByLabel('Image file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Unsupported file type');

    // 1x1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.getByLabel('Image file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await page.getByLabel('Alt text').first().fill('A single pixel');
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Image uploaded')).toBeVisible();

    await page.goto('/admin/projects');
    await page.getByRole('link', { name: 'JARVIS', exact: true }).first().click();
    await page.getByRole('button', { name: 'Choose image' }).click();
    await page.getByRole('button', { name: /Select image A single pixel/ }).click();
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page.getByText('Project saved')).toBeVisible();

    await page.goto('/admin/media');
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog', { name: 'This image is still in use' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Project: JARVIS/ })).toBeVisible();
  });

  test('every admin page fits the viewport and has no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page);
    const paths = [
      '/admin',
      '/admin/projects',
      '/admin/projects/00000000-0000-4000-8000-000000000201',
      '/admin/sections',
      '/admin/sections/00000000-0000-4000-8000-000000000101',
      '/admin/media',
      '/admin/appearance',
      '/admin/text',
      '/admin/settings',
    ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForTimeout(150);
      await noHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
  });
});
