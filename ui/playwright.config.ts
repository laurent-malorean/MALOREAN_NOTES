import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;

// Parcours utilisateur complets, dans WebKit (le moteur de la fenêtre sur Mac).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/e2e/app.html`,
    reuseExistingServer: false,
  },
});
