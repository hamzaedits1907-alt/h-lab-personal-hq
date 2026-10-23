import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, watchErrors } from './helpers';

test.describe('public site', () => {
  test('renders without console errors or CSP violations', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Projects in progress');
    await expect(page.locator('.card')).toHaveCount(7);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole('contentinfo')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('every navigation link points at a real section', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    const nav = isMobile ? page.locator('#mobile-nav') : page.getByRole('navigation', { name: 'Main' });
    const hrefs = await nav.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^#/);
      await expect(page.locator(href!), href!).toHaveCount(1);
    }
  });

  test('mobile menu opens, navigates and closes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#mobile-nav').getByRole('link', { name: 'About' }).click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'About', level: 2 })).toBeInViewport();
  });

  test('opens and closes a project dialog, keyboard accessible', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const card = page.getByRole('link', { name: /Project-Frame/ });
    await card.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Project-Frame' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\?project=project-frame/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/project=/);
    expect(errors).toEqual([]);
  });

  test('deep link opens the dialog directly', async ({ page }) => {
    await page.goto('/?project=jarvis');
    await expect(page.getByRole('dialog', { name: 'JARVIS' })).toBeVisible();
  });

  test('status filters work', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Experiment' }).click();
    await expect(page.locator('.card')).toHaveCount(2);
  });

  test('skip link is the first focusable element', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard only');
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });

  test('respects reduced motion: no running animations', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4199/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.art__spin, .art__rotate, .hero__eyebrow-dot')].map((e) => getComputedStyle(e).animationName),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n === 'none')).toBe(true);
    // content is visible without scrolling it into view
    await expect(page.locator('#about')).toBeVisible();
    await ctx.close();
  });

  test('unknown routes show a 404 page', async ({ page }) => {
    await page.goto('/definitely-not-here');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
