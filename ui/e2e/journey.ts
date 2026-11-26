// Aides communes aux parcours. Une note s'ouvre après sa lecture par Rust (asynchrone, dans le
// faux aussi) : cliquer ou taper dans l'éditeur avant qu'elle soit montrée visait la note d'avant.
// Toujours attendre la note voulue ; `VITE_READ_DELAY=100 npx playwright test` le vérifie.
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Attend que l'éditeur montre la note dont la première ligne affichée (sans le `#` du titre) est
 * `firstLine`. `scope` : la page (l'éditeur de la première colonne) ou une colonne.
 */
export async function waitForNote(scope: Page | Locator, firstLine: string | RegExp) {
  await expect(scope.locator(".cm-line").first()).toHaveText(firstLine);
}

/** Le bouton des panneaux latéraux, dans la barre de la fenêtre (tout en haut, toujours visible). */
export const sidePanelsButton = (page: Page) =>
  page.getByRole("button", { name: "Panneaux latéraux", exact: true });

/** Attend qu'une note vide (nouvelle note) soit montrée : une seule ligne, où paraît l'invite. */
export async function waitForEmptyNote(scope: Page | Locator) {
  await expect(scope.locator(".cm-line")).toHaveCount(1);
  await expect(scope.locator(".cm-line .cm-placeholder")).toBeVisible();
}

/**
 * Clique la note de ce titre dans la liste et attend qu'elle soit montrée, dans la première
 * colonne ou dans `options.in`. `options.firstLine` : sa première ligne, si ce n'est pas son titre.
 */
export async function openNote(
  page: Page,
  title: string,
  options: { firstLine?: string | RegExp; in?: Locator } = {},
) {
  await page.locator(".note-item", { hasText: title }).click();
  await waitForNote(options.in ?? page, options.firstLine ?? title);
}

type Notes = Record<string, { content: string; modified: number }>;

/**
 * Attend que la note ouverte au lancement soit montrée : la plus récente du dossier racine,
 * reconnue à son titre. Rien à attendre si le dossier racine n'a pas de note titrée.
 */
export async function waitForLaunchedNote(page: Page, notes: Notes) {
  const [latest] = Object.entries(notes)
    .filter(([path]) => !path.includes("/"))
    .map(([, note]) => note)
    .sort((a, b) => b.modified - a.modified);
  const title = /^# (.+)$/m.exec(latest?.content ?? "")?.[1];
  if (title !== undefined) await waitForNote(page, title);
}

/** Bords gauche et droit d'un élément à l'écran, arrondis au pixel. */
export async function edgesOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément absent de l'écran");
  return { left: Math.round(box.x), right: Math.round(box.x + box.width) };
}

/** Largeur d'un élément à l'écran, en pixels. */
export async function widthOf(locator: Locator) {
  const { left, right } = await edgesOf(locator);
  return right - left;
}

/** Tire à la souris le bord d'un panneau de `dx` pixels (vers la droite si positif). */
export async function dragEdge(page: Page, handle: Locator, dx: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("bord absent de l'écran");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.mouse.up();
}
