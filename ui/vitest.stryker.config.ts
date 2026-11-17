import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { waitForTestFrame } from "./test-support/test-frame";

// Pour le test de mutation (Stryker) seulement : un seul groupe qui joue tous les tests,
// logique et écran, dans WebKit. Stryker ne voit pas les résultats d'un second groupe.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Plusieurs passes tournent en parallèle : chacune prend un port libre.
    api: { strictPort: false },
    setupFiles: ["test-support/test-frame-setup.ts"],
    browser: {
      commands: { waitForTestFrame },
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "webkit" }],
    },
  },
});
