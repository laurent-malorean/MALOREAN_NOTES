import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Port fixe : Tauri charge la page depuis cette adresse en développement.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "safari16", outDir: "dist" },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "logique",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "écran",
          include: ["src/**/*.browser.test.ts"],
          // WebKit : le même moteur que la fenêtre de l'application sur Mac.
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "webkit" }],
          },
        },
      },
    ],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/bridge/generated/**", "src/main.ts"],
      // main.ts (assemblage) est couvert par les parcours complets (e2e/).
      thresholds: { lines: 90, statements: 90, branches: 80, functions: 80 },
    },
  },
});
