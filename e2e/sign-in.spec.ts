import { expect, test } from "@playwright/test";

test("the app answers on the home page", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok() || response?.status() === 307 || response?.status() === 200).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
});

test("tasks and a chat address stay behind sign-in", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/sign-in/);
  await page.goto("/c/chat_example");
  await expect(page).toHaveURL(/sign-in/);
});
