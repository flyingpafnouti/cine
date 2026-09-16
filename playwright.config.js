import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox"],
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "python3 -m http.server 8000",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: true,
  },
  reporter: "list",
});
