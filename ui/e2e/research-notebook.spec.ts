import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Cahier de recherche, à la souris : la barre des menus, le « + » du cahier, la fenêtre de saisie.
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
const entryWindow = (page: Page) => page.getByRole("dialog", { name: "Ajouter au cahier" });

test("un nouveau cahier se crée par le menu Fichier, s'ouvre en lecture seule, et reçoit une entrée par son « + »", async ({
  page,
}) => {
  await launch(page, { "courses.md": NOTES["courses.md"] });
  await choose(page, "new-research-notebook");
  const ask = page.getByRole("dialog", { name: "Titre du nouveau cahier de recherche" });
  await ask.getByRole("textbox").fill("Bières");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(page.locator(".notebook-bar")).toBeVisible();
  const path = "bieres.md";
  expect(await savedContent(page, path)).toBe("---\ntype: cahier-de-recherche\n---\n# Bières\n");

  // Lecture seule : un clic puis une frappe ne changent rien.
  await page.locator(".cm-line").last().click();
  await page.keyboard.type("effacé ?");
  await page.waitForTimeout(600);
  expect(await savedContent(page, path)).toBe("---\ntype: cahier-de-recherche\n---\n# Bières\n");

  await page.getByRole("button", { name: "Ajouter une entrée" }).click();
  const window = entryWindow(page);
  await expect(window.getByRole("combobox", { name: "Cahier" })).toHaveCount(0);
  await window.getByRole("textbox", { name: "Entrée" }).fill("Houblon A\nmousse");
  await window.getByRole("button", { name: "Ajouter" }).click();
  await expect(window).toBeHidden();
  await expect(page.locator(".status")).toContainText("Entrée ajoutée à « Bières »");
  await expect
    .poll(() => savedContent(page, path))
    .toBe(
      "---\ntype: cahier-de-recherche\n---\n# Bières\n\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 18:30 - Houblon A\n  mousse\n",
    );
  await expect(page.locator(".cm-content")).toContainText("Houblon A");
});

test("« Ajouter au cahier » sans ouvrir de cahier : on choisit le cahier, puis on corrige une entrée par une autre", async ({
  page,
}) => {
  const bieres = NOTEBOOK.replace("Levures", "Bières");
  await launch(page, { ...NOTES, "bieres.md": { content: bieres, modified: 5 } });
  await choose(page, "add-entry");
  let window = entryWindow(page);
  await window.getByRole("combobox", { name: "Cahier" }).selectOption({ label: "Levures" });
  await window.getByRole("textbox", { name: "Entrée" }).fill("Levure A : rien");
  await window.getByRole("button", { name: "Ajouter" }).click();
  await expect(window).toBeHidden();
  await expect
    .poll(() => savedContent(page, "Labo/levures.md"))
    .toContain("- 18:30 - Levure A : rien");
  expect(await savedContent(page, "bieres.md")).toBe(bieres);
  await waitForNote(page, "Courses");

  await choose(page, "add-entry");
  window = entryWindow(page);
  await window.getByRole("combobox", { name: "Cahier" }).selectOption({ label: "Levures" });
  await window
    .getByRole("combobox", { name: "Corrige" })
    .selectOption({ label: "16 novembre 2026 à 18:30 — Levure A : rien" });
  await window.getByRole("textbox", { name: "Entrée" }).fill("Levure A : mousse");
  await window.getByRole("button", { name: "Ajouter" }).click();
  await expect
    .poll(() => savedContent(page, "Labo/levures.md"))
    .toContain(
      "- 18:30 - Levure A : rien\n- 18:30 - Correction de [l'entrée du 16 novembre 2026 à 18:30](#2026-11-16-18h30) : Levure A : mousse\n",
    );
});

test("sans cahier, « Ajouter au cahier » dit comment en créer un ; la recherche trouve une entrée seule, avec son cahier", async ({
  page,
}) => {
  await launch(page, { "courses.md": NOTES["courses.md"] });
  await choose(page, "add-entry");
  await expect(page.locator(".status")).toContainText("« Nouveau cahier de recherche » en crée un");
  await expect(entryWindow(page)).toBeHidden();

  const content = `${NOTEBOOK}\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 18:30 - du levain qui monte\n`;
  await launch(page, { ...NOTES, "Labo/levures.md": { content, modified: 10 } });
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("levain");
  const results = page.locator(".search-result");
  await expect(results).toHaveCount(2);
  await expect(results.nth(0).locator(".search-type")).toHaveText("Cahier de recherche");
  await expect(results.nth(1).locator(".note-title")).toHaveText("16 novembre 2026 à 18:30");
  await expect(results.nth(1).locator(".search-type")).toHaveText("Entrée · Levures");
  await results.nth(1).click();
  await expect(page.locator(".notebook-bar")).toBeVisible();
});
