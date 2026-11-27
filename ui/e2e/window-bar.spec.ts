import { expect, type Page, test } from "@playwright/test";
import tauriConfig from "../../crates/app/tauri.conf.json" with { type: "json" };
import { sidePanelsButton, waitForNote } from "./journey";

// La bande du haut, unique (fiche 0098) : tout en haut, à la place de la barre de titre du Mac, avec le bouton des
// panneaux latéraux à droite des trois boutons de fenêtre du Mac, puis les outils. Bouton visible panneaux cachés comme montrés.

/** Place laissée aux trois boutons de fenêtre du Mac (`--window-bar-inset`). */
const TRAFFIC_LIGHTS = 78;
/** La réserve gauche : les boutons de fenêtre du Mac, le bouton des panneaux (30 points) et un écart (8 points). */
const RESERVE = 116;
/** Avant la bande unique : la barre de la fenêtre (38 points) puis la bande du haut (2 x 9,6 + 37,2 points). */
const OLD_TOP_OF_COLUMNS = 94.4;
/** Ce que la bande unique doit gagner en hauteur : une barre de la fenêtre, moins sa ligne de séparation. */
const MINIMUM_GAIN = 37;

async function launch(page: Page, width = 1400, height = 700) {
  await page.setViewportSize({ width, height });
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

/** Où le milieu de la première ligne de la bande est demandé aux boutons de fenêtre du Mac (`trafficLightPosition.y`). */
const trafficLightY = (): number => tauriConfig.app.windows[0]?.trafficLightPosition.y ?? NaN;

test("une seule bande tout en haut : les outils y sont, les panneaux et les colonnes commencent dessous", async ({
  page,
}) => {
  await launch(page);
  await expect(bar(page)).toHaveCount(1);
  const rect = await box(bar(page));
  expect(rect.x).toBe(0);
  expect(rect.y).toBe(0);
  expect(rect.width).toBe(1400);
  // Hauteur d'une pilule de la barre d'outils (37,2) et deux marges de 8 points, plus la ligne de séparation.
  expect(rect.height).toBeCloseTo(54.2, 0);
  await expect(bar(page)).toHaveAttribute("data-tauri-drag-region", "");
  // Les outils et le bouton sont dans la bande : aucune autre barre au-dessus ni à côté.
  await expect(bar(page).locator(".format-bar")).toHaveCount(1);
  await expect(bar(page).locator(".display-tools")).toHaveCount(1);
  await expect(bar(page).locator(".search-field")).toHaveCount(1);
  await expect(bar(page).getByRole("button", { name: "Panneaux latéraux" })).toHaveCount(1);
  await expect(page.locator(".editor .editor-tools")).toHaveCount(0);
  // Le haut de la fenêtre n'a que la bande : l'espace de travail commence à 0 et les listes juste dessous.
  expect((await box(page.locator(".main-area"))).y).toBe(0);
  const header = await box(folders(page).locator(".side-panel-header"));
  expect(header.y).toBeGreaterThanOrEqual(rect.y + rect.height - 0.5);
  const notesHeader = await box(notes(page).locator(".side-panel-header"));
  expect(notesHeader.y).toBeGreaterThanOrEqual(rect.y + rect.height - 0.5);
  const columns = await box(page.locator(".columns"));
  expect(columns.y).toBeGreaterThanOrEqual(rect.y + rect.height - 0.5);
  // Hauteur d'écran gagnée : le haut des colonnes monte d'une barre de la fenêtre (38 points, moins la ligne de séparation).
  expect(OLD_TOP_OF_COLUMNS - columns.y).toBeGreaterThanOrEqual(MINIMUM_GAIN);
  expect(rect.height).toBeLessThanOrEqual(56);
});

test("le bouton est à droite de la réserve des boutons de fenêtre du Mac, centré sur la première ligne, et se clique à l'aise", async ({
  page,
}) => {
  await launch(page);
  const button = sidePanelsButton(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("title", "Panneaux latéraux (Cmd+0)");
  await expect(button).toHaveText("");
  await expect(button.locator("svg")).toHaveCount(1);
  const rect = await box(button);
  expect(rect.x).toBeGreaterThanOrEqual(TRAFFIC_LIGHTS);
  expect(rect.x).toBeLessThan(TRAFFIC_LIGHTS + 20);
  expect(rect.width).toBeGreaterThanOrEqual(28);
  expect(rect.height).toBeGreaterThanOrEqual(28);
  // Centré sur la première ligne de la bande : le milieu de la pilule de mise en forme.
  const pill = await box(page.locator(".format-bar > :nth-child(1)"));
  expect(Math.abs(rect.y + rect.height / 2 - (pill.y + pill.height / 2))).toBeLessThan(1);
  // Les boutons de fenêtre du Mac sont demandés au même milieu (à confirmer à l'œil dans la vraie fenêtre).
  expect(Math.abs(trafficLightY() - (pill.y + pill.height / 2))).toBeLessThan(1);
  // Un seul contrôle pour cette action : le bloc d'affichage ne l'a plus.
  await expect(page.getByRole("button", { name: /Panneaux/ })).toHaveCount(1);
  await expect(page.locator(".display-tools").getByRole("button")).toHaveCount(5);
});

test("la réserve gauche reste libre : aucun outil ne passe dessous, panneaux montrés ou cachés", async ({
  page,
}) => {
  await launch(page, 900);
  for (const hidden of [false, true]) {
    if (hidden) await sidePanelsButton(page).click();
    const reserve = await box(page.locator(".window-left"));
    expect(reserve.x).toBe(0);
    expect(Math.round(reserve.width)).toBeLessThanOrEqual(RESERVE);
    expect(reserve.width).toBeGreaterThanOrEqual(RESERVE - 1);
    const tools = await page
      .locator(".window-bar .editor-tools button, .window-bar .editor-tools input")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, right: rect.right };
        }),
      );
    expect(tools.length).toBe(18);
    for (const tool of tools) expect(tool.x).toBeGreaterThanOrEqual(RESERVE - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  }
});

