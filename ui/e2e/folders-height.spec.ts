import { expect, type Locator, type Page, test } from "@playwright/test";

// Hauteur de l'arborescence des dossiers : on tire à la souris la ligne qui la sépare du bloc
// « Récentes » et « Étiquettes » ; chaque zone garde son minimum, un double-clic rend la hauteur par
// défaut, et la hauteur réglée revient au relancement.

const NOTES: Record<string, { content: string; modified: number }> = {};
for (let n = 0; n < 12; n += 1) {
  NOTES[`d${n}/note.md`] = {
    content: `---\ntags: [eti${n}]\n---\n# Note ${n}`,
    modified: n,
  };
}
const FOLDERS = Array.from({ length: 12 }, (_, n) => `d${n}`);

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(FOLDERS),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".folder-item").first()).toBeVisible();
}

const tree = (page: Page) => page.locator(".folders-list");
const bottom = (page: Page) => page.locator(".tags-list");
const handle = (page: Page) =>
  page.getByRole("separator", { name: "Hauteur de l'arborescence des dossiers" });

async function height(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément absent de l'écran");
  return box.height;
}

/** Tire à la souris la poignée de `dy` pixels (vers le bas si positif). */
async function drag(page: Page, dy: number) {
  const box = await handle(page).boundingBox();
  if (!box) throw new Error("poignée absente de l'écran");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 5 });
  await page.mouse.up();
}

const rem = (page: Page) =>
  page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));

test("la poignée s'éclaire au survol et montre le curseur vertical ; on la tire, la hauteur revient au relancement", async ({
  page,
}) => {
  await launch(page);
  const first = await height(tree(page));
  const line = handle(page);
  await expect(line).toBeVisible();

  const before = await line.evaluate((e) => getComputedStyle(e).backgroundColor);
  await line.hover();
  const lit = await line.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(lit).not.toBe(before);
  expect(await line.evaluate((e) => getComputedStyle(e).cursor)).toBe("row-resize");

  await drag(page, -100);
  expect(await height(tree(page))).toBe(first - 100);

  await page.reload();
  await expect(page.locator(".folder-item").first()).toBeVisible();
  // La hauteur gardée est arrondie au pixel.
  expect(await height(tree(page))).toBeCloseTo(first - 100, 0);
});

test("ni trop bas ni trop haut ; un double-clic rend la hauteur par défaut", async ({ page }) => {
  await launch(page);
  const first = await height(tree(page));
  await drag(page, -3000);
  expect(await height(tree(page))).toBe(9 * (await rem(page)));
  await drag(page, 3000);
  expect(await height(bottom(page))).toBe(6 * (await rem(page)));
  await expect(page.locator(".tag-item").nth(1)).toBeInViewport({ ratio: 1 });

  await handle(page).dblclick();
  expect(await height(tree(page))).toBe(first);
  await page.reload();
  await expect(page.locator(".folder-item").first()).toBeVisible();
  expect(await height(tree(page))).toBe(first);
});

test("au clavier, la poignée se règle aux flèches, Début et Fin", async ({ page }) => {
  await launch(page);
  const first = await height(tree(page));
  await handle(page).focus();
  await page.keyboard.press("ArrowUp");
  expect(await height(tree(page))).toBe(first - 16);
  await page.keyboard.press("Home");
  expect(await height(tree(page))).toBe(9 * (await rem(page)));
  await expect(handle(page)).toHaveAttribute("aria-valuenow", String(9 * (await rem(page))));
  await page.keyboard.press("End");
  expect(await height(bottom(page))).toBe(6 * (await rem(page)));
});
