import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// La bande du haut : une seule ligne quand la zone du milieu a la place, deux lignes propres sinon
// (mise en forme et copies ; puis affichage et recherche, qui prend toute la largeur restante).
// Le basculement suit la largeur de la zone du milieu, pas celle de la fenêtre : la colonne Claude
// Code ouverte le déclenche aussi.

const SEARCH_MINIMUM = 96;
/** Les trois blocs, la recherche à son minimum et les écarts entre eux (mesurés : 721,9 points). */
const SINGLE_ROW_NEEDS = 722;
/** Tolérance autour du seuil : le basculement tombe à quelques points de la largeur nécessaire. */
const MARGIN = 8;

async function launch(page: Page, width: number, appearance: "light" | "dark" = "light") {
  await page.setViewportSize({ width, height: 700 });
  const params = new URLSearchParams({
    notes: JSON.stringify({ "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 } }),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
}

const tool = (page: Page, name: string) =>
  page.locator(".display-tools").getByRole("button", { name, exact: true });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Strip {
  readonly format: Box;
  readonly copy: Box;
  readonly display: Box;
  readonly search: Box;
  /** Le rectangle utile de la bande (sans ses marges). */
  readonly inner: Box;
  readonly overflow: number;
}

const strip = (page: Page): Promise<Strip> =>
  page.evaluate(() => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const part = (selector: string) => rect(document.querySelector(selector) as HTMLElement);
    const row = document.querySelector(".editor-tools") as HTMLElement;
    const style = getComputedStyle(row);
    const outer = rect(row);
    const left = parseFloat(style.paddingLeft);
    const right = parseFloat(style.paddingRight);
    return {
      format: part(".format-bar > :nth-child(1)"),
      copy: part(".format-bar > :nth-child(2)"),
      display: part(".display-tools"),
      search: part(".search-field"),
      inner: { ...outer, x: outer.x + left, width: outer.width - left - right },
      overflow: row.scrollWidth - row.clientWidth,
    };
  });

const middle = (box: Box) => box.y + box.height / 2;
const sameLine = (a: Box, b: Box) => Math.abs(middle(a) - middle(b)) < 2;
const right = (box: Box) => box.x + box.width;

/** Une seule ligne : les quatre éléments au même niveau, dans l'ordre, la recherche entière. */
function expectOneRow(s: Strip) {
  for (const box of [s.copy, s.display, s.search]) expect(sameLine(box, s.format)).toBe(true);
  expect(right(s.format)).toBeLessThanOrEqual(s.copy.x);
  expect(right(s.copy)).toBeLessThanOrEqual(s.display.x);
  expect(right(s.display)).toBeLessThanOrEqual(s.search.x);
  expect(s.search.width).toBeGreaterThanOrEqual(SEARCH_MINIMUM - 0.5);
  expect(s.overflow).toBe(0);
}

/** Deux lignes propres : mise en forme et copies en haut ; affichage et recherche dessous, la recherche jusqu'au bord. */
function expectTwoRows(s: Strip) {
  expect(sameLine(s.copy, s.format)).toBe(true);
  expect(right(s.format)).toBeLessThanOrEqual(s.copy.x);
  expect(sameLine(s.search, s.display)).toBe(true);
  expect(s.display.y).toBeGreaterThanOrEqual(s.format.y + s.format.height - 1);
  expect(Math.abs(s.display.x - s.inner.x)).toBeLessThan(1);
  expect(right(s.display)).toBeLessThanOrEqual(s.search.x);
  expect(Math.abs(right(s.search) - right(s.inner))).toBeLessThan(1);
  expect(s.search.width).toBeGreaterThanOrEqual(SEARCH_MINIMUM - 0.5);
  expect(s.overflow).toBe(0);
}

/** Fixe la largeur de la fenêtre pour que la bande ait `target` points utiles. */
async function giveStripWidth(page: Page, target: number) {
  const current = (await strip(page)).inner.width;
  const view = page.viewportSize() as { width: number; height: number };
  await page.setViewportSize({ width: view.width + Math.round(target - current), height: 700 });
  await expect
    .poll(async () => Math.round((await strip(page)).inner.width))
    .toBe(Math.round(target));
}

test("la zone du milieu large : tout sur une seule ligne, la recherche à sa largeur maximale", async ({
  page,
}) => {
  await launch(page, 1800);
  const s = await strip(page);
  expectOneRow(s);
  expect(Math.round(s.search.width)).toBe(320);
});

test("colonne Claude Code ouverte, la zone du milieu étroite : deux lignes propres", async ({
  page,
}) => {
  await launch(page, 1400);
  await expectOneRowAt(page);
  await tool(page, "Claude").click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  await expect.poll(async () => (await strip(page)).inner.width).toBeLessThan(SINGLE_ROW_NEEDS);
  const s = await strip(page);
  expectTwoRows(s);
  // La recherche prend toute la largeur restante : plus large que son maximum d'une seule ligne.
  expect(s.search.width).toBeGreaterThan(320);
  // La bande ne cache ni les colonnes ni les onglets : les colonnes commencent sous la bande.
  const columns = await page.locator(".columns").boundingBox();
  const bar = await page.locator(".window-bar").boundingBox();
  expect((columns as Box).y).toBeGreaterThanOrEqual((bar as Box).y + (bar as Box).height - 1);
  // Les deux lignes grandissent la bande, qui reste une seule : les boutons de fenêtre du Mac restent sur la première ligne.
  expect((bar as Box).height).toBeGreaterThan(90);
  const button = await page.getByRole("button", { name: "Panneaux latéraux" }).boundingBox();
  expect(Math.abs(middle(button as Box) - middle(s.format))).toBeLessThan(1);
  // Fermer la colonne rend la ligne unique.
  await tool(page, "Claude").click();
  await expectOneRowAt(page);
});

async function expectOneRowAt(page: Page) {
  await expect
    .poll(async () => (await strip(page)).inner.width)
    .toBeGreaterThanOrEqual(SINGLE_ROW_NEEDS);
  expectOneRow(await strip(page));
}

for (const appearance of ["light", "dark"] as const) {
  test(`le basculement tombe à la largeur nécessaire aux trois blocs et à la recherche (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page, 1800, appearance);
    await giveStripWidth(page, SINGLE_ROW_NEEDS + MARGIN);
    const justEnough = await strip(page);
    expectOneRow(justEnough);
    expect(Math.round(justEnough.search.width)).toBeLessThanOrEqual(SEARCH_MINIMUM + MARGIN + 1);
    await giveStripWidth(page, SINGLE_ROW_NEEDS - MARGIN);
    expectTwoRows(await strip(page));
  });
}

test("à toute largeur de la zone du milieu : une ligne ou deux lignes propres, jamais de recherche tronquée", async ({
  page,
}) => {
  await launch(page, 1800);
  for (const target of [900, 760, 730, 720, 680, 668, 640, 560, 480, 440]) {
    await giveStripWidth(page, target);
    const s = await strip(page);
    if (target >= SINGLE_ROW_NEEDS) expectOneRow(s);
    else expectTwoRows(s);
  }
});

test("à deux lignes, chaque bouton reste visible, nommé en bulle d'aide et cliquable", async ({
  page,
}) => {
  await launch(page, 1800);
  await giveStripWidth(page, 560);
  expectTwoRows(await strip(page));
  const buttons = page.locator(".format-bar button, .display-tools button");
  await expect(buttons).toHaveCount(17);
  for (const button of await buttons.all()) {
    await expect(button).toBeInViewport();
    await expect(button).toHaveAttribute("title", /\S/);
    await expect(button).toHaveAttribute("aria-label", /\S/);
  }
});

test("zone du milieu plus étroite que l'affichage et la recherche à leur minimum : la recherche passe seule sur une troisième ligne, sans déborder", async ({
  page,
}) => {
  await launch(page, 1800);
  // Bande resserrée à 270 points utiles (l'affichage et la recherche minimale en demandent 283).
  await page.locator(".editor-tools").evaluate((row) => (row.style.width = "296px"));
  const s = await strip(page);
  expect(Math.round(s.inner.width)).toBe(270);
  expect(s.overflow).toBe(0);
  // L'affichage, seul sur sa ligne, est centré (fiche 0100).
  expect(
    Math.abs(s.display.x + s.display.width / 2 - (s.inner.x + s.inner.width / 2)),
  ).toBeLessThan(1);
  expect(s.search.y).toBeGreaterThanOrEqual(s.display.y + s.display.height - 1);
  expect(Math.abs(s.search.x - s.inner.x)).toBeLessThan(1);
  expect(Math.abs(right(s.search) - right(s.inner))).toBeLessThan(1);
  expect(s.search.width).toBeGreaterThanOrEqual(SEARCH_MINIMUM);
  // Assez large pour la mise en forme et les copies sur une ligne (427 points) : les deux lignes propres.
  await page.locator(".editor-tools").evaluate((row) => (row.style.width = "470px"));
  expectTwoRows(await strip(page));
});
