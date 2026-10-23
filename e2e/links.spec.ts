import { expect, test } from '@playwright/test';
import { signIn, watchErrors } from './helpers';

test('project links: set in admin, shown (safely) in the dialog, absent when empty', async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page);
  await page.goto('/admin/projects');
  await page.getByRole('link', { name: 'JARVIS', exact: true }).first().click();
  await page.getByLabel(/Project link/).fill('https://example.com/jarvis');
  await page.getByLabel(/Source code link/).fill('http://insecure.example');
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByText('Must be a valid https:// address').first()).toBeVisible();
  await page.getByLabel(/Source code link/).fill('https://github.com/example/jarvis');
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();

  await page.goto('/?project=jarvis');
  const dialog = page.getByRole('dialog', { name: 'JARVIS' });
  const open = dialog.getByRole('link', { name: /Open project/ });
  const source = dialog.getByRole('link', { name: /Source code/ });
  await expect(open).toHaveAttribute('href', 'https://example.com/jarvis');
  await expect(source).toHaveAttribute('href', 'https://github.com/example/jarvis');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', /noopener/);
  // clicking a link must not close the dialog or change the page
  await open.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await open.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');

  // a project with no links shows none, and no dead '#' links
  await page.goto('/?project=project-frame');
  const empty = page.getByRole('dialog', { name: 'Project-Frame' });
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('link')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the About section is personal and concise', async ({ page }) => {
  await page.goto('/');
  const about = page.locator('#about');
  await expect(about).toContainText('curious builder');
  await expect(about).toContainText('H/LAB is where I bring those experiments together.');
  await expect(about.locator('.chip')).toHaveCount(5);
});
