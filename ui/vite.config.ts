import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { waitForTestFrame } from "./test-support/test-frame";

// L'essai de l'application réelle (fiche 0054) : `MALOREAN_ESSAI_BUILD=1` construit l'interface avec le
// code d'essai ; sans elle, `__ESSAI__` est faux et le code d'essai n'entre pas dans l'application.
const essai =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .MALOREAN_ESSAI_BUILD === "1";

// Port fixe : Tauri charge l'interface depuis cette adresse en développement.
export default defineConfig({
  clearScreen: false,
  define: { __ESSAI__: JSON.stringify(essai) },
  // fs.allow : Vitest écrit les captures d'écran d'un test en échec dans build/vitest, hors de ui/.
  server: { port: 5173, strictPort: true, fs: { allow: [".", "../build/vitest"] } },
  // Tout ce que les outils fabriquent va dans build/ à la racine du dépôt, jamais à côté du code (fiche 0055).
  build: { target: "safari16", outDir: "../build/ui-dist", emptyOutDir: true },
  test: {
    attachmentsDir: "../build/vitest/attachments",
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
      reportsDirectory: "../build/coverage",
      include: ["src/**/*.ts"],
      // L'essai de l'application réelle (index.ts, scenarios/) ne se joue que dans la vraie fenêtre :
      // sa logique (runner, png, conduct, wait) est testée, ses scénarios sont le test.
      exclude: [
        ...["src/**/*.test.ts", "src/bridge/generated/**", "src/main.ts"],
        ...["src/essai/index.ts", "src/essai/scenarios/**"],
      ],
      // main.ts (assemblage) est couvert par les parcours complets (e2e/).
      // Seuils qui ne baissent jamais : on les relève quand la couverture monte.
      thresholds: { lines: 98, statements: 98, branches: 94, functions: 98 },
    },
  },
});
