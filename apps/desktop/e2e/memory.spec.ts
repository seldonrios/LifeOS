import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lifeos:onboarding:complete', 'true');
  });
  await page.goto('/');
});

test('navigates to memory and filters results', async ({ page }) => {
  await page.getByTestId('nav-memory').click();

  const memorySearch = page.getByTestId('memory-search');
  await expect(memorySearch).toBeVisible();

  const resultCountLabel = page.locator('.memory-capture-list .section-label');
  await expect(resultCountLabel).toBeVisible();

  const initialCountText = (await resultCountLabel.textContent()) ?? '';
  const initialCountMatch = initialCountText.match(/(\d+)\s+results/i);
  const initialCount = initialCountMatch?.[1] != null ? Number(initialCountMatch[1]) : 0;
  expect(initialCount).toBeGreaterThan(0);

  const captureRows = page.locator('.memory-card');
  await expect(captureRows).toHaveCount(initialCount);

  await memorySearch.fill('zzzzzzzz-no-memory-match');

  await expect(page.getByText('No captures match your search.')).toBeVisible();
  await expect(captureRows).toHaveCount(0);
});
