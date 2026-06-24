import { expect, test } from "@playwright/test";

import { loginAs, openDashboardTab } from "./_helpers";

test.describe("sub-admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "subAdmin");
  });

  test("Overview tab shows manager analytics and the risk board", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Manager Analytics")).toBeVisible();
    await expect(page.getByText("Conversion Rate (Enrolled)")).toBeVisible();
    await expect(page.getByText("Avg Review Time")).toBeVisible();
    await expect(page.getByText("Risk Board")).toBeVisible();
  });

  test("Overview includes the New Inquiries (Unclaimed) card", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Inquiries (Unclaimed)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View unassigned queue" })).toBeVisible();
  });

  test("Overview links to the weekly manager report", async ({ page }) => {
    const reportLink = page.getByRole("link", { name: "Download Weekly Manager Report" });
    await expect(reportLink).toBeVisible();
    await expect(reportLink).toHaveAttribute("href", /\/api\/sub-admin\/report/);
  });

  test("Case stage tiles open client details with export", async ({ page }) => {
    await page.getByRole("button", { name: "View Consultation and Documentation clients" }).first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Consultation and Documentation" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Phone" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Visa Service" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      /\/api\/sub-admin\/case-stage-export\?stage=CONSULTATION_AND_DOCUMENTATION/,
    );
  });

  test("Students tab shows triage filters and prioritised categories", async ({ page }) => {
    await openDashboardTab(page, "Students");
    await expect(page.getByText("Saved Triage Filters")).toBeVisible();
    await expect(page.getByText("Students Categorized by Priority")).toBeVisible();
    await expect(page.getByText("Filter by Case Stage")).toBeVisible();
  });

  test("client workflow reordering saves and persists", async ({ page }) => {
    await openDashboardTab(page, "Students");
    const studentCard = page.locator("article").filter({ hasText: "Student User" }).first();
    await studentCard.getByRole("link", { name: "View profile" }).click();

    const workflow = page.locator("#case-stage");
    await workflow.getByRole("button", { name: "Customise" }).click();

    const rows = workflow.locator("li");
    const originalFirst = (await rows.nth(0).locator("span.flex-1").innerText()).trim();
    const originalSecond = (await rows.nth(1).locator("span.flex-1").innerText()).trim();
    expect(originalFirst).toBeTruthy();
    expect(originalSecond).toBeTruthy();

    const firstDragHandle = workflow.getByRole("button", { name: "Drag to reorder" }).first();
    await firstDragHandle.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await workflow.getByRole("button", { name: "Save", exact: true }).click();

    await expect(workflow.getByRole("heading", { name: "Case Stage" })).toBeVisible();
    await workflow.getByRole("button", { name: "Customise" }).click();
    await expect(rows.nth(0)).toContainText(originalSecond!);
    await expect(rows.nth(1)).toContainText(originalFirst!);

    const restoreDragHandle = workflow.getByRole("button", { name: "Drag to reorder" }).first();
    await restoreDragHandle.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await workflow.getByRole("button", { name: "Save", exact: true }).click();

    await expect(workflow.getByRole("heading", { name: "Case Stage" })).toBeVisible();
  });

  test("Team & Operations tab shows the approval queue and assignment board", async ({ page }) => {
    await openDashboardTab(page, "Team & Operations");
    await expect(page.getByText("Approval Queue")).toBeVisible();
    await expect(page.getByText("Assignment Board")).toBeVisible();
  });

  test("notification bell is mounted in the top bar", async ({ page }) => {
    const bell = page.getByRole("button", { name: "Open workflow notifications" });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  });
});
