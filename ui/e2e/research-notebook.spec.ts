import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Cahier de recherche, à la souris : la barre des menus, la zone de saisie en bas du cahier.
// Le texte des entrées se tape, comme toute écriture ; aucune action ne passe par un raccourci.

const NOTEBOOK = "---\ntype: cahier-de-recherche\n---\n# Levures\n";
const NOTES = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
  "Labo/levures.md": { content: NOTEBOOK, modified: 10 },
};

async function launch(page: Page, notes: Record<string, { content: string; modified: number }>) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(["Labo"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const entryArea = (page: Page) => page.locator(".notebook-entry");

test("un nouveau cahier se crée par le menu Fichier, s'ouvre en lecture seule, et reçoit une entrée par sa zone de saisie en bas", async ({
  page,
}) => {
  await launch(page, { "courses.md": NOTES["courses.md"] });
  await choose(page, "new-research-notebook");
  const ask = page.getByRole("dialog", { name: "Titre du nouveau cahier de recherche" });
  await ask.getByRole("textbox").fill("Bières");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(entryArea(page)).toBeVisible();
  const path = "bieres.md";
  expect(await savedContent(page, path)).toBe("---\ntype: cahier-de-recherche\n---\n# Bières\n");

  // Lecture seule : un clic puis une frappe dans le texte ne changent rien.
  await page.locator(".cm-line").last().click();
  await page.keyboard.type("effacé ?");
  await page.waitForTimeout(600);
  expect(await savedContent(page, path)).toBe("---\ntype: cahier-de-recherche\n---\n# Bières\n");

  await expect(entryArea(page).locator(".notebook-entry-message")).toContainText(
    "elle sera datée au moment de l'ajout et rangée sous « ",
  );
  const text = entryArea(page).getByRole("textbox", { name: "Nouvelle entrée" });
  await expect(text).toHaveAttribute("rows", "8");
  await text.fill("Houblon A\nmousse");
  await entryArea(page).getByRole("button", { name: "Ajouter l'entrée" }).click();
  await expect(page.locator(".status")).toContainText("Entrée ajoutée au cahier");
  await expect
    .poll(() => savedContent(page, path))
    .toBe(
      "---\ntype: cahier-de-recherche\n---\n# Bières\n\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 18:30 - Houblon A\n  mousse\n",
    );
  await expect(page.locator(".cm-content")).toContainText("Houblon A");
  // Cahier vide : aucun numéro avant ; l'entrée ajoutée porte le numéro 0001, sans recharger.
  await expect(page.locator(".entry-number")).toHaveText(["0001"]);
  await expect(text).toHaveValue("");
});

test("hors d'un cahier, aucune zone de saisie ni commande « Ajouter au cahier »", async ({
  page,
}) => {
  await launch(page, NOTES);
  await expect(entryArea(page)).toHaveCount(0);
  await choose(page, "command-palette");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(palette).toBeVisible();
  await expect(palette).toContainText("Nouveau cahier de recherche");
  await expect(palette).not.toContainText("Ajouter au cahier");
});

test("la recherche trouve une entrée seule, avec son cahier", async ({ page }) => {
  const content = `${NOTEBOOK}\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 18:30 - du levain qui monte\n`;
  await launch(page, { ...NOTES, "Labo/levures.md": { content, modified: 10 } });
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("levain");
  const results = page.locator(".match-results .search-result");
  await expect(results).toHaveCount(2);
  await expect(results.nth(0).locator(".search-type")).toHaveText("Cahier de recherche");
  await expect(results.nth(1).locator(".note-title")).toHaveText("16 novembre 2026 à 18:30");
  await expect(results.nth(1).locator(".search-type")).toHaveText("Entrée · Levures");
  await results.nth(1).click();
  await expect(entryArea(page)).toBeVisible();
});

const LONG_NOTEBOOK = `${NOTEBOOK}
## 2026

### Novembre

#### Lundi 23

- 09:42 - Première observation
- 10:15 - Observation longue : la levure monte lentement, la mousse tient bien et l'odeur reste
  franche, sans note de solvant, pendant toute la durée de la fermentation observée ce matin.

  Un paragraphe en retrait détaille la température relevée.
  - sous-puce : 19 degrés
  - sous-puce : 20 degrés
- 11:03 - Troisième observation
`;

for (const appearance of ["light", "dark"]) {
  test(`chaque entrée du cahier a sa barre à gauche, séparée de la suivante (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page, {
      ...NOTES,
      "Labo/levures.md": { content: LONG_NOTEBOOK, modified: 10 },
    });
    await page.evaluate(
      (value) => (document.documentElement.dataset.appearance = value),
      appearance,
    );
    await page.getByRole("searchbox", { name: "Rechercher" }).fill("levure");
    await page.locator(".match-results .search-result").first().click();
    await expect(page.locator(".cm-line.entry-bar-first")).toHaveCount(3);
    const bars = await page.locator(".cm-line.entry-bar").count();
    expect(bars).toBe(8);
  });
}

test("chaque entrée montre son numéro dans la marge ; un clic copie « Titre · numéro » et le dit", async ({
  page,
}) => {
  await launch(page, { ...NOTES, "Labo/levures.md": { content: LONG_NOTEBOOK, modified: 10 } });
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("levure");
  await page.locator(".match-results .search-result").first().click();
  const numbers = page.locator(".entry-number");
  await expect(numbers).toHaveText(["0001", "0002", "0003"]);

  // Dans la marge : à gauche de la barre de l'entrée, sans recouvrir aucune ligne.
  const box = await numbers.nth(1).boundingBox();
  const line = await page.locator(".cm-line.entry-bar-first").nth(1).boundingBox();
  const lefts = await page
    .locator(".cm-line")
    .evaluateAll((lines) => lines.map((l) => l.getBoundingClientRect().left));
  expect(box && line && box.x + box.width <= line.x).toBe(true);
  expect(box && lefts.every((left) => box.x + box.width <= left)).toBe(true);
  // Assez grand pour se lire et se viser : la hauteur d'une cible de clic (32 px), le texte du cahier.
  expect(box && box.height).toBeGreaterThanOrEqual(32);
  const fonts = await page.evaluate(() => [
    parseFloat(getComputedStyle(document.querySelector(".entry-number") as Element).fontSize),
    parseFloat(getComputedStyle(document.querySelector(".cm-line") as Element).fontSize),
  ]);
  expect(fonts[0]).toBeGreaterThanOrEqual((fonts[1] ?? 0) - 2);

  await numbers.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".status")).toContainText("Référence copiée");
  expect(await page.evaluate(() => window.backend.copiedMarkdown)).toEqual(["[[Levures#0002]]"]);
});
