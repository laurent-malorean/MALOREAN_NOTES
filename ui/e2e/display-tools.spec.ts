import { expect, type Page, test } from "@playwright/test";
import { sidePanelsButton, waitForNote } from "./journey";

// Le bloc d'icônes d'affichage (Focus, Plan, Machine à écrire, plein écran, Claude) : le
// troisième bloc de la bande du haut, sur la même ligne que les deux autres et que la recherche.

const NAMES = ["Focus", "Plan", "Machine à écrire", "Plein écran", "Claude"];

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify({ "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 } }),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

const tool = (page: Page, name: string) =>
  page.locator(".display-tools").getByRole("button", { name, exact: true });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Les rectangles des quatre éléments de la bande, et ce qui déborde. */
const strip = (page: Page) =>
  page.evaluate(() => {
    const rect = (selector: string) => {
      const box = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const row = document.querySelector(".editor-tools") as HTMLElement;
    return {
      format: rect(".format-bar > :nth-child(1)"),
      copy: rect(".format-bar > :nth-child(2)"),
      display: rect(".display-tools"),
      search: rect(".search-field"),
      overflow: row.scrollWidth - row.clientWidth,
    };
  });

const disjoint = (a: Box, b: Box) =>
  a.x + a.width <= b.x + 0.5 ||
  b.x + b.width <= a.x + 0.5 ||
  a.y + a.height <= b.y + 0.5 ||
  b.y + b.height <= a.y + 0.5;

const centre = (box: Box) => box.y + box.height / 2;

test("les cinq boutons sont des icônes seules, trouvées par leur nom, avec raccourci en bulle d'aide", async ({
  page,
}) => {
  await launch(page);
  const buttons = page.locator(".display-tools").getByRole("button");
  await expect(buttons).toHaveCount(5);
  for (const name of NAMES) {
    await expect(tool(page, name)).toBeVisible();
    await expect(tool(page, name)).toHaveText("");
    await expect(tool(page, name).locator("svg")).toHaveCount(1);
  }
  await expect(tool(page, "Focus")).toHaveAttribute("title", "Focus (Cmd+Maj+F)");
  await expect(tool(page, "Claude")).toHaveAttribute("title", "Claude (Ctrl+Cmd+L)");
});

test("sur une fenêtre large, les trois blocs et la recherche sont sur une seule ligne, dans l'ordre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 700 });
  await launch(page);
  const { format, copy, display, search, overflow } = await strip(page);
  expect(overflow).toBe(0);
  for (const box of [copy, display, search]) {
    expect(Math.abs(centre(box) - centre(format))).toBeLessThan(2);
  }
  expect(format.x + format.width).toBeLessThanOrEqual(copy.x);
  expect(copy.x + copy.width).toBeLessThanOrEqual(display.x);
  expect(display.x + display.width).toBeLessThanOrEqual(search.x);
  // Le champ s'étire jusqu'à sa largeur maximale (20 rem).
  expect(Math.round(search.width)).toBe(320);
});

test("la fenêtre se réduit : la recherche rétrécit d'abord jusqu'à son minimum, puis deux lignes (affichage et recherche dessous)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 700 });
  await launch(page);
  await sidePanelsButton(page).click();
  const wide = await strip(page);
  // Largeur qui laisse juste la place des trois blocs et du champ à son minimum (6 rem = 96 px).
  const blocks = wide.display.x + wide.display.width - wide.format.x;
  // Un point de plus : le seuil de bascule (42,05 rem) laisse un demi-point de marge sur la largeur nécessaire.
  // Panneaux cachés : la bande laisse à gauche la réserve des boutons de fenêtre du Mac (116 points) et 12,8 points de marge de chaque côté.
  const exact = Math.ceil(blocks + 6.4 + 96 + 116 + 2 * 12.8) + 1;
  await page.setViewportSize({ width: exact, height: 700 });
  await expect
    .poll(async () => Math.round((await strip(page)).search.width))
    .toBeLessThanOrEqual(98);
  const one = await strip(page);
  expect(Math.abs(centre(one.display) - centre(one.format))).toBeLessThan(2);
  expect(Math.abs(centre(one.search) - centre(one.format))).toBeLessThan(2);
  expect(one.overflow).toBe(0);
  await page.setViewportSize({ width: exact - 30, height: 700 });
  await expect.poll(async () => (await strip(page)).display.y).toBeGreaterThan(one.format.y + 10);
  const two = await strip(page);
  // Deux lignes : mise en forme et copies en haut ; affichage et recherche dessous, la recherche au moins à son minimum.
  expect(two.display.y).toBeGreaterThanOrEqual(two.format.y + two.format.height - 1);
  expect(Math.abs(two.format.y - two.copy.y)).toBeLessThan(2);
  expect(Math.abs(centre(two.search) - centre(two.display))).toBeLessThan(2);
  expect(Math.round(two.search.width)).toBeGreaterThanOrEqual(96);
  expect(two.overflow).toBe(0);
});

test("fenêtre étroite : rien ne se chevauche ni ne déborde, et chaque icône reste cliquable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await launch(page);
  for (const hidePanels of [false, true]) {
    if (hidePanels) await sidePanelsButton(page).click();
    const { format, copy, display, search, overflow } = await strip(page);
    expect(overflow).toBe(0);
    const boxes = [format, copy, display, search];
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) expect(disjoint(a, b)).toBe(true);
    for (const name of NAMES) await expect(tool(page, name)).toBeInViewport();
  }
});

test("les boutons actifs restent surlignés et le nom du plein écran change avec son état", async ({
  page,
}) => {
  await launch(page);
  const color = (name: string) =>
    tool(page, name).evaluate((element) => getComputedStyle(element).color);
  const idle = await color("Claude");
  // Sous le pointeur, un bouton actif garde sa couleur d'accent.
  await tool(page, "Plan").click();
  await expect(tool(page, "Plan")).toHaveAttribute("aria-pressed", "true");
  expect(await color("Plan")).not.toBe(idle);
  await tool(page, "Plein écran").click();
  await expect(tool(page, "Quitter le plein écran")).toHaveAttribute(
    "title",
    "Quitter le plein écran (Ctrl+Cmd+F)",
  );
  await expect(tool(page, "Quitter le plein écran")).toHaveAttribute("aria-pressed", "true");
  await tool(page, "Quitter le plein écran").click();
  await expect(tool(page, "Plein écran")).toBeVisible();
});

test("Focus, Machine à écrire et Claude gardent leur action", async ({ page }) => {
  await launch(page);
  await tool(page, "Focus").click();
  await expect(tool(page, "Focus : phrase")).toHaveAttribute("aria-pressed", "true");
  await tool(page, "Machine à écrire").click();
  await expect(tool(page, "Machine à écrire")).toHaveAttribute("aria-pressed", "true");
  await tool(page, "Claude").click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  await expect(tool(page, "Claude")).toHaveAttribute("aria-pressed", "true");
});
