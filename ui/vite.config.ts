import { defineConfig } from "vitest/config";

// Port fixe : Tauri charge la page depuis cette adresse en développement.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "safari16", outDir: "dist" },
  test: { include: ["src/**/*.test.ts"] },
});
