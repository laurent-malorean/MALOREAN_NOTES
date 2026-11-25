import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Menu de création, à la souris et au clavier, dans le vrai écran : le « + » crée une note d'un clic ; le
// chevron visible à côté, ou un appui prolongé sur le « + », ouvre le menu des contenus à créer dans le
// dossier affiché (rectangles réels mesurés, thèmes clair et sombre).

type Notes = Record<string, { content: string; modified: number }>;

const NOTES: Notes = {
  "courses.md": { content: "# Courses\npain", modified: 30 },
  "Plans/idée.md": { content: "# Idée\nfaire", modified: 20 },
};
const ENTRIES = [
  "Note",
  "Note depuis un modèle",
  "Cahier de recherche",
  "Carte mentale",
  "Canvas",
  "CRM",
];

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["Plans"]),
    remembered: "1",
  });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const plus = (page: Page) => page.locator(".notes-panel [data-new]");
const chevron = (page: Page) => page.getByRole("button", { name: "Nouveau contenu" });
const menu = (page: Page) => page.getByRole("menu");
const items = (page: Page) => menu(page).getByRole("menuitem");
const saved = (page: Page, path: string) =>
  page.evaluate((p) => window.backend.notes[p]?.content ?? null, path);

async function boxOf(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("élément non affiché");
  return box;
}

for (const appearance of ["dark", "light"]) {
  test(`le chevron est visible à droite du « + » dans l'en-tête, et ouvre le menu entier (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page);
    await page.evaluate(
      (value) => (document.documentElement.dataset.appearance = value),
      appearance,
    );
    const header = await boxOf(page, page.locator(".notes-panel .side-panel-header"));
    const p = await boxOf(page, plus(page));
    const c = await boxOf(page, chevron(page));
    expect(c.width).toBeGreaterThan(8);
    // Le dessin lui-même a une surface : un chevron de 0 sur 0 serait invisible.
    const drawing = await boxOf(page, chevron(page).locator("svg"));
    expect(drawing.width).toBeGreaterThanOrEqual(8);
    expect(drawing.height).toBeGreaterThanOrEqual(8);
    expect(c.height).toBeGreaterThan(8);
    expect(c.x).toBeGreaterThanOrEqual(p.x + p.width - 1);
    expect(Math.abs(c.y + c.height / 2 - (p.y + p.height / 2))).toBeLessThanOrEqual(2);
    expect(c.x + c.width).toBeLessThanOrEqual(header.x + header.width);
    await expect(chevron(page)).toHaveAttribute("title", /Nouveau contenu/);

    await chevron(page).click();
    await expect(menu(page).locator(".context-menu-label")).toHaveText(ENTRIES);
    const box = await boxOf(page, menu(page));
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1300);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    expect(box.y).toBeGreaterThanOrEqual(p.y + p.height - 1);
    await expect(menu(page).locator("svg")).toHaveCount(6);
    await expect(items(page).first()).toContainText("Cmd+N");
    await expect(items(page).nth(1)).toContainText("Cmd+Maj+N");
    await chevron(page).click();
    await expect(menu(page)).toHaveCount(0);
  });
}

test("le « + » crée une note d'un clic, sans ouvrir le menu", async ({ page }) => {
  await launch(page);
  const before = await page.locator(".note-item").count();
  await plus(page).click();
  await expect(page.locator(".note-item")).toHaveCount(before + 1);
  await expect(menu(page)).toHaveCount(0);
});

test("un appui prolongé sur le « + » ouvre le menu sans créer de note ; un appui court crée une note", async ({
  page,
}) => {
  await launch(page);
  const before = await page.locator(".note-item").count();
  const p = await boxOf(page, plus(page));
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await expect(menu(page).locator(".context-menu-label")).toHaveText(ENTRIES);
  await page.mouse.up();
  await expect(menu(page)).toBeVisible();
  expect(await page.locator(".note-item").count()).toBe(before);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);

  await plus(page).click();
  await expect(page.locator(".note-item")).toHaveCount(before + 1);
  await expect(menu(page)).toHaveCount(0);
});

test("au clavier : Entrée sur le chevron, flèches, Échap qui rend le focus", async ({ page }) => {
  await launch(page);
  await chevron(page).focus();
  await page.keyboard.press("Enter");
  await expect(items(page).first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items(page).nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(items(page).last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(chevron(page)).toBeFocused();
});

test("chaque entrée crée dans le dossier affiché", async ({ page }) => {
  await launch(page);
  await page.locator(".folder-item", { hasText: "Plans" }).click();
  await expect(page.locator(".cm-line").first()).toHaveText("Idée");

  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "Canvas" }).click();
  const ask = page.getByRole("dialog", { name: "Nom du nouveau canvas" });
  await ask.getByRole("textbox").fill("Plan du menu");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect.poll(() => saved(page, "Plans/plan-du-menu.canvas")).not.toBeNull();

  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "Carte mentale" }).click();
  const map = page.getByRole("dialog", { name: "Nom de la nouvelle carte mentale" });
  await map.getByRole("textbox").fill("Carte du menu");
  await map.getByRole("button", { name: "Créer" }).click();
  await expect.poll(() => saved(page, "Plans/carte-du-menu.md")).toContain("carte-mentale");

  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "CRM" }).click();
  const crm = page.getByRole("dialog", { name: "Nom du nouveau CRM" });
  await crm.getByRole("textbox").fill("CRM du menu");
  await crm.getByRole("button", { name: "Créer" }).click();
  await expect.poll(() => saved(page, "Plans/crm-du-menu.md")).toContain("type: crm");

  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "Cahier de recherche" }).click();
  await expect(page.getByRole("dialog", { name: /cahier/i })).toBeVisible();
  await page.keyboard.press("Escape");

  const before = await page.locator(".note-item").count();
  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "Note", exact: true }).click();
  await expect(page.locator(".note-item")).toHaveCount(before + 1);
});

test("« Note depuis un modèle » dit, comme la commande, qu'aucun dossier des modèles n'est choisi", async ({
  page,
}) => {
  await launch(page);
  await chevron(page).click();
  await menu(page).getByRole("menuitem", { name: "Note depuis un modèle" }).click();
  await expect(page.locator(".status")).toContainText("Aucun dossier des modèles");
});
