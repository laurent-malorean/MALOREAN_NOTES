import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// La bande du haut : de l'air entre les blocs d'icônes (les pilules) et une recherche de la même
// hauteur qu'eux. Les mesures sont celles de la vraie page dans WebKit, en thèmes clair et sombre.

/** L'écart minimal entre deux blocs voisins : un pas de l'échelle d'espacement (--space-3). */
const MINIMUM_GAP = 12;
/** Tolérance sur une hauteur : le sous-pixel des mesures. */
const HEIGHT_TOLERANCE = 0.5;

async function launch(page: Page, appearance: "light" | "dark") {
  await page.setViewportSize({ width: 1800, height: 700 });
  const params = new URLSearchParams({
    notes: JSON.stringify({ "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 } }),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Blocks {
  readonly format: Box;
  readonly copy: Box;
  readonly display: Box;
  readonly search: Box;
  readonly overflow: number;
}

const blocks = (page: Page): Promise<Blocks> =>
  page.evaluate(() => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const part = (selector: string) => rect(document.querySelector(selector) as HTMLElement);
    const row = document.querySelector(".editor-tools") as HTMLElement;
    return {
      format: part(".format-bar > :nth-child(1)"),
      copy: part(".format-bar > :nth-child(2)"),
      display: part(".display-tools"),
      search: part(".search-field"),
      overflow: row.scrollWidth - row.clientWidth,
    };
  });

const right = (box: Box) => box.x + box.width;

for (const appearance of ["light", "dark"] as const) {
  test(`sur une ligne : au moins ${MINIMUM_GAP} points entre deux blocs voisins et la recherche, de la hauteur d'un bloc (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page, appearance);
    const b = await blocks(page);
    expect(b.copy.x - right(b.format)).toBeGreaterThanOrEqual(MINIMUM_GAP);
    expect(b.display.x - right(b.copy)).toBeGreaterThanOrEqual(MINIMUM_GAP);
    expect(b.search.x - right(b.display)).toBeGreaterThanOrEqual(MINIMUM_GAP);
    for (const pill of [b.format, b.copy, b.display]) {
      expect(Math.abs(b.search.height - pill.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
    }
    // Même hauteur et même milieu : le haut et le bas de la recherche suivent ceux des blocs.
    expect(Math.abs(b.search.y - b.format.y)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
    expect(b.overflow).toBe(0);
  });
}

test("sur deux lignes : l'écart entre l'affichage et la recherche et leur hauteur commune tiennent encore", async ({
  page,
}) => {
  await launch(page, "light");
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect.poll(async () => (await blocks(page)).search.y).toBeGreaterThan(50);
  const b = await blocks(page);
  // Les deux lignes : la mise en forme au-dessus, l'affichage et la recherche côte à côte dessous.
  expect(b.display.y).toBeGreaterThan(b.format.y + b.format.height - 1);
  expect(b.copy.x - right(b.format)).toBeGreaterThanOrEqual(MINIMUM_GAP);
  expect(b.search.x - right(b.display)).toBeGreaterThanOrEqual(MINIMUM_GAP);
  expect(Math.abs(b.search.height - b.display.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
  expect(b.overflow).toBe(0);
});

test("zone très étroite : la recherche garde la hauteur d'un bloc, rien ne déborde ni ne se superpose", async ({
  page,
}) => {
  await launch(page, "light");
  await page.locator(".editor-tools").evaluate((row) => (row.style.width = "296px"));
  const b = await blocks(page);
  expect(b.overflow).toBe(0);
  expect(Math.abs(b.search.height - b.display.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
  // Les trois lignes se suivent sans se recouvrir.
  expect(b.display.y).toBeGreaterThanOrEqual(b.format.y + b.format.height - 1);
  expect(b.search.y).toBeGreaterThanOrEqual(b.display.y + b.display.height - 1);
});
