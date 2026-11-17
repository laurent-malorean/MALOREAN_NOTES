import { beforeAll } from "vitest";
import { commands } from "vitest/browser";

// Avant chaque fichier de test d'écran : attendre que les frappes et les clics visent
// son propre cadre (voir test-frame.ts).
declare module "vitest/browser" {
  interface BrowserCommands {
    waitForTestFrame: () => Promise<void>;
  }
}

beforeAll(() => commands.waitForTestFrame());
