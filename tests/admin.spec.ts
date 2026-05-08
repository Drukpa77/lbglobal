import { expect, test } from "@playwright/test";

import { loginAs, openDashboardTab } from "./_helpers";

test.describe("admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("Overview tab shows the executive snapshot and command center", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Admin Analytics Dashboard" })).toBeVisible();
    await expect(page.getByText("Executive Snapshot")).toBeVisible();
    await expect(page.getByText("Admin Command Center")).toBeVisible();
    await expect(page.getByText("Approvals Queue")).toBeVisible();
    await expect(page.getByText("Case Pressure")).toBeVisible();
    await expect(page.getByText("Team Capacity", { exact: true })).toBeVisible();
  });

  test("Overview tab includes the New Inquiries (Unclaimed) card", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Inquiries (Unclaimed)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View unassigned queue" })).toBeVisible();
  });

  test("notification bell is mounted in the top bar", async ({ page }) => {
    const bell = page.getByRole("button", { name: "Open workflow notifications" });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  });

  test("Students tab exposes the filtered submissions surface", async ({ page }) => {
    await openDashboardTab(page, "Students");
    await expect(page.getByText("Filtered Submissions & Assignment")).toBeVisible();
  });

  test("Analytics tab shows lead source analytics", async ({ page }) => {
    await openDashboardTab(page, "Analytics");
    await expect(
      page.getByText("Lead Source Analytics (How did you hear from us?)"),
    ).toBeVisible();
  });

  test("Staff & Content tab lists internal staff accounts", async ({ page }) => {
    await openDashboardTab(page, "Staff & Content");
    await expect(page.getByText("Internal Staff Accounts")).toBeVisible();
  });
});
