import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

const password = process.env.SEED_PASSWORD;
if (process.env.BERN_ACCEPTANCE_TEST !== "true" || !password)
  throw new Error(
    "Use npm run test:acceptance with its isolated local database.",
  );

async function login(page: Page, role: string) {
  await page.goto("/tenants");
  await page.getByLabel("Email address").fill(`${role}@bern.demo`);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("instructor sees Maria's four sources and role-specific tenant pages", async ({
  page,
}) => {
  await mkdir(".local/acceptance-evidence", { recursive: true });
  for (const role of ["admin", "finance", "viewer"]) {
    await login(page, role);
    await page.getByLabel("Search tenants").fill("Maria");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open tenant" })).toHaveCount(
      1,
    );
    if (role === "viewer")
      await expect(page.getByText("Masked", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Open tenant" }).click();
    const tenantDetail = page.locator("section.detail-section");
    await expect(
      page.getByRole("heading", { name: "Maria Santos", exact: true }),
    ).toBeVisible();
    await expect(
      tenantDetail.getByRole("cell", { name: "12-A", exact: true }),
    ).toBeVisible();
    const amounts = page.getByRole("columnheader", {
      name: /amount due/i,
      exact: true,
    });
    if (role === "viewer") await expect(amounts).toHaveCount(0);
    else await expect(amounts).toBeVisible();
    if (role === "admin") {
      await expect(
        page.getByRole("cell", { name: /fictional visitor 1/i, exact: true }),
      ).toBeVisible();
      const lineage = page.getByRole("table").filter({
        has: page.getByRole("columnheader", {
          name: "Source record",
          exact: true,
        }),
      });
      for (const source of ["tenancy", "billing", "maintenance", "visitor_log"])
        await expect(
          lineage
            .locator("td")
            .filter({ hasText: new RegExp(`^${source}`) })
            .first(),
        ).toBeVisible();
    } else {
      await expect(
        page.getByRole("cell", { name: /fictional visitor 1/i, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Visitor entries are restricted", { exact: false }),
      ).toBeVisible();
    }
    await page
      .getByRole("heading", { name: "Tenant details", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.local/acceptance-evidence/maria-${role}.png`,
    });
    await page.getByRole("button", { name: "Sign out" }).click();
  }
});

test("policy editor and filtered audit details are usable and accessible", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/governance");
  await page.getByRole("tab", { name: "Policies & roles" }).click();
  await page.getByRole("button", { name: "Edit policy text" }).first().click();
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  const original = await description.inputValue();
  const changed = `${original} Fictional policy review completed for instructor acceptance.`;
  await description.fill(changed);
  await page
    .getByLabel("Reason", { exact: true })
    .fill(
      "Reviewed the fictional condominium policy for the instructor demonstration.",
    );
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Policy updated");
  await expect(page.getByText(changed, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Audit history" }).click();
  await page.getByLabel("Action", { exact: true }).fill("POLICY_UPDATED");
  await page.getByLabel("Entity", { exact: true }).fill("Policy");
  await page
    .getByRole("button", { name: "Filter history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect event", exact: true })
    .first()
    .click();
  const detail = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Audit event", exact: true }),
  });
  await expect(detail.getByText(original, { exact: true })).toBeVisible();
  await expect(detail.getByText(changed, { exact: true })).toBeVisible();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.local/acceptance-evidence/audit-detail-${width}.png`,
    });
  }
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => `${v.id}: ${v.description}`),
  ).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Close event", exact: true }).click();
  await page.getByLabel("Action", { exact: true }).fill("SOURCE_CORRECTED");
  await page.getByLabel("Entity", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Filter history", exact: true })
    .click();
  await expect(
    page.getByText("6 records · Page 1 of 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect event", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Before", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "After", exact: true }),
  ).toBeVisible();
});