test("on saisit la bande par un vide pour déplacer la fenêtre, jamais par un bouton ni par le champ", async ({
  page,
}) => {
  await launch(page);
  const dragRegionAt = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const hit = document.elementFromPoint(px as number, py as number);
        return hit?.hasAttribute("data-tauri-drag-region") ?? false;
      },
      [x, y],
    );
  const middle = (await box(bar(page))).height / 2;
  // Dans la réserve des boutons de fenêtre du Mac, au-dessus de la liste des notes, dans la marge du haut, entre les blocs.
  expect(await dragRegionAt(30, middle)).toBe(true);
  expect(await dragRegionAt(300, middle)).toBe(true);
  expect(await dragRegionAt(700, 3)).toBe(true);
  const first = await box(page.locator(".format-bar > :nth-child(1)"));
  const second = await box(page.locator(".format-bar > :nth-child(2)"));
  expect(await dragRegionAt((first.x + first.width + second.x) / 2, middle)).toBe(true);
  // Un bouton, le champ de recherche : ils gardent leur clic.
  for (const target of [
    sidePanelsButton(page),
    page.locator(".display-tools button").first(),
    page.locator(".format-bar button").first(),
    page.locator(".search-field"),
  ]) {
    const rect = await box(target);
    expect(await dragRegionAt(rect.x + rect.width / 2, rect.y + rect.height / 2)).toBe(false);
  }
});

test("panneaux cachés, les outils sont décalés mais n'enterrent pas le bouton : il reçoit le clic, et la réserve se saisit", async ({
  page,
}) => {
  await launch(page);
  await sidePanelsButton(page).click();
  await expect(folders(page)).toBeHidden();
  expect(
    await page.evaluate(() =>
      document.elementFromPoint(30, 20)?.hasAttribute("data-tauri-drag-region"),
    ),
  ).toBe(true);
  const rect = await box(sidePanelsButton(page));
  const hit = await page.evaluate(
    ([x, y]) => {
      const element = document.elementFromPoint(x as number, y as number);
      return element?.closest("button")?.getAttribute("aria-label") ?? null;
    },
    [rect.x + rect.width / 2, rect.y + rect.height / 2],
  );
  expect(hit).toBe("Panneaux latéraux");
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

test("fenêtre de 1100 × 720 : deux lignes d'outils panneaux montrés (la zone n'a que 620 points), une ligne panneaux cachés", async ({
  page,
}) => {
  await launch(page, 1100, 720);
  // Les deux listes (200 et 280 points) laissent 620 points : moins que les 705 qu'il faut pour une ligne (fiche 0072).
  const tight = await box(bar(page));
  expect(tight.height).toBeGreaterThan(90);
  expect(tight.height).toBeLessThanOrEqual(100);
  // Les listes cachées, la zone de l'éditeur a plus de 900 points : une seule ligne, la bande à sa hauteur d'une ligne.
  await sidePanelsButton(page).click();
  await expect.poll(async () => (await box(bar(page))).height).toBeLessThanOrEqual(56);
  expect((await box(bar(page))).height).toBeCloseTo(54.2, 0);
});
