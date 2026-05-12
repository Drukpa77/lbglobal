import { expect, test } from "@playwright/test";

import { fillRequiredFormFields, loginAs } from "./_helpers";

// End-to-end coverage for the new-application alerting we added: a public
// /apply submission must (a) appear in the bell dropdown for a logged-in
// SUB_ADMIN within a single page reload, and (b) appear in the
// "New Inquiries (Unclaimed)" card on the Overview tab. Claiming the
// submission then makes the card entry vanish.

test.describe("apply -> bell + new inquiries card", () => {
  test("a fresh /apply submission surfaces to sub-admin notifications and dashboard", async ({
    browser,
  }) => {
    const stamp = Date.now();
    const applicantName = `QA Applicant ${stamp}`;
    const applicantEmail = `qa-applicant-${stamp}@example.test`;

    // 1) Submit /apply anonymously in its own context.
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/apply");

    await fillRequiredFormFields(publicPage, {
      fullName: applicantName,
      email: applicantEmail,
      hearFrom: "Google Search",
    });

    await publicPage.getByRole("button", { name: /Submit inquiry/i }).click();
    await expect(publicPage).toHaveURL(/\/apply\?success=1/);
    await publicContext.close();

    // 2) Login as sub-admin in a separate context and look for the alert.
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await loginAs(staffPage, "subAdmin");

    // Force an immediate fetch of /api/notifications/workflow rather than
    // waiting for the 10s/20s poll.
    await staffPage.reload();
    await staffPage.waitForLoadState("networkidle");

    // 2a) Bell dropdown should list the new applicant by name.
    const bell = staffPage.getByRole("button", { name: "Open workflow notifications" });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(staffPage.getByText("Notifications", { exact: true })).toBeVisible();
    // Bell dropdown and overview both mention the applicant; scope to the panel
    // adjacent to the bell (button + dropdown div) to satisfy strict mode.
    const bellDropdown = bell.locator("+ div");
    await expect(bellDropdown.getByText(applicantName, { exact: true })).toBeVisible();

    // Toggle the bell shut so its absolute-positioned dropdown can't intercept
    // pointer events on the New Inquiries card below. The component has no
    // Escape or outside-click handler, so clicking the bell again is the only
    // way to close it.
    await bell.click();
    await expect(staffPage.getByText("Notifications", { exact: true })).toBeHidden();

    // 2b) New Inquiries (Unclaimed) card on Overview should also show them.
    const newInquiriesCard = staffPage
      .locator("section", { has: staffPage.getByRole("heading", { name: "New Inquiries (Unclaimed)" }) });
    await expect(newInquiriesCard).toBeVisible();
    await expect(newInquiriesCard.getByText(applicantName)).toBeVisible();

    // 3) Claim the submission and confirm it disappears from the card.
    await newInquiriesCard
      .locator("li", { hasText: applicantName })
      .getByRole("button", { name: "Claim" })
      .click();
    await staffPage.waitForLoadState("networkidle");

    await expect(newInquiriesCard.getByText(applicantName)).toHaveCount(0);

    await staffContext.close();
  });
});

// Lightweight contract test for the workflow notifications API: the endpoint
// must always return a stable shape, even when the user has zero unread items.
test.describe("workflow notifications API", () => {
  test("returns the expected shape for a logged-in sub-admin", async ({ page }) => {
    await loginAs(page, "subAdmin");
    const response = await page.request.get("/api/notifications/workflow");
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload).toHaveProperty("actionRequiredCount");
    expect(typeof payload.actionRequiredCount).toBe("number");
    expect(Array.isArray(payload.groups)).toBe(true);
  });
});
