import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PW_PORT ?? process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);
const browserChannel = process.env.PW_BROWSER_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  // Ignore macOS AppleDouble sidecars (the exFAT dev drive creates `._*` files
  // that otherwise get picked up by the `*.spec.ts` glob and fail to parse).
  testIgnore: ["**/._*"],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(browserChannel ? { channel: browserChannel } : {}) }
    }
  ],
  // In CI the workflow builds first, so we serve the production build; locally we
  // reuse a running dev server (or start one) to avoid a slow rebuild per run.
  webServer: {
    command: isCI ? `npm run start` : `npm run dev`,
    url: baseURL,
    env: { PORT: String(PORT) },
    timeout: 120_000,
    reuseExistingServer: !isCI
  }
});
