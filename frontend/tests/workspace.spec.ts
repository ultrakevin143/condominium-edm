import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const password = process.env.SEED_PASSWORD;
if (process.env.BERN_BROWSER_TEST !== "true" || !password)
  throw new Error("Use the isolated local browser-test runner.");
async function login(page: Page, email: string) {
  await page.goto("/pipeline");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
test("pipeline, issue correction, all screens and responsive accessibility", async ({
  page,
}) => {
  await mkdir(".local/browser-evidence", { recursive: true });
  await login(page, "admin@bern.demo");
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Run finished", {
    timeout: 60000,
  });
  await page.getByRole("link", { name: "Issue queue", exact: true }).click();
  await page.getByLabel("Rule", { exact: true }).selectOption("tenant_contact");
  await page.getByLabel("Status", { exact: true }).selectOption("OPEN");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("button", { name: "Review issue" }).first().click();
  await page.getByLabel("Field to correct").selectOption("phone");
  await page.getByLabel("Corrected value").fill("FICTIONAL-VERIFIED-CONTACT");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Verified the fictional missing contact in this local test.");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByRole("status")).toContainText("Correction verified", {
    timeout: 60000,
  });
  for (const [route, heading] of [
    ["pipeline", "Pipeline"],
    ["tenants", "Tenants & units"],
    ["quality", "Data quality"],
    ["issues", "Issue queue"],
    ["governance", "Governance"],
  ]) {
    await page.goto(`/${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    for (const width of [1280, 768, 360]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/browser-evidence/${route}-${width}.png`,
        fullPage: true,
      });
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.description}`)).toEqual(
      [],
    );
  }
});
test("Viewer and Finance see different data on the same tenant", async ({
  page,
}) => {
  await login(page, "viewer@bern.demo");
  await page.goto("/tenants");
  await page.getByLabel("Search tenants").fill("Maria");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Open tenant" }).first().click();
  await expect(page.getByText("Masked", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Financial amounts are available", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Visitor entries are restricted", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "finance@bern.demo");
  await page.goto("/tenants");
  await page.getByLabel("Search tenants").fill("Maria");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Open tenant" }).first().click();
  await expect(
    page.getByRole("columnheader", { name: /amount due/i, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Visitor entries are restricted", { exact: false }),
  ).toBeVisible();
});
test("role changes update financial visibility after another sign-in", async ({
  page,
  browser,
}) => {
  await login(page, "admin@bern.demo");
  await page.goto("/governance");
  await page.getByRole("tab", { name: "Account roles" }).click();
  const row = page.getByRole("row").filter({ hasText: "viewer@bern.demo" });
  await row.getByRole("button", { name: "Change role" }).click();
  await page
    .getByLabel("Role", { exact: true })
    .selectOption({ label: "Finance" });
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Demonstrate changed financial visibility for this test.");
  await page.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Role changed");
  const context = await browser.newContext(),
    other = await context.newPage();
  await login(other, "viewer@bern.demo");
  await other.goto("/tenants");
  await other.getByLabel("Search tenants").fill("Maria");
  await other.getByRole("button", { name: "Search", exact: true }).click();
  await other.getByRole("button", { name: "Open tenant" }).first().click();
  await expect(
    other.getByRole("columnheader", { name: /amount due/i, exact: true }),
  ).toBeVisible();
  await context.close();
  await row.getByRole("button", { name: "Change role" }).click();
  await page
    .getByLabel("Role", { exact: true })
    .selectOption({ label: "Viewer" });
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Restore the viewer role after local browser verification.");
  await page.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Role changed");
});

test("steward and front desk sign in to their permitted workspaces and data", async ({
  page,
}) => {
  for (const role of ["steward", "frontdesk"]) {
    await login(page, `${role}@bern.demo`);
    await page.goto("/tenants");
    await page.getByLabel("Search tenants").fill("Maria");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Open tenant" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Maria Santos", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /amount due/i, exact: true }),
    ).toHaveCount(0);
    if (role === "steward") {
      await expect(
        page.getByRole("link", { name: "Issue queue", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Visitor entries are restricted", { exact: false }),
      ).toBeVisible();
      await page.goto("/pipeline");
      await expect(
        page.getByRole("button", { name: "Run pipeline", exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("cell", { name: /fictional visitor 1/i, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Issue queue", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Pipeline", exact: true }),
      ).toHaveCount(0);
      await page.goto("/pipeline");
      await expect(
        page.getByRole("heading", { name: "Tenants & units", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Run pipeline", exact: true }),
      ).toHaveCount(0);
    }
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Account security", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const denied = await page.request.get("/api/warehouse/tenants");
    expect(denied.status()).toBe(401);
  }
});

test("main screens show loading, recoverable errors and empty results", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({
      path: `.local/browser-evidence/login-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  const loginAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(loginAccessibility.violations.map((v) => v.id)).toEqual([]);
  await login(page, "admin@bern.demo");
  const emptyPage = { items: [], total: 0, page: 1, limit: 25 };
  const screens = [
    {
      route: "pipeline",
      path: "/api/pipeline/runs",
      data: emptyPage,
      empty: "No pipeline runs yet",
    },
    {
      route: "tenants",
      path: "/api/warehouse/tenants",
      data: emptyPage,
      empty: "No tenants match",
    },
    {
      route: "quality",
      path: "/api/quality/history",
      data: [],
      empty: "No quality results yet",
    },
    {
      route: "issues",
      path: "/api/issues",
      data: emptyPage,
      empty: "No issues match",
    },
    {
      route: "governance",
      path: "/api/governance/catalog",
      data: [],
      empty: "No catalog entries yet",
    },
  ];
  for (const screen of screens) {
    let release: (() => void) | undefined;
    const heldResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fail = true;
    const matcher = (url: URL) => url.pathname === screen.path;
    await page.route(matcher, async (route) => {
      if (fail) {
        await heldResponse;
        await route.fulfill({
          status: 503,
          json: {
            error: { message: "Local test: service temporarily unavailable." },
          },
        });
      } else {
        await route.fulfill({ json: { data: screen.data } });
      }
    });
    await page.goto(`/${screen.route}`);
    await expect(page.locator('[aria-label="Loading table"]')).toBeVisible();
    release?.();
    await expect(page.locator('main [role="alert"]')).toContainText(
      "service temporarily unavailable",
    );
    fail = false;
    await page
      .getByRole("button", { name: "Retry loading", exact: true })
      .click();
    await expect(page.getByText(screen.empty, { exact: false })).toBeVisible();
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
    await page.unroute(matcher);
  }
});
