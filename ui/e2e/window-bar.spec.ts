import { expect, type Page, test } from "@playwright/test";
import { sidePanelsButton, waitForNote } from "./journey";

// La barre de la fenêtre : tout en haut, à la place de la barre de titre du Mac, avec le bouton des
// panneaux latéraux à droite des trois boutons de fenêtre du Mac. Visible panneaux cachés comme montrés.

/** Place laissée aux trois boutons de fenêtre du Mac (`--window-bar-inset`). */
const TRAFFIC_LIGHTS = 78;

async function launch(page: Page, width = 1400) {
  await page.setViewportSize({ width, height: 700 });
  const params = new URLSearchParams({
    notes: JSON.stringify({ "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 } }),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

const box = async (locator: ReturnType<Page["locator"]>) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("élément absent de l'écran");
  return rect;
};

const bar = (page: Page) => page.locator(".window-bar");
const folders = (page: Page) => page.locator(".folders");
const notes = (page: Page) => page.locator(".notes-panel");

test("la barre est tout en haut, sur toute la largeur, et on la saisit pour déplacer la fenêtre", async ({
  page,
}) => {
  await launch(page);
  const rect = await box(bar(page));
  expect(rect.x).toBe(0);
  expect(rect.y).toBe(0);
  expect(rect.width).toBe(1400);
  expect(Math.round(rect.height)).toBe(38);
  await expect(bar(page)).toHaveAttribute("data-tauri-drag-region", "");
  // La fenêtre commence sous la barre : rien n'est caché dessous.
  const area = await box(page.locator(".main-area"));
  expect(Math.round(area.y)).toBe(38);
  expect(Math.round(area.y + area.height)).toBe(700);
  const header = await box(folders(page).locator(".side-panel-header"));
  expect(header.y).toBeGreaterThanOrEqual(rect.y + rect.height);
});

test("le bouton est en haut à gauche, à droite des boutons de fenêtre du Mac, et se clique à l'aise", async ({
  page,
}) => {
  await launch(page);
  const button = sidePanelsButton(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("title", "Panneaux latéraux (Cmd+0)");
  await expect(button).toHaveText("");
  await expect(button.locator("svg")).toHaveCount(1);
  const rect = await box(button);
  const strip = await box(bar(page));
  expect(rect.x).toBeGreaterThanOrEqual(TRAFFIC_LIGHTS);
  expect(rect.x).toBeLessThan(TRAFFIC_LIGHTS + 20);
  expect(rect.width).toBeGreaterThanOrEqual(28);
  expect(rect.height).toBeGreaterThanOrEqual(28);
  // Centré dans la hauteur de la barre.
  expect(Math.abs(rect.y + rect.height / 2 - (strip.y + strip.height / 2))).toBeLessThan(1);
  // Un seul contrôle pour cette action : le bloc d'affichage ne l'a plus.
  await expect(page.getByRole("button", { name: /Panneaux/ })).toHaveCount(1);
  await expect(page.locator(".display-tools").getByRole("button")).toHaveCount(5);
});

test("un clic cache les deux colonnes, le bouton reste au même endroit, visible ; un second clic les rend", async ({
  page,
}) => {
  await launch(page);
  const button = sidePanelsButton(page);
  const before = await box(button);
  const shownIcon = await button.innerHTML();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(folders(page)).toBeVisible();
  await expect(notes(page)).toBeVisible();

  await button.click();
  await expect(folders(page)).toBeHidden();
  await expect(notes(page)).toBeHidden();
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport({ ratio: 1 });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await button.innerHTML()).not.toBe(shownIcon);
  expect(await box(button)).toEqual(before);
  expect((await box(page.locator(".editor"))).x).toBe(0);

  await button.click();
  await expect(folders(page)).toBeVisible();
  await expect(notes(page)).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await button.innerHTML()).toBe(shownIcon);
});

test("Cmd+0 et le bouton agissent sur le même réglage, gardé au relancement", async ({ page }) => {
  await launch(page);
  const button = sidePanelsButton(page);
  await page.keyboard.press("Meta+0");
  await expect(folders(page)).toBeHidden();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await waitForNote(page, "Voyage");
  await expect(folders(page)).toBeHidden();
  await expect(sidePanelsButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(sidePanelsButton(page)).toBeVisible();
  await sidePanelsButton(page).click();
  await expect(folders(page)).toBeVisible();
});

test("fenêtre étroite et colonne Claude Code ouverte : le bouton reste visible, panneaux cachés ou non", async ({
  page,
}) => {
  await launch(page, 900);
  await page.locator(".display-tools").getByRole("button", { name: "Claude", exact: true }).click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  await expect(sidePanelsButton(page)).toBeInViewport({ ratio: 1 });
  await sidePanelsButton(page).click();
  await expect(folders(page)).toBeHidden();
  await expect(sidePanelsButton(page)).toBeInViewport({ ratio: 1 });
});
