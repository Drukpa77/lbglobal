import { expect, test } from "@playwright/test";

test("admin dashboard shows command center sections", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@lbglobal.test");
  await page.getByLabel("Password").fill("AdminPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/admin/);
  await expect(page.getByRole("heading", { name: "Admin Analytics Dashboard" })).toBeVisible();
  await expect(page.getByText("Admin Command Center")).toBeVisible();
  await expect(page.getByText("Approvals Queue")).toBeVisible();
  await expect(page.getByText("Case Pressure")).toBeVisible();
  await expect(page.getByText("Team Capacity", { exact: true })).toBeVisible();
});

test("admin dashboard still shows core management sections", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@lbglobal.test");
  await page.getByLabel("Password").fill("AdminPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/admin/);
  await expect(page.getByText("Internal Staff Accounts")).toBeVisible();
  await expect(page.getByText("Filtered Submissions & Assignment")).toBeVisible();
  await expect(page.getByText("Lead Source Analytics (How did you hear from us?)")).toBeVisible();
});
