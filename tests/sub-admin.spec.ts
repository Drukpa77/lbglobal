import { expect, test } from "@playwright/test";

test("sub-admin dashboard shows command center sections", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@lbglobal.test");
  await page.getByLabel("Password").fill("AgentPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/sub-admin/);
  await expect(page.getByRole("heading", { name: "Sub Admin Dashboard" })).toBeVisible();
  await expect(page.getByText("Approval Queue")).toBeVisible();
  await expect(page.getByText("Assignment Board")).toBeVisible();
  await expect(page.getByText("Team Workload", { exact: true })).toBeVisible();
  await expect(page.getByText("Unassigned Cases").first()).toBeVisible();
});

test("sub-admin dashboard keeps existing submissions list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@lbglobal.test");
  await page.getByLabel("Password").fill("AgentPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/sub-admin/);
  await expect(page.getByText("Assigned Submissions")).toBeVisible();
  await expect(page.getByText("Students Categorized by Priority")).toBeVisible();
});

test("sub-admin dashboard shows triage filters and bulk action controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@lbglobal.test");
  await page.getByLabel("Password").fill("AgentPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/sub-admin/);
  await expect(page.getByText("Saved Triage Filters")).toBeVisible();
  await expect(page.getByRole("link", { name: "Unassigned" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Needs Approval" })).toBeVisible();
  await expect(page.getByText("Apply status to selected")).toBeVisible();
  await expect(page.getByText("Select for bulk update").first()).toBeVisible();
});

test("sub-admin dashboard shows risk board and SLA alerts", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@lbglobal.test");
  await page.getByLabel("Password").fill("AgentPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/sub-admin/);
  await expect(page.getByText("Risk Board")).toBeVisible();
  await expect(page.getByText("SLA Breach Alerts")).toBeVisible();
  await expect(page.getByText("Visa Expiring <=30d")).toBeVisible();
  await expect(page.getByText("Pending Docs/Approvals")).toBeVisible();
});

test("sub-admin dashboard shows manager analytics and report export", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@lbglobal.test");
  await page.getByLabel("Password").fill("AgentPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard\/sub-admin/);
  await expect(page.getByText("Manager Analytics")).toBeVisible();
  await expect(page.getByText("Avg Review Time")).toBeVisible();
  await expect(page.getByText("Conversion Rate (Enrolled)")).toBeVisible();
  const reportLink = page.getByRole("link", { name: "Download Weekly Manager Report" });
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveAttribute("href", /\/api\/sub-admin\/report/);
});
