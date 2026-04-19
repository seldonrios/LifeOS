import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lifeos:onboarding:complete', 'true');
  });
  await page.goto('/');
});

test('shows service connections and module marketplace', async ({ page }) => {
  await page.getByTestId('nav-integrations').click();

  await expect(page.getByTestId('integrations-service-connections')).toBeVisible();
  await expect(page.getByText('Module Marketplace')).toBeVisible();
});
