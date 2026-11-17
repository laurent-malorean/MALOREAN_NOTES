import { expect, type Page, test } from "@playwright/test";

// Mode machine à écrire avec plusieurs colonnes : où le texte se trouve à l'écran après chaque action.

const longNote = (title: string) =>
  [`# ${title}`, ...Array.from({ length: 120 }, (_, i) => `ligne ${i} de ${title}`)].join("\n");

async function launch(page: Page) {
  const notes = {
    "alpha.md": { content: longNote("Alpha"), modified: 30 },
    "beta.md": { content: longNote("Beta"), modified: 20 },
    "gamma.md": { content: longNote("Gamma"), modified: 10 },
  };
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const typewriter = (page: Page) => page.getByRole("button", { name: "Machine à écrire" });
const openNote = (page: Page, title: string) =>
  page.locator(".note-item", { hasText: title }).click();

/**
 * Distance, en pixels, entre la première ligne de la note d'une colonne et le haut de son texte ;
 * infinie si cette première ligne n'est pas à l'écran.
 */
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

/** Hauteur, depuis le haut de sa colonne, de la ligne où se trouve le curseur. */
const cursorLineTop = (page: Page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.focusNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const line = element?.closest(".cm-line") as HTMLElement;
    const scroller = line.closest(".cm-scroller") as HTMLElement;
    return Math.round(line.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  });

/** Hauteur, depuis le haut de sa colonne, de la ligne de la colonne qui porte ce texte. */
const lineTop = (page: Page, column: number, text: string) =>
  columns(page)
    .nth(column)
    .evaluate((element, wanted) => {
      const scroller = element.querySelector(".cm-scroller") as HTMLElement;
      const lines = [...element.querySelectorAll<HTMLElement>(".cm-line")];
      const line = lines.find((candidate) =>
        candidate.textContent?.includes(wanted),
      ) as HTMLElement;
      return Math.round(line.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
    }, text);

/** Écart, en pixels, entre le milieu de la ligne du curseur et le milieu de sa colonne. */
const cursorOffCentre = (page: Page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.focusNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const line = (element?.closest(".cm-line") as HTMLElement).getBoundingClientRect();
    const frame = (element?.closest(".cm-scroller") as HTMLElement).getBoundingClientRect();
    return Math.round(Math.abs((line.top + line.bottom) / 2 - (frame.top + frame.bottom) / 2));
  });

/** Place le curseur sur une ligne de la colonne, puis le descend de `steps` lignes. */
async function moveDown(page: Page, column: number, steps: number) {
  await columns(page).nth(column).locator(".cm-line").nth(2).click();
  for (let i = 0; i < steps; i += 1) await page.keyboard.press("ArrowDown");
}

test("ouvrir une note, ou diviser, la montre depuis son début dans chaque colonne", async ({
  page,
}) => {
  await launch(page);
  await columns(page).nth(0).locator(".cm-line").first().click();
  await typewriter(page).click();
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.getByTitle("Diviser la colonne").first().click();
  await expect(columns(page)).toHaveCount(2);
  await openNote(page, "Beta");
  await expect(columns(page).nth(1).locator(".cm-line").first()).toContainText("Beta");
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  await expect.poll(() => firstLineFromTop(page, 1)).toBeLessThan(3);
  await page.keyboard.press("Meta+T");
  await page.keyboard.type("Gamma");
  await page.keyboard.press("Enter");
  await expect(columns(page).nth(1).locator(".cm-line").first()).toContainText("Gamma");
  await expect.poll(() => firstLineFromTop(page, 1)).toBeLessThan(3);
});

test("la ligne en cours reste au milieu de la colonne active, et seulement là", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await openNote(page, "Beta");
  await typewriter(page).click();
  await moveDown(page, 1, 20);
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.keyboard.type(" suite");
  await page.keyboard.press("Enter");
  await page.keyboard.type("nouvelle ligne");
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  // L'autre colonne devient active : on y écrit au milieu ; celle qu'on quitte ne bouge pas.
  const left = await lineTop(page, 1, "nouvelle ligne");
  await moveDown(page, 0, 30);
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.keyboard.type("!");
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  expect(Math.abs((await lineTop(page, 1, "nouvelle ligne")) - left)).toBeLessThan(3);
});

test("changer d'onglet montre la note depuis son début, et la ligne revient au milieu dès qu'on écrit", async ({
  page,
}) => {
  await launch(page);
  await typewriter(page).click();
  await moveDown(page, 0, 30);
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.keyboard.press("Meta+T");
  await page.keyboard.type("Beta");
  await page.keyboard.press("Enter");
  await expect(columns(page).locator(".cm-line").first()).toContainText("Beta");
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  await page.keyboard.press("Control+Shift+Tab");
  await expect(columns(page).locator(".cm-line").first()).toContainText("Alpha");
  await expect.poll(() => firstLineFromTop(page, 0)).toBeLessThan(3);
  await moveDown(page, 0, 30);
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
});

test("mis en marche, le mode centre aussitôt la ligne du curseur ; arrêté, il la laisse en place", async ({
  page,
}) => {
  await launch(page);
  await moveDown(page, 0, 20);
  expect(await cursorOffCentre(page)).toBeGreaterThan(50);
  await page.keyboard.press("Meta+Shift+T");
  await expect(typewriter(page)).toHaveAttribute("aria-pressed", "true");
  // Dès la mise en marche, sans rien taper : la ligne du curseur est au milieu.
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  const centred = await cursorLineTop(page);
  await page.keyboard.press("Meta+Shift+T");
  await expect(typewriter(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => Math.abs((await cursorLineTop(page)) - centred)).toBeLessThan(3);
});

test("la ligne en cours revient au milieu quand la fenêtre ou la colonne change de taille", async ({
  page,
}) => {
  await launch(page);
  await typewriter(page).click();
  await moveDown(page, 0, 30);
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.setViewportSize({ width: 1100, height: 480 });
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.getByTitle("Diviser la colonne").first().click();
  await expect(columns(page)).toHaveCount(2);
  await columns(page).nth(0).locator(".cm-line", { hasText: "ligne 30 de" }).click();
  await page.keyboard.type("x");
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect.poll(() => cursorOffCentre(page)).toBeLessThan(15);
});
