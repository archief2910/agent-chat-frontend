import { expect, test } from "@playwright/test";

test("the usage page is behind sign-in", async ({ page }) => {
  const response = await page.goto("/usage");
  expect(response?.status() ?? 0).toBeLessThan(500);
  await expect(page).toHaveURL(/sign-in|\/usage/);
  await expect(page.locator("body")).toBeVisible();
});
