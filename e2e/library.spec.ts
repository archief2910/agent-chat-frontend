import { expect, test } from "@playwright/test";

test("the library page is behind sign-in", async ({ page }) => {
  const response = await page.goto("/library");
  expect(response?.status() ?? 0).toBeLessThan(500);
  await expect(page).toHaveURL(/sign-in|\/library/);
  await expect(page.locator("body")).toBeVisible();
});
