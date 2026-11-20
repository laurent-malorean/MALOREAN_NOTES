import { expect, type Page, test } from "@playwright/test";

// Panneaux latéraux et plein écran : ce qui reste à l'écran, et où se trouvent les colonnes.

const longNote = (title: string) =>
  [`# ${title}`, ...Array.from({ length: 120 }, (_, i) => `ligne ${i} de ${title}`)].join("\n");

async function launch(page: Page) {
  const notes = {
    "alpha.md": { content: longNote("Alpha"), modified: 30 },
    "beta.md": { content: longNote("Beta"), modified: 20 },
  };
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").first()).toContainText("Alpha");
}

const folders = (page: Page) => page.locator(".folders");
const notes = (page: Page) => page.locator(".notes-panel");
const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const panelsButton = (page: Page) => page.getByRole("button", { name: "Panneaux" });
const fullScreen = (page: Page) => page.evaluate(() => window.backend.fullScreen);

/** Bords gauche et droit de chaque colonne, arrondis au pixel. */
const columnEdges = (page: Page) =>
  columns(page).evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right) };
    }),
  );

/** Où commence et finit la zone que les colonnes doivent occuper : après les panneaux montrés. */
const editingArea = (page: Page) =>
  page.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>(".main-area > aside")].filter(
      (aside) => aside.offsetParent !== null,
    );
    const left = shown.length ? Math.max(...shown.map((a) => a.getBoundingClientRect().right)) : 0;
    const tools = (document.querySelector(".columns") as HTMLElement).getBoundingClientRect();
    return { left: Math.round(left), right: Math.round(tools.right) };
  });

/** Distance, en pixels, entre la première ligne de la note d'une colonne et le haut de son texte. */
const firstLineFromTop = (page: Page, column: number) =>
  columns(page)
    .nth(column)
    .evaluate((element) => {
      const scroller = element.querySelector(".cm-scroller") as HTMLElement;
      const line = element.querySelector(".cm-line") as HTMLElement;
      if (line.textContent?.startsWith("ligne")) return Number.POSITIVE_INFINITY;
      const padding = Number.parseFloat(getComputedStyle(scroller).paddingTop);
      const top = scroller.getBoundingClientRect().top + padding;
      return Math.round(Math.abs(line.getBoundingClientRect().top - top));
    });

/** Les colonnes remplissent la zone d'édition, de bord à bord, en gardant leurs parts. */
async function expectColumnsFill(page: Page, shares: number[]) {
  await expect
    .poll(async () => {
      const area = await editingArea(page);
      const edges = await columnEdges(page);
      const width = area.right - area.left;
      return [
        Math.abs((edges.at(0)?.left ?? -1) - area.left) <= 1,
        Math.abs((edges.at(-1)?.right ?? -1) - area.right) <= 1,
        edges.length === shares.length &&
          edges.every(
            (edge, i) => Math.abs((edge.right - edge.left) / width - (shares[i] ?? 0)) < 0.02,
          ),
      ];
    })
    .toEqual([true, true, true]);
}

test("le plein écran garde les panneaux latéraux montrés, et les colonnes à leur place", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await expect(columns(page)).toHaveCount(2);
  await expectColumnsFill(page, [0.5, 0.5]);
  await page.getByRole("button", { name: "Plein écran" }).click();
  expect(await fullScreen(page)).toBe(true);
  await expect(folders(page)).toBeVisible();
  await expect(notes(page)).toBeVisible();
  await expectColumnsFill(page, [0.5, 0.5]);
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  await expect.poll(() => firstLineFromTop(page, 1)).toBeLessThan(3);
});

test("les panneaux latéraux se cachent et se montrent, en plein écran comme en dehors", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await expect(panelsButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(panelsButton(page)).toHaveAttribute("title", /\(Cmd\+0\)$/);
  // Bouton : les colonnes prennent toute la largeur, en gardant leurs parts et leur texte en haut.
  await panelsButton(page).click();
  await expect(folders(page)).toBeHidden();
  await expect(notes(page)).toBeHidden();
  await expect(panelsButton(page)).toHaveAttribute("aria-pressed", "false");
  await expectColumnsFill(page, [0.5, 0.5]);
  expect((await columnEdges(page)).at(0)?.left).toBe(0);
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  await expect.poll(() => firstLineFromTop(page, 1)).toBeLessThan(3);
  // Le plein écran garde la disposition : panneaux cachés en y entrant comme en en sortant.
  await page.keyboard.press("Control+Meta+F");
  await expect.poll(() => fullScreen(page)).toBe(true);
  await expect(folders(page)).toBeHidden();
  await page.keyboard.press("Meta+0");
  await expect(folders(page)).toBeVisible();
  await expect(notes(page)).toBeVisible();
  await expectColumnsFill(page, [0.5, 0.5]);
  await page.keyboard.press("Meta+0");
  await expect(notes(page)).toBeHidden();
  await page.keyboard.press("Escape");
  await expect.poll(() => fullScreen(page)).toBe(false);
  await expect(notes(page)).toBeHidden();
  // Le choix est gardé d'un lancement à l'autre.
  await page.reload();
  await expect(page.locator(".cm-line").first()).toContainText("Alpha");
  await expect(folders(page)).toBeHidden();
  // Les deux colonnes reviennent aussi au relancement (disposition gardée).
  await expectColumnsFill(page, [0.5, 0.5]);
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  // Palette de commandes.
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("panneaux");
  await page.keyboard.press("Enter");
  await expect(folders(page)).toBeVisible();
  await expectColumnsFill(page, [0.5, 0.5]);
});

test("la ligne en cours reste au milieu quand les panneaux se cachent", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "Machine à écrire" }).click();
  await columns(page).nth(0).locator(".cm-line").nth(2).click();
  for (let i = 0; i < 30; i += 1) await page.keyboard.press("ArrowDown");
  const offCentre = () =>
    page.evaluate(() => {
      const node = window.getSelection()?.focusNode ?? null;
      const element = node instanceof Element ? node : (node?.parentElement ?? null);
      const line = (element?.closest(".cm-line") as HTMLElement).getBoundingClientRect();
      const frame = (element?.closest(".cm-scroller") as HTMLElement).getBoundingClientRect();
      return Math.round(Math.abs((line.top + line.bottom) / 2 - (frame.top + frame.bottom) / 2));
    });
  await expect.poll(offCentre).toBeLessThan(15);
  await page.keyboard.press("Meta+0");
  await expect(folders(page)).toBeHidden();
  await page.keyboard.type("suite");
  await expect.poll(offCentre).toBeLessThan(15);
});

test("le plein écran demandé par le Mac garde aussi les panneaux latéraux", async ({ page }) => {
  await launch(page);
  await page.evaluate(() => window.backend.enterFullScreenFromTheSystem());
  await expect(page.getByRole("button", { name: "Quitter le plein écran" })).toBeVisible();
  await expect(folders(page)).toBeVisible();
  await expect(notes(page)).toBeVisible();
  await expectColumnsFill(page, [1]);
});
