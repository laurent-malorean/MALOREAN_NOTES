// Parcours de la recherche par le sens : la colonne « idées » de la fenêtre de recherche (modèle absent,
// calcul, résultats), ouvrir une note proche, choisir l'autre modèle dans les réglages. Rust est remplacé
// par le faux (e2e/fake-meaning.ts) : le téléchargement et le calcul se terminent quand le parcours le décide.
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
const field = (page: Page) => page.getByRole("searchbox", { name: "Rechercher" });
const ideas = (page: Page) => page.locator(".ideas-results");
const ideasTitles = (page: Page) => ideas(page).locator(".search-result .note-title");

test("la colonne « idées » dit que le modèle manque, renvoie aux réglages, puis donne les notes de même sens", async ({
  page,
}) => {
  await launch(page);
  await field(page).fill("dessert");
  await expect(page.locator(".match-results")).toHaveText("Aucune note trouvée");

  // Le modèle n'est pas téléchargé : la colonne le dit et renvoie aux Réglages > Index.
  await expect(ideas(page).locator(".search-notice")).toContainText(
    "Le modèle « E5 petit » n'est pas téléchargé",
  );
  await ideas(page).getByRole("button", { name: "Ouvrir Réglages > Index" }).click();
  const settings = page.getByRole("dialog", { name: "Réglages" });
  await expect(settings.getByRole("tab", { name: "Index" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await settings.getByRole("button", { name: "Télécharger « E5 petit »" }).click();
  await expect(settings.locator(".download-text").first()).toHaveText("224 Mo sur 449 Mo (50 %)");

  // Le téléchargement fini, le calcul commence : la colonne le dit.
  await page.evaluate(() => window.backend.meaning.finishDownload());
  await settings.getByRole("button", { name: "Fermer" }).click();
  await field(page).fill("dessert ");
  await expect(page.locator(".ideas-compute")).toHaveText("Calcul du sens : 1 / 3 segments");
  await expect(ideas(page).locator(".search-notice")).toContainText("pas encore calculé");

  // Le calcul fini, la recherche est refaite : les notes de même sens apparaissent.
  await page.evaluate(() => window.backend.meaning.finishComputing());
  await expect(ideas(page).locator(".search-notice")).toHaveCount(0);
  await expect(ideasTitles(page)).toHaveText(["Tarte aux pommes", "Gâteau au yaourt"]);
  await expect(ideas(page).locator(".search-excerpt").first()).toContainText(
    "beurre dans une pâte",
  );
  await ideas(page).locator(".search-result", { hasText: "Gâteau au yaourt" }).click();
  await waitForNote(page, "Gâteau au yaourt");
  await expect(page.locator(".search-window")).toBeHidden();
  await expect(field(page)).toHaveValue("");

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
  await field(page).fill("dessert");
  await expect(ideas(page).locator(".search-notice")).toContainText("Le modèle « E5 grand »");
});

test("avec le sens prêt, les deux colonnes répondent à la même recherche, chacune à sa façon", async ({
  page,
}) => {
  await launch(page, { meaning: "ready" });
  await field(page).fill("dessert");
  await expect(page.locator(".match-results")).toHaveText("Aucune note trouvée");
  await expect(ideasTitles(page)).toHaveText(["Tarte aux pommes", "Gâteau au yaourt"]);
  await field(page).fill("pain");
  await expect(page.locator(".match-results .search-result .note-title")).toHaveText(["Courses"]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".search-window")).toBeHidden();
});

test("« Rechercher dans toutes les notes » du menu place le curseur dans la recherche", async ({
  page,
}) => {
  await launch(page, { meaning: "ready" });
  await choose(page, "search-workspace");
  await expect(field(page)).toBeFocused();
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
