import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

const password = process.env.SEED_PASSWORD;
if (process.env.BERN_SECURITY_TEST !== "true" || !password)
  throw new Error("Use the isolated test:security runner.");
const answer = randomBytes(18).toString("base64url"),
  adminAnswer = randomBytes(18).toString("base64url"),
  changedPassword = randomBytes(24).toString("base64url");
async function login(page: Page, role: string, value = password!) {
  await page.goto("/account");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${role}@bern.demo`);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Account security", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
async function enroll(page: Page, value: string) {
  const form = page.getByRole("form", {
    name: "Security question",
    exact: true,
  });
  await form.getByLabel("Current password", { exact: true }).fill(password!);
  await form
    .getByLabel("Your question", { exact: true })
    .fill("What fictional color did I choose?");
  await form.getByLabel("New security answer", { exact: true }).fill(value);
  await form
    .getByRole("button", { name: "Save security question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
}
async function accessible(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((row) => `${row.id}: ${row.description}`),
  ).toEqual([]);
}

test("users change passwords; verified admin recovery and question reset work end to end", async ({
  page,
  browser,
}) => {
  await mkdir(".local/account-evidence", { recursive: true });
  await login(page, "viewer");
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await accessible(page);
    await page.screenshot({
      path: `.local/account-evidence/account-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await enroll(page, answer);
  await login(page, "viewer");
  const change = page.getByRole("form", {
    name: "Change password",
    exact: true,
  });
  await change.getByLabel("Current password", { exact: true }).fill(password!);
  await change.getByLabel("Security answer", { exact: true }).fill(answer);
  await change
    .getByLabel("New password", { exact: true })
    .fill(changedPassword);
  await change
    .getByLabel("Confirm new password", { exact: true })
    .fill(changedPassword);
  await change
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login(page, "viewer", changedPassword);

  const adminContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const admin = await adminContext.newPage();
  await login(admin, "admin");
  await enroll(admin, adminAnswer);
  await login(admin, "admin");
  await admin.goto("/governance");
  await admin.getByRole("tab", { name: "Account roles", exact: true }).click();
  const row = admin.getByRole("row").filter({ hasText: "viewer@bern.demo" });
  await row
    .getByRole("button", { name: "Manage recovery", exact: true })
    .click();
  const panel = admin.getByRole("region", {
    name: "Administrator recovery",
    exact: true,
  });
  for (const width of [1280, 360]) {
    await admin.setViewportSize({ width, height: 800 });
    await accessible(admin);
    await panel.screenshot({
      path: `.local/account-evidence/admin-recovery-${width}.png`,
    });
  }
  await admin.setViewportSize({ width: 1280, height: 800 });
  await panel
    .getByLabel("Your current password", { exact: true })
    .fill(password!);
  await panel
    .getByLabel("Your security answer", { exact: true })
    .fill(adminAnswer);
  await panel
    .getByLabel("Identity verification note", { exact: true })
    .fill(
      "Verified the fictional requester using the local classroom identity record.",
    );
  await panel
    .getByRole("button", { name: "Issue recovery code", exact: true })
    .click();
  const issued = panel.getByLabel("Recovery code (shown once)", {
    exact: true,
  });
  await expect(issued).toBeVisible();
  const code = await issued.inputValue();
  expect(Boolean(code && /^[A-Za-z0-9_-]{43}$/.test(code))).toBe(true);
  await panel
    .getByRole("button", { name: "Close recovery", exact: true })
    .click();
  await expect(
    admin.getByLabel("Recovery code (shown once)", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await accessible(page);
    await page.screenshot({
      path: `.local/account-evidence/forgot-password-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByLabel("Email address", { exact: true })
    .fill("viewer@bern.demo");
  await page
    .getByLabel("Administrator recovery code", { exact: true })
    .fill(code);
  await page
    .getByRole("button", { name: "Verify recovery code", exact: true })
    .click();
  await expect(
    page.getByText("Security question:", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Security answer", { exact: true }).fill(answer);
  await page.getByLabel("New password", { exact: true }).fill(password!);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(password!);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password recovered");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await login(page, "viewer");

  await row
    .getByRole("button", { name: "Manage recovery", exact: true })
    .click();
  await panel
    .getByLabel("Recovery action", { exact: true })
    .selectOption("clear");
  await panel
    .getByLabel("Your current password", { exact: true })
    .fill(password!);
  await panel
    .getByLabel("Your security answer", { exact: true })
    .fill(adminAnswer);
  await panel
    .getByLabel("Identity verification note", { exact: true })
    .fill(
      "Reverified the fictional requester before clearing the lost security answer.",
    );
  await panel
    .getByRole("button", { name: "Reset security question", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Security question cleared",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login(page, "viewer");
  await expect(
    page.getByText("No security question configured", { exact: false }),
  ).toBeVisible();
  await adminContext.close();
});
