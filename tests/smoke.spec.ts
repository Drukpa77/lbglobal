import { expect, test } from "@playwright/test";

test.describe("public smoke", () => {
  test("homepage renders with primary CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Apply Now" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("login page exposes the form and seeded credential hints", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to dashboard" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByText("Seed users")).toBeVisible();
  });

  test("apply page renders the inquiry form", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.locator("input[name='fullName']")).toBeVisible();
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("select[name='hearFrom']")).toBeVisible();
    await expect(page.getByRole("button", { name: /Submit inquiry/i })).toBeVisible();
  });

  test("unauthenticated visitor is redirected to /login from any dashboard route", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials surface an inline error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@lbglobal.test");
    await page.getByLabel("Password").fill("WrongPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });
});
