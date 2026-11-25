// Parcours de l'écran des réglages en onglets : changer d'onglet à la souris et au clavier, retrouver
// le dernier onglet ouvert, lire l'état de l'index de mots et le reconstruire. Rust est remplacé par le faux.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

const NOTES = {
  "courses.md": { content: "# Courses\n\npain", modified: 30 },
  "Travail/budget.md": { content: "# Budget", modified: 20 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
  await page.getByRole("button", { name: "Réglages" }).click();
  return page.getByRole("dialog", { name: "Réglages" });
}

test("change d'onglet à la souris et au clavier, et rouvre le dernier onglet ouvert", async ({
  page,
}) => {
  const settings = await launch(page);
  const tab = (name: string) => settings.getByRole("tab", { name });
  await expect(settings.getByRole("tab")).toHaveText([
    "Affichage",
    "Écriture",
    "Claude",
    "Index",
    "Brancher une IA",
  ]);
  await expect(tab("Affichage")).toHaveAttribute("aria-selected", "true");
  await expect(settings.getByRole("combobox", { name: "Police" })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Dossier du journal" })).toBeHidden();

  // À la souris.
  await tab("Écriture").click();
  await expect(settings.getByRole("combobox", { name: "Dossier du journal" })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Police" })).toBeHidden();

  // Au clavier : flèches, Fin, Début ; le focus suit l'onglet.
  await page.keyboard.press("ArrowRight");
  await expect(tab("Claude")).toHaveAttribute("aria-selected", "true");
  await expect(tab("Claude")).toBeFocused();
  await expect(
    settings.getByRole("combobox", {
      name: "Après avoir lu une page web, Claude doit-il demander avant de modifier mes notes ?",
    }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(tab("Brancher une IA")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Affichage")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Brancher une IA")).toBeFocused();

  // Le dernier onglet ouvert se rouvre.
  await settings.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(tab("Brancher une IA")).toHaveAttribute("aria-selected", "true");
});

test("l'onglet Index dit l'état de l'index de mots et le reconstruit", async ({ page }) => {
  const settings = await launch(page);
  await settings.getByRole("tab", { name: "Index" }).click();
  const index = settings.locator(".index-settings");
  await expect(index).toContainText("2 notes indexées");
  await expect(index).toContainText("Dernière reconstruction : aucune depuis le lancement");
  await index.getByRole("button", { name: "Reconstruire l'index" }).click();
  await expect(index).toContainText("Dernière reconstruction : 23 novembre 2026 à 14:30");
  await expect(page.locator(".status")).toContainText("Index reconstruit");
  // L'index de sens est dans le même onglet.
  await expect(settings.locator(".meaning-settings")).toContainText("Recherche par le sens");
  const bar = settings.getByRole("progressbar", { name: "Index de sens" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", /^\d+$/);
  await expect(settings.locator(".index-bar-percent")).toHaveText(/^\d+ %$/);
});
