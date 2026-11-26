import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Icônes des menus du clic droit, dans le vrai écran : chaque choix a son icône devant son nom, toutes dans
// la même colonne (rectangles réels mesurés), de la couleur du texte du choix, en thème clair et sombre.

const NOTES = {
  "courses.md": { content: "# Courses\npain", modified: 30 },
  "Plans/idée.md": { content: "# Idée\nfaire", modified: 20 },
};
const NOTE_MENU = [
  "Ouvrir dans un nouvel onglet",
  "Ouvrir à gauche",
  "Ouvrir à droite",
  "Fermer",
  "Épingler",
  "Exporter…",
  "Imprimer…",
  "Copier en texte mis en forme",
  "Copier en Markdown",
  "Historique…",
  "Placer dans la corbeille",
];
const TAB_MENU = NOTE_MENU.filter(
  (name) => !["Épingler", "Exporter…", "Placer dans la corbeille"].includes(name),
);
const FOLDER_MENU = [
  "Nouvelle note",
  "Nouvelle carte mentale",
  "Nouveau canvas",
  "Nouveau cahier de recherche",
  "Nouveau CRM",
  "Placer dans la corbeille",
];

async function launch(page: Page, appearance: string) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["Plans"]),
    remembered: "1",
  });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
}

const menu = (page: Page) => page.getByRole("menu");
const items = (page: Page) => menu(page).getByRole("menuitem");

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("élément non affiché");
  return found;
}

/** Chaque choix a son dessin, visible ; les dessins sont dans une même colonne, les noms au même bord ; l'icône a la couleur du texte. */
async function expectIconColumn(page: Page, names: string[]) {
  await expect(items(page)).toHaveCount(names.length);
  await expect(menu(page).locator(".context-menu-label")).toHaveText(names);
  const icons = menu(page).locator(".context-menu-icon svg");
  await expect(icons).toHaveCount(names.length);
  const drawn = await icons.evaluateAll((all) =>
    all.map((svg) => {
      const rect = svg.getBoundingClientRect();
      const button = svg.closest("button") as HTMLElement;
      return {
        left: Math.round(rect.left),
        width: rect.width,
        height: rect.height,
        stroke: getComputedStyle(svg).stroke,
        color: getComputedStyle(button).color,
        paths: svg.querySelectorAll("path").length,
      };
    }),
  );
  for (const one of drawn) {
    expect(one.width).toBeGreaterThanOrEqual(12);
    expect(one.height).toBeGreaterThanOrEqual(12);
    expect(one.paths).toBeGreaterThan(0);
    // `currentColor` : le trait a la couleur du texte du choix.
    expect(one.stroke).toBe(one.color);
  }
  expect(new Set(drawn.map((one) => one.left)).size).toBe(1);
  const labels = await menu(page)
    .locator(".context-menu-label")
    .evaluateAll((all) => all.map((label) => Math.round(label.getBoundingClientRect().left)));
  expect(new Set(labels).size).toBe(1);
  const inside = await box(menu(page));
  expect(drawn[0]?.left).toBeGreaterThan(inside.x);
  expect(drawn[0]?.left).toBeLessThan(labels[0] ?? 0);
  // Chaque dessin est dans son bouton, qui est dans le menu.
  for (let at = 0; at < names.length; at += 1) {
    const button = await box(items(page).nth(at));
    const icon = await box(icons.nth(at));
    expect(icon.x).toBeGreaterThanOrEqual(button.x);
    expect(icon.x + icon.width).toBeLessThanOrEqual(button.x + button.width);
    expect(icon.y).toBeGreaterThanOrEqual(button.y);
    expect(icon.y + icon.height).toBeLessThanOrEqual(button.y + button.height);
  }
}

for (const appearance of ["dark", "light"]) {
  test.describe(`thème ${appearance}`, () => {
    test("le menu d'une note de la liste a une icône par choix, alignées", async ({ page }) => {
      await launch(page, appearance);
      await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
      await expectIconColumn(page, NOTE_MENU);
    });

    test("le menu d'un dossier a une icône par choix, alignées", async ({ page }) => {
      await launch(page, appearance);
      await page.locator('.folder-item[data-path="Plans"]').click({ button: "right" });
      await expectIconColumn(page, FOLDER_MENU);
    });

    test("le menu d'un onglet a une icône par choix, alignées", async ({ page }) => {
      await launch(page, appearance);
      await page.locator('[role="tab"]').first().click({ button: "right" });
      await expectIconColumn(page, TAB_MENU);
    });

    test("le menu d'une note épinglée propose « Désépingler » avec son icône", async ({ page }) => {
      await launch(page, appearance);
      await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
      await items(page).filter({ hasText: "Épingler" }).click();
      await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
      await expect(items(page).filter({ hasText: "Désépingler" }).locator("svg")).toHaveCount(1);
    });
  });
}
