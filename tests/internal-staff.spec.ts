import { expect, test } from "@playwright/test";

import { loginAs, openDashboardTab } from "./_helpers";

test.describe("internal staff dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "internalStaff");
  });

  test("Overview tab shows the case stage pipeline and daily report controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Internal Staff Dashboard" })).toBeVisible();
    await expect(page.getByText("Case Stage Pipeline")).toBeVisible();
    await expect(page.getByText("Daily Work Report")).toBeVisible();
    const reportLink = page.getByRole("link", { name: "Download Report CSV" });
    await expect(reportLink).toBeVisible();
    await expect(reportLink).toHaveAttribute("href", /\/api\/internal-staff\/report/);
  });

  test("Work Queue tab shows saved filters", async ({ page }) => {
    await openDashboardTab(page, "Work Queue");
    await expect(page.getByText("Saved Filters")).toBeVisible();
    await expect(page.getByRole("link", { name: "Overdue Focus" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Due Today" })).toBeVisible();
  });

  test("Tasks & Docs tab surfaces the document verification queue", async ({ page }) => {
    await openDashboardTab(page, "Tasks & Docs");
    await expect(page.getByText("Documents Pending Verification")).toBeVisible();
  });

  test("Students tab links into a delegated student profile when available", async ({ page }) => {
    await openDashboardTab(page, "Students");
    const openLink = page.getByRole("link", { name: "Open Student Profile" }).first();

    // Some demo environments may not yet have an active assignment for the
    // seeded internal-staff user; skip gracefully in that case.
    if (!(await openLink.isVisible().catch(() => false))) {
      test.skip(true, "No delegated students for the seeded internal-staff user.");
    }

    await openLink.click();
    await expect(page).toHaveURL(/\/dashboard\/students\//);
    await expect(page.getByRole("heading", { name: "Student Profile" })).toBeVisible();
  });

  test("notification bell is mounted in the top bar", async ({ page }) => {
    const bell = page.getByRole("button", { name: "Open workflow notifications" });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  });
});
