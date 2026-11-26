import { expect, type Page, test } from "@playwright/test";

// Les scénarios de l'essai de l'application réelle qui ne mesurent que la mise en page (bande du haut, hauteur
// de l'arborescence des dossiers), joués ici dans WebKit avec la fenêtre de l'essai (1100 × 720 points) : ce que les
// parcours à fenêtre large ne voyaient pas se voit avant l'essai réel (fiches 0054 et 0100).

const NOTES: Record<string, { content: string; modified: number }> = {};
for (let n = 0; n < 12; n += 1) {
  NOTES[`d${n}/note.md`] = { content: `---\ntags: [eti${n}]\n---\n# Note ${n}`, modified: n };
}

async function launch(page: Page) {
  await page.setViewportSize({ width: 1100, height: 720 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(Array.from({ length: 12 }, (_, n) => `d${n}`)),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".folder-item").first()).toBeVisible();
}

type Check = { name: string; ok: boolean; detail?: string };

/** Joue le scénario `name` du module `file` et rend ses vérifications. */
function play(page: Page, file: string, factory: string, name: string): Promise<Check[]> {
  return page.evaluate(
    async ([module, make, wanted]) => {
      const scenarios = (
        (await import(/* @vite-ignore */ module as string))[make as string] as () => {
          name: string;
          run(trial: unknown): Promise<void>;
        }[]
      )();
      const checks: Check[] = [];
      const trial = {
        check: (n: string, ok: boolean, detail?: string) => checks.push({ name: n, ok, detail }),
        measure: () => undefined,
        note: () => undefined,
      };
      for (const scenario of scenarios.filter((s) => s.name.startsWith(wanted as string))) {
        await scenario.run(trial);
      }
      return checks;
    },
    [file, factory, name],
  );
}

const failed = (checks: Check[]) =>
  checks.filter((c) => !c.ok).map((c) => `${c.name} : ${c.detail ?? ""}`);

test("essai, fenêtre de 1100 × 720 : la hauteur de l'arborescence des dossiers est retrouvée à la réouverture", async ({
  page,
}) => {
  await launch(page);
  const checks = await play(
    page,
    "/src/essai/scenarios/folders-height.ts",
    "foldersHeightScenarios",
    "Hauteur de l'arborescence",
  );
  expect(checks.length).toBeGreaterThan(8);
  expect(failed(checks)).toEqual([]);
});

test("essai, fenêtre de 1100 × 720 : le bouton des panneaux et la hauteur de la bande", async ({
  page,
}) => {
  await launch(page);
  const checks = await play(
    page,
    "/src/essai/scenarios/window-bar.ts",
    "windowBarScenarios",
    "Bande du haut",
  );
  expect(checks.length).toBeGreaterThan(10);
  expect(failed(checks)).toEqual([]);
});

test("essai, fenêtre de 1100 × 720 : la bande du haut, une ligne, deux lignes, colonne Claude Code ouverte", async ({
  page,
}) => {
  await launch(page);
  const checks = await play(
    page,
    "/src/essai/scenarios/display-tools.ts",
    "displayToolsScenarios",
    "Bande du haut",
  );
  expect(checks.length).toBeGreaterThan(20);
  expect(failed(checks)).toEqual([]);
});
