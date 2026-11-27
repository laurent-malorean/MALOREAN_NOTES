// La fenêtre des réglages garde la même taille et la même position sur tous les onglets : le titre, les
// onglets et « Fermer » ne bougent pas ; un contenu plus long défile dans la zone de contenu. Rust est remplacé par le faux.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

const NOTES = { "courses.md": { content: "# Courses\n\npain", modified: 30 } };
const TABS = [
  "Affichage",
  "Écriture",
  "Claude",
  "Index",
  "Saisie vocale",
  "Favoris",
  "Brancher une IA",
];
const WIDE = { width: 1280, height: 1000 };
const LOW = { width: 1280, height: 420 };

async function launch(page: Page, size: { width: number; height: number }, theme?: string) {
  await page.setViewportSize(size);
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    remembered: "1",
    connection: "key",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
  if (theme) await page.evaluate((t) => (document.documentElement.dataset.appearance = t), theme);
  await page.getByRole("button", { name: "Réglages" }).click();
  return page.getByRole("dialog", { name: "Réglages" });
}

async function box(target: Locator) {
  const found = await target.boundingBox();
  if (!found) throw new Error("élément absent de l'écran");
  return found;
}

/** Les boîtes de la fenêtre, de son titre, de la rangée d'onglets et de « Fermer », onglet après onglet. */
async function boxesPerTab(page: Page, settings: Locator) {
  const boxes = [];
  for (const name of TABS) {
    await settings.getByRole("tab", { name }).click();
    await expect(settings.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    boxes.push({
      window: await box(settings),
      title: await box(settings.getByRole("heading", { name: "Réglages" })),
      tabs: await box(settings.getByRole("tablist")),
      close: await box(settings.getByRole("button", { name: "Fermer" })),
    });
  }
  return boxes;
}

for (const theme of ["light", "dark"]) {
  test(`la fenêtre a la même boîte sur les six onglets (thème ${theme})`, async ({ page }) => {
    const settings = await launch(page, WIDE, theme);
    const boxes = await boxesPerTab(page, settings);
    expect(boxes).toHaveLength(TABS.length);
    for (const each of boxes) expect(each).toEqual(boxes[0]);
    const first = boxes[0];
    if (!first) throw new Error("aucun onglet mesuré");
    // « Fermer » en bas à droite de la fenêtre, tout entière dans la fenêtre de l'application.
    expect(first.close.x + first.close.width).toBeLessThanOrEqual(
      first.window.x + first.window.width,
    );
    expect(first.close.y + first.close.height).toBeLessThanOrEqual(
      first.window.y + first.window.height,
    );
    expect(first.window.y).toBeGreaterThan(0);
    expect(first.window.y + first.window.height).toBeLessThan(WIDE.height);
    // Même largeur qu'avant : 46 rem au plus.
    expect(first.window.width).toBeLessThanOrEqual(46 * 16 + 1);
    expect(first.window.width).toBeGreaterThan(40 * 16);
  });
}

test("dans une fenêtre d'application très basse, la boîte reste la même et « Fermer » reste à l'écran", async ({
  page,
}) => {
  const settings = await launch(page, LOW);
  const boxes = await boxesPerTab(page, settings);
  for (const each of boxes) {
    expect(each).toEqual(boxes[0]);
    expect(each.window.y).toBeGreaterThanOrEqual(0);
    expect(each.close.y + each.close.height).toBeLessThanOrEqual(LOW.height);
    expect(each.window.y + each.window.height).toBeLessThanOrEqual(LOW.height);
  }
});

test("un onglet plus haut que la fenêtre défile dans sa zone de contenu, titre et « Fermer » immobiles", async ({
  page,
}) => {
  const settings = await launch(page, LOW);
  await settings.getByRole("tab", { name: "Brancher une IA" }).click();
  const panel = settings.getByRole("tabpanel");
  const scrolls = await panel.evaluate((p) => p.scrollHeight > p.clientHeight);
  expect(scrolls).toBe(true);
  const before = await box(settings.getByRole("button", { name: "Fermer" }));
  await panel.evaluate((p) => (p.scrollTop = p.scrollHeight));
  expect(await panel.evaluate((p) => p.scrollTop)).toBeGreaterThan(0);
  expect(await box(settings.getByRole("button", { name: "Fermer" }))).toEqual(before);
  expect(await settings.evaluate((s) => s.scrollTop)).toBe(0);
});

test("dans une grande fenêtre, aucun onglet ne défile pour rien", async ({ page }) => {
  const settings = await launch(page, WIDE);
  for (const name of TABS) {
    await settings.getByRole("tab", { name }).click();
    const panel = settings.getByRole("tabpanel");
    expect(await panel.evaluate((p) => p.scrollHeight - p.clientHeight)).toBeLessThanOrEqual(1);
  }
});
