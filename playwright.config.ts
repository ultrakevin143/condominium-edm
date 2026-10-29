import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "frontend/tests",
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3450",
    viewport: { width: 1280, height: 800 },
    headless: true,
    trace: "off",
    screenshot: "off",
  },
  outputDir: ".local/browser-test-output",
});
