import { expect, type Page, test } from "@playwright/test";
import { openNote, waitForNote } from "./journey";

const WORKSPACE = {
  "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 },
  "courses.md": { content: "# Courses\n- pain", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const greyed = (page: Page, id: string) => page.evaluate((id) => window.backend.greyed[id], id);

test("la barre des menus est construite en français, avec les raccourcis de la palette", async ({
  page,
}) => {
  await launch(page);
  const menu = await page.evaluate(() => window.backend.menu);
  expect(menu.map((m) => m.title)).toEqual([
    "MALOREAN Notes",
    "Fichier",
    "Édition",
    "Format",
    "Présentation",
    "Fenêtre",
    "Aide",
  ]);
  const closeTab = menu[1]?.entries.find((e) => e.kind === "command" && e.id === "close-tab");
  expect(closeTab).toMatchObject({ label: "Fermer l'onglet", accelerator: "Cmd+W" });
});

test("Fermer l'onglet du menu ferme l'onglet, pas la fenêtre ; sans note, les commandes d'une note sont grisées", async ({
  page,
}) => {
  await launch(page);
  await openNote(page, "Courses");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect.poll(() => greyed(page, "close-tab")).toBe(false);

  await choose(page, "close-tab");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await choose(page, "close-tab");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator(".note-item")).toHaveCount(2);
  await expect.poll(() => greyed(page, "close-tab")).toBe(true);
  expect(await greyed(page, "print-note")).toBe(true);
  expect(await greyed(page, "new-note")).toBe(false);

  await openNote(page, "Courses");
  await expect.poll(() => greyed(page, "close-tab")).toBe(false);
});

test("un élément du menu lance sa commande, sauf quand une fenêtre de la page est ouverte", async ({
  page,
}) => {
  await launch(page);
  await choose(page, "command-palette");
  await expect(page.getByRole("dialog", { name: "Palette de commandes" })).toBeVisible();
  await choose(page, "close-tab");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Palette de commandes" })).toBeHidden();
  await expect(page.getByRole("tab")).toHaveCount(1);

  await choose(page, "find-and-replace");
  await expect(page.locator(".cm-search input[name=replace]")).toBeFocused();
});
