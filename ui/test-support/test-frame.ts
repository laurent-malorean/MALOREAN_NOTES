import type {} from "@vitest/browser-playwright";
import type { Frame } from "playwright";
import type { BrowserCommand } from "vitest/node";

// Vitest joue chaque fichier de test d'écran dans son propre cadre (iframe), toujours nommé
// « vitest-iframe ». Avant une frappe ou un clic, Vitest cherche ce cadre par son nom : au
// démarrage d'un fichier, Playwright peut encore connaître le cadre du fichier précédent,
// en train d'être retiré. La frappe part alors dans ce cadre (« Frame was detached ») ou
// le cadre n'est pas trouvé. Cette commande attend que la recherche par nom donne le cadre
// du fichier en cours ; la suite du fichier utilise ce cadre, qui ne change plus.
const FRAME_NAME = "vitest-iframe";
const DELAY_MS = 10_000;
const STEP_MS = 10;

export const waitForTestFrame: BrowserCommand<[]> = async ({ page, testPath }) => {
  const deadline = Date.now() + DELAY_MS;
  while (!isTestFrame(page.frame(FRAME_NAME), testPath)) {
    if (Date.now() > deadline) {
      throw new Error(`Le cadre du fichier de test ${testPath} n'est pas prêt.`);
    }
    await new Promise((resolve) => setTimeout(resolve, STEP_MS));
  }
};

function isTestFrame(frame: Frame | null, testPath: string | undefined) {
  if (!frame || frame.isDetached()) return false;
  return new URL(frame.url()).searchParams.get("iframeId") === testPath;
}
