import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/');
});

test('completes onboarding flow', async ({ page }) => {
  await expect(page.getByTestId('welcome-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Get started' }).click();

  await page.getByRole('button', { name: 'Recommended' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const checking = page.getByText('Checking local services...');
  if (await checking.isVisible().catch(() => false)) {
    await expect(checking).toBeHidden();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('textbox', { name: 'Example: Plan this weekend' }).fill('Set up my weekly planning workflow.');
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page.getByTestId('welcome-overlay')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
});
