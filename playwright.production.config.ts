import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-production",
  outputDir: "./.vercel/test-results-production",
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  reporter: "list",
  use: { baseURL: process.env.SELLOW_PRODUCTION_URL ?? "https://sellow.fun", trace: "retain-on-failure" },
  projects: [{name:"chromium",use:{...devices["Desktop Chrome"]}}],
});
