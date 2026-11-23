// Parcours de la recherche par le sens : télécharger le modèle depuis la recherche, chercher par le
// sens, ouvrir une note proche, choisir l'autre modèle dans les réglages. Rust est remplacé par le faux
// (e2e/fake-meaning.ts) : le téléchargement et le calcul se terminent quand le parcours le décide.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote, waitForNote } from "./journey";

const NOTES = {
  "tarte.md": {
    content: "# Tarte aux pommes\n\nPommes, sucre et beurre dans une pâte brisée.",
    modified: 3,
  },
  "gateau.md": {
    content: "# Gâteau au yaourt\n\nUn gâteau facile : yaourt, sucre, farine.",
    modified: 2,
  },
  "courses.md": { content: "# Courses\n\nacheter du pain et du lait", modified: 1 },
};

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1", ...extra });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const mode = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const resultTitles = (page: Page) => page.locator(".search-result .note-title");

test("télécharger le modèle depuis la recherche, chercher par le sens, ouvrir une note proche, choisir l'autre modèle", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("dessert");
  await expect(page.getByText("Aucune note trouvée")).toBeVisible();

  // Le modèle n'est pas téléchargé : « Par le sens » est grisé, la zone dit pourquoi et quoi faire.
  await expect(mode(page, "Par le sens")).toBeDisabled();
  await expect(page.locator(".search-mode-note")).toContainText(
    "Le modèle « E5 petit » n'est pas téléchargé",
  );
  await page.getByRole("button", { name: "Télécharger le modèle (449 Mo)" }).click();
  await expect(page.locator(".search-mode .download-text")).toHaveText("224 Mo sur 449 Mo (50 %)");
  await expect(page.locator(".search-mode progress")).toHaveJSProperty("value", 50);

  // Le téléchargement fini, le mode s'active ; le calcul commence, la recherche le dit.
  await page.evaluate(() => window.backend.meaning.finishDownload());
  await expect(mode(page, "Par le sens")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".search-mode-note")).toHaveText("Calcul du sens : 1 / 3 segments");
  await expect(page.locator(".search-notice")).toContainText("pas encore calculé");

  // Le calcul fini, la recherche est refaite : les notes de même sens apparaissent.
  await page.evaluate(() => window.backend.meaning.finishComputing());
  await expect(page.locator(".search-notice")).toHaveCount(0);
  await expect(resultTitles(page)).toHaveText(["Tarte aux pommes", "Gâteau au yaourt"]);
  await expect(page.locator(".search-excerpt").first()).toContainText("beurre dans une pâte");
  await page.locator(".search-result", { hasText: "Gâteau au yaourt" }).click();
  await waitForNote(page, "Gâteau au yaourt");

  // Les notes proches de la note ouverte, un clic ouvre la note.
  const related = page.getByRole("navigation", { name: "Notes proches" });
  await expect(related).toBeHidden();
  await choose(page, "toggle-related-notes");
  await expect(related).toContainText("Tarte aux pommes");
  await expect(related).not.toContainText("Gâteau au yaourt");
  await related.getByRole("button", { name: /Tarte aux pommes/ }).click();
  await waitForNote(page, "Tarte aux pommes");
  await expect(related).toContainText("Gâteau au yaourt");

  // L'autre modèle, choisi dans les réglages : il n'est pas téléchargé, la recherche le dit.
  await page.getByRole("button", { name: "Réglages" }).click();
  const settings = page.getByRole("dialog", { name: "Réglages" });
  await settings.getByRole("tab", { name: "Index" }).click();
  await expect(settings.locator(".meaning-model", { hasText: "E5 petit" })).toContainText(
    "utilisé",
  );
  await settings.getByRole("radio", { name: "E5 grand" }).check();
  await expect(settings.locator(".meaning-model", { hasText: "E5 grand" })).toContainText(
    "utilisé",
  );
  await expect(settings.locator(".meaning-model", { hasText: "E5 grand" })).toContainText(
    "non téléchargé",
  );
  await settings.getByRole("button", { name: "Fermer" }).click();
  await expect(page.locator(".search-mode-note")).toContainText("Le modèle « E5 grand »");
  await expect(
    page.getByRole("button", { name: "Télécharger le modèle (2 136 Mo)" }),
  ).toBeVisible();
  await expect(mode(page, "Par le sens")).toBeDisabled();
});

test("annuler le téléchargement remet l'offre, et le dit", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "Télécharger le modèle (449 Mo)" }).click();
  await page.getByRole("button", { name: "Annuler le téléchargement" }).click();
  await expect(page.locator(".toast-error")).toHaveText("Téléchargement annulé.");
  await expect(page.getByRole("button", { name: "Télécharger le modèle (449 Mo)" })).toBeVisible();
  await expect(mode(page, "Par le sens")).toBeDisabled();
});

test("« Rechercher par le sens » du menu choisit ce mode et place le curseur dans la recherche", async ({
  page,
}) => {
  await launch(page, { meaning: "ready" });
  await expect(mode(page, "Par le sens")).toBeEnabled();
  await choose(page, "search-by-meaning");
  await expect(mode(page, "Par le sens")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "Rechercher" })).toBeFocused();
  await page.keyboard.type("dessert");
  await expect(resultTitles(page)).toHaveText(["Tarte aux pommes", "Gâteau au yaourt"]);
  await mode(page, "Par les mots").click();
  await expect(page.getByText("Aucune note trouvée")).toBeVisible();
});

test("les réglages montrent l'index de sens, le reconstruisent, et suppriment un modèle après confirmation", async ({
  page,
}) => {
  await launch(page, { meaning: "ready" });
  await page.getByRole("button", { name: "Réglages" }).click();
  const settings = page.getByRole("dialog", { name: "Réglages" });
  await settings.getByRole("tab", { name: "Index" }).click();
  const section = settings.locator(".meaning-settings");
  await expect(section).toContainText("Notes : 3");
  await expect(section).toContainText("Segments calculés : 3 sur 3");
  await section.getByRole("button", { name: "Reconstruire l'index de sens" }).click();
  await expect(section).toContainText("Segments calculés : 0 sur 3");
  await expect(section).toContainText("Calcul du sens : 0 / 3 segments");
  expect(await page.evaluate(() => window.backend.meaning.rebuilds)).toBe(1);

  await section.getByRole("button", { name: "Supprimer « E5 petit »" }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmation" });
  await expect(confirmation).toContainText("Supprimer le modèle « E5 petit » du Mac ?");
  await confirmation.getByRole("button", { name: "Annuler" }).click();
  await expect(section.locator(".meaning-model", { hasText: "E5 petit" })).toContainText(
    "téléchargé",
  );
  await section.getByRole("button", { name: "Supprimer « E5 petit »" }).click();
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(section.locator(".meaning-model", { hasText: "E5 petit" })).toContainText(
    "non téléchargé",
  );
  await expect(section.getByRole("button", { name: "Télécharger « E5 petit »" })).toBeVisible();
});

test("les notes proches disent que le sens n'est pas encore calculé", async ({ page }) => {
  await launch(page);
  await choose(page, "toggle-related-notes");
  await expect(page.getByRole("navigation", { name: "Notes proches" })).toContainText(
    "Aucune note proche (le sens n'est pas encore calculé)",
  );
  await choose(page, "toggle-related-notes");
  await expect(page.getByRole("navigation", { name: "Notes proches" })).toBeHidden();
});
