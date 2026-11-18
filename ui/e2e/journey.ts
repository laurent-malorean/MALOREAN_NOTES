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
