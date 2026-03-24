import { expect, test } from "@playwright/test";

test("internal staff login can access dashboard UI", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@lbglobal.test");
  await page.getByLabel("Password").fill("StaffPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/internal-staff/);
  await expect(page.getByRole("heading", { name: "Internal Staff Dashboard" })).toBeVisible();
  await expect(page.getByText("Today's Priority Queue")).toBeVisible();
  await expect(page.getByText("Documents Pending Verification")).toBeVisible();
});

test("internal staff can open delegated student profile", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@lbglobal.test");
  await page.getByLabel("Password").fill("StaffPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/internal-staff/);
  const openStudentButton = page.getByRole("link", { name: "Open Student Profile" }).first();
  await expect(openStudentButton).toBeVisible();
  await openStudentButton.click();

  await expect(page).toHaveURL(/\/dashboard\/students\//);
  await expect(page.getByRole("heading", { name: "Student Profile Management" })).toBeVisible();
});

test("internal staff dashboard shows phase 2 operations sections", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@lbglobal.test");
  await page.getByLabel("Password").fill("StaffPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/internal-staff/);
  await expect(page.getByText("Case Stage Pipeline")).toBeVisible();
  await expect(page.getByText("SOP Task Templates")).toBeVisible();
  await expect(page.getByText("Deadline Calendar (Next items)")).toBeVisible();
});

test("internal staff dashboard shows saved filters and doc verification actions", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@lbglobal.test");
  await page.getByLabel("Password").fill("StaffPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/internal-staff/);
  await expect(page.getByText("Saved Filters")).toBeVisible();
  await expect(page.getByRole("link", { name: "Overdue Focus" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Due Today" })).toBeVisible();
  await expect(page.getByText("Documents Pending Verification")).toBeVisible();
  const pendingEmptyState = page.getByText("No pending documents right now.");
  if (await pendingEmptyState.isVisible()) {
    await expect(pendingEmptyState).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" }).first()).toBeVisible();
  }
});

test("internal staff can see daily report download link and filters", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@lbglobal.test");
  await page.getByLabel("Password").fill("StaffPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/internal-staff/);
  await expect(page.getByText("Daily Work Report")).toBeVisible();
  const reportLink = page.getByRole("link", { name: "Download Report CSV" });
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveAttribute("href", /\/api\/internal-staff\/report\?filter=/);
});
