import { expect, test } from "@playwright/test";

test("homepage renders with modern hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "L&B Global" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Study In Australia")).toBeVisible();
});

test("login page fields and seeded users hint visible", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText("Seed users")).toBeVisible();
});

test("unauthenticated user redirected to login from dashboard", async ({ page }) => {
  await page.goto("/dashboard/student");
  await expect(page).toHaveURL(/\/login/);
});
