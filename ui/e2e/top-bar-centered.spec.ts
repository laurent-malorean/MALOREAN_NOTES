import { expect, type Page, test } from "@playwright/test";
import { sidePanelsButton, waitForNote } from "./journey";

// La bande du haut est centrée dans la zone de l'éditeur (celle qui est à droite des panneaux
// latéraux, ou, panneaux cachés, à droite de la réserve des boutons de fenêtre du Mac), pas collée à son bord droit : chaque ligne de la bande a son milieu au milieu de la
// zone, quelle que soit la largeur de la fenêtre, la colonne Claude Code, les panneaux cachés ou
// montrés (fiche 0092).

/** Tolérance sur le milieu : un point. */
const CENTRE_TOLERANCE = 1;
/** La bande n'a la place d'une seule ligne qu'à partir de 705 points utiles (fiche 0085). */
const SINGLE_ROW_NEEDS = 705;

async function launch(page: Page, width: number, height = 700) {
  await page.setViewportSize({ width, height });
  const params = new URLSearchParams({
    notes: JSON.stringify({ "voyage.md": { content: "# Voyage\nUn beau départ.", modified: 20 } }),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

interface Line {
  readonly left: number;
  readonly right: number;
  readonly buttons: number;
}

interface Measure {
  /** Les bords gauche et droit de la zone de l'éditeur. */
  readonly zone: { left: number; right: number };
  /** Les lignes de la bande (de haut en bas), chacune avec ses bords gauche et droit. */
  readonly lines: readonly Line[];
  /** Les boutons hors de la zone de l'éditeur (coupés), et le débordement horizontal de la bande et de la page. */
  readonly cut: number;
  /** Les boutons passés sous la réserve gauche : aucun. */
  readonly beneathReserve: number;
  readonly overflow: number;
  readonly pageOverflow: number;
}

/** Mesure la zone de l'éditeur et chaque ligne de la bande (les quatre éléments regroupés par leur milieu vertical). */
const measure = (page: Page): Promise<Measure> =>
  page.evaluate(() => {
    const strip = document.querySelector(".editor-tools") as HTMLElement;
    // La zone de l'éditeur, sans la réserve gauche (boutons de fenêtre du Mac et bouton des panneaux) quand elle la recouvre.
    const editor = (document.querySelector(".editor") as HTMLElement).getBoundingClientRect();
    const reserve = (document.querySelector(".window-left") as HTMLElement).getBoundingClientRect();
    const zone = { x: Math.max(editor.x, reserve.right), right: editor.right };
    const parts = [
      ".format-bar > :nth-child(1)",
      ".format-bar > :nth-child(2)",
      ".display-tools",
      ".search-field",
    ].map((selector) => (document.querySelector(selector) as HTMLElement).getBoundingClientRect());
    const lines: { left: number; right: number; buttons: number; middle: number }[] = [];
    for (const box of parts) {
      const middle = box.y + box.height / 2;
      const line = lines.find((l) => Math.abs(l.middle - middle) < 2);
      if (line) {
        line.left = Math.min(line.left, box.x);
        line.right = Math.max(line.right, box.right);
      } else lines.push({ left: box.x, right: box.right, buttons: 0, middle });
    }
    lines.sort((a, b) => a.middle - b.middle);
    const buttons = [...strip.querySelectorAll("button, input")].map((element) =>
      element.getBoundingClientRect(),
    );
    return {
      zone: { left: zone.x, right: zone.right },
      lines: lines.map(({ left, right, buttons: count }) => ({ left, right, buttons: count })),
      cut: buttons.filter((box) => box.x < zone.x - 0.5 || box.right > zone.right + 0.5).length,
      beneathReserve: buttons.filter((box) => box.x < reserve.right - 0.5).length,
      overflow: strip.scrollWidth - strip.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

/** Chaque ligne de la bande a son milieu au milieu de la zone de l'éditeur, rien n'est coupé ni ne déborde. */
function expectCentred(m: Measure, lines: number) {
  expect(m.lines).toHaveLength(lines);
  const centre = (m.zone.left + m.zone.right) / 2;
  for (const line of m.lines) {
    expect(Math.abs((line.left + line.right) / 2 - centre)).toBeLessThanOrEqual(CENTRE_TOLERANCE);
  }
  expect(m.cut).toBe(0);
  expect(m.beneathReserve).toBe(0);
  expect(m.overflow).toBe(0);
  expect(m.pageOverflow).toBe(0);
}

/** Fixe la largeur de la fenêtre pour que la bande ait `target` points utiles. */
async function giveStripWidth(page: Page, target: number) {
  const inner = () =>
    page.evaluate(() => {
      const strip = document.querySelector(".editor-tools") as HTMLElement;
      const style = getComputedStyle(strip);
      return strip.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const current = await inner();
  const view = page.viewportSize() as { width: number; height: number };
  await page.setViewportSize({ width: view.width + Math.round(target - current), height: 700 });
  await expect.poll(async () => Math.round(await inner())).toBe(Math.round(target));
}

const claude = (page: Page) =>
  page.locator(".display-tools").getByRole("button", { name: "Claude", exact: true });

test("fenêtre large : la bande est au milieu de la zone de l'éditeur, pas à son bord droit", async ({
  page,
}) => {
  await launch(page, 1800);
  const m = await measure(page);
  expectCentred(m, 1);
  // Mesure absolue : de la place de chaque côté de la bande, et la même.
  const line = m.lines[0] as Line;
  expect(line.left - m.zone.left).toBeGreaterThan(40);
  expect(m.zone.right - line.right).toBeGreaterThan(40);
});

test("fenêtre moyenne, juste au-dessus et juste au-dessous du seuil des deux lignes", async ({
  page,
}) => {
  await launch(page, 1800);
  await giveStripWidth(page, SINGLE_ROW_NEEDS + 8);
  expectCentred(await measure(page), 1);
  await giveStripWidth(page, SINGLE_ROW_NEEDS - 8);
  expectCentred(await measure(page), 2);
  await giveStripWidth(page, 900);
  expectCentred(await measure(page), 1);
});

test("deux lignes : la première (mise en forme et copies) est centrée, la seconde aussi", async ({
  page,
}) => {
  await launch(page, 1800);
  await giveStripWidth(page, 560);
  const m = await measure(page);
  expectCentred(m, 2);
  // La première ligne est moins large que la zone : elle est vraiment au milieu, pas collée à gauche.
  const first = m.lines[0] as Line;
  expect(first.left - m.zone.left).toBeGreaterThan(40);
  expect(m.zone.right - first.right).toBeGreaterThan(40);
});

test("fenêtre étroite, colonne Claude Code ouverte : la bande est centrée dans ce qui reste de la zone", async ({
  page,
}) => {
  await launch(page, 1400);
  const before = await measure(page);
  await claude(page).click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  await expect
    .poll(async () => (await measure(page)).zone.right)
    .toBeLessThan(before.zone.right - 100);
  const m = await measure(page);
  expectCentred(m, 2);
  await claude(page).click();
  await expect.poll(async () => (await measure(page)).zone.right).toBeCloseTo(before.zone.right, 0);
  expectCentred(await measure(page), 1);
});

test("panneaux cachés puis montrés : la zone s'élargit puis se rétrécit, la bande reste centrée", async ({
  page,
}) => {
  await launch(page, 1800);
  const shown = await measure(page);
  expectCentred(shown, 1);
  await sidePanelsButton(page).click();
  await expect
    .poll(async () => (await measure(page)).zone.left)
    .toBeLessThan(shown.zone.left - 100);
  const hidden = await measure(page);
  expectCentred(hidden, 1);
  // La bande a suivi la zone : son milieu s'est déplacé avec elle.
  const shownMiddle = ((shown.lines[0] as Line).left + (shown.lines[0] as Line).right) / 2;
  const hiddenMiddle = ((hidden.lines[0] as Line).left + (hidden.lines[0] as Line).right) / 2;
  expect(shownMiddle - hiddenMiddle).toBeGreaterThan(50);
  await sidePanelsButton(page).click();
  await expect.poll(async () => (await measure(page)).zone.left).toBeCloseTo(shown.zone.left, 0);
  expectCentred(await measure(page), 1);
});

test("fenêtre étroite, panneaux cachés, colonne Claude Code ouverte : centrée, rien de coupé", async ({
  page,
}) => {
  await launch(page, 1000);
  await sidePanelsButton(page).click();
  await claude(page).click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  await expect.poll(async () => (await measure(page)).lines.length).toBeGreaterThanOrEqual(2);
  const m = await measure(page);
  expectCentred(m, m.lines.length);
});

test("fenêtre de 1100 × 720, panneaux montrés, colonne Claude Code ouverte : chaque ligne est centrée, l'affichage seul sur sa ligne aussi", async ({
  page,
}) => {
  await launch(page, 1100, 720);
  await claude(page).click();
  await expect(page.getByRole("region", { name: "Claude Code" })).toBeVisible();
  // La zone de l'éditeur est plus étroite que l'affichage et la recherche à leur minimum (277 points) :
  // quatre lignes, la recherche seule sur la dernière, l'affichage seul sur la troisième.
  await expect.poll(async () => (await measure(page)).lines.length).toBe(4);
  expectCentred(await measure(page), 4);
});
