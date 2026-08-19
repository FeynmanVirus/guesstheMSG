import { defineConfig } from "@playwright/test";

// E2E tests hit the live Supabase project (no local stack), same as the
// dev server does — see tests/e2e/README or the spec files themselves for
// what that implies about cleanup. Single worker: the multiplayer test
// creates real rooms and isn't written to be safe running in parallel with
// itself.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
