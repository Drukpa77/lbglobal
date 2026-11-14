import { expect, test } from "@playwright/test";

test.describe("public smoke", () => {
  test("homepage renders with primary CTA and latest articles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Apply Now" }).first()).toBeVisible();
    await expect(page.locator("#updates a[href^='/newsletter/']").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("newsletter lists articles and opens one", async ({ page }) => {
    await page.goto("/newsletter");
    const firstArticle = page.locator("a[href^='/newsletter/']").first();
    await expect(firstArticle).toBeVisible();
    await firstArticle.click();
    await expect(page).toHaveURL(/\/newsletter\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("unknown newsletter article returns 404", async ({ page }) => {
    const response = await page.goto("/newsletter/does-not-exist");
    expect(response?.status()).toBe(404);
  });

  test("apply page renders the inquiry form", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.locator("select[name='visaServiceType']")).toBeVisible();
    await expect(page.locator("input[name='fullName']")).toBeVisible();
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("select[name='hearFrom']")).toBeVisible();
    await expect(page.getByRole("button", { name: /Submit inquiry/i })).toBeVisible();
  });

  test("student visa option reveals course fields", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.locator("input[name='targetCourse']")).toHaveCount(0);
    await page.locator("select[name='visaServiceType']").selectOption("STUDENT_VISA");
    await expect(page.locator("input[name='targetCourse']")).toBeVisible();
    await expect(page.locator("select[name='currentEducationLevel']")).toBeVisible();
  });

  test("submitting an enquiry shows the confirmation", async ({ page }) => {
    // Sends a real email when SMTP credentials are configured, so only run it
    // in CI (no credentials there: the email is logged instead of sent).
    test.skip(!process.env.CI, "Runs in CI only, to avoid emailing the real inbox");

    await page.goto("/apply");
    await page.locator("select[name='visaServiceType']").selectOption("VISITOR_VISA");
    await page.locator("input[name='fullName']").fill("Smoke Test");
    await page.locator("input[name='email']").fill("smoke-test@example.com");
    await page.locator("input[name='phone']").fill("+61 400 000 000");
    await page.locator("input[name='city']").fill("Perth");
    await page.locator("select[name='country']").selectOption("Australia");
    await page.locator("select[name='hearFrom']").selectOption("Google Search");
    await page.getByRole("button", { name: /Submit inquiry/i }).click();

    await expect(page).toHaveURL(/\/apply\?success=1/);
    await expect(page.getByText(/Your inquiry has been submitted/)).toBeVisible();
  });

  test("old staff routes are gone", async ({ page }) => {
    for (const path of ["/login", "/dashboard"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });
});
