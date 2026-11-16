import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Pour le test de mutation (Stryker) seulement : un seul groupe qui joue tous les tests,
// logique et écran, dans WebKit. Stryker ne voit pas les résultats d'un second groupe.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Plusieurs passes tournent en parallèle : chacune prend un port libre.
    api: { strictPort: false },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "webkit" }],
    },
  },
});
