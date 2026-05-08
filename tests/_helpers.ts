import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type RoleAccount = "admin" | "subAdmin" | "internalStaff";

const accounts: Record<
  RoleAccount,
  { email: string; password: string; dashboardPath: RegExp }
> = {
  admin: {
    email: "admin@lbglobal.test",
    password: "AdminPass123!",
    dashboardPath: /\/dashboard\/admin/,
  },
  subAdmin: {
    email: "agent@lbglobal.test",
    password: "AgentPass123!",
    dashboardPath: /\/dashboard\/sub-admin/,
  },
  internalStaff: {
    email: "staff@lbglobal.test",
    password: "StaffPass123!",
    dashboardPath: /\/dashboard\/internal-staff/,
  },
};

// Sign a seeded staff user into the dashboard. Resolves once the post-login
// redirect lands on the role's expected dashboard path.
export async function loginAs(page: Page, role: RoleAccount) {
  const { email, password, dashboardPath } = accounts[role];
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(dashboardPath, { timeout: 15_000 });
}

// Switch tabs on the dashboard tab bar by visible label. Falls back to the
// pushed query string so the test still works if the bar swaps to client-side
// navigation.
export async function openDashboardTab(page: Page, label: string) {
  const link = page.getByRole("link", { name: label, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForLoadState("networkidle");
}

// Generic, defensive form-filler used by the public Apply spec. Fills every
// `required` input/select/textarea that has not already been touched, so the
// test stays robust against questionnaire template changes that add fields.
export async function fillRequiredFormFields(
  page: Page,
  overrides: Record<string, string>,
) {
  const form = page.locator("form").first();

  for (const [name, value] of Object.entries(overrides)) {
    const field = form.locator(`[name="${name}"]`);
    if ((await field.count()) === 0) continue;
    const tag = await field.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      await field.selectOption(value);
    } else {
      await field.fill(value);
    }
  }

  const requiredFields = await form.locator("[required]").all();
  for (const field of requiredFields) {
    const name = await field.getAttribute("name");
    if (!name || name in overrides) continue;
    const tag = await field.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      const optionValues = await field.locator("option:not([disabled])").evaluateAll(
        (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
      if (optionValues.length > 0) {
        await field.selectOption(optionValues[0]);
      }
    } else {
      const placeholder = (await field.getAttribute("placeholder")) ?? "";
      const sensible = placeholder.toLowerCase().includes("email")
        ? `qa-${Date.now()}@example.test`
        : `QA ${name}`;
      await field.fill(sensible);
    }
  }
}
