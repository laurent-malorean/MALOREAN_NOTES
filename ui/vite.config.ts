import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { waitForTestFrame } from "./test-support/test-frame";

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
          setupFiles: ["test-support/test-frame-setup.ts"],
          // WebKit : le même moteur que la fenêtre de l'application sur Mac.
          browser: {
            commands: { waitForTestFrame },
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
      // Seuils qui ne baissent jamais : on les relève quand la couverture monte.
      thresholds: { lines: 98, statements: 98, branches: 94, functions: 98 },
    },
  },
});
