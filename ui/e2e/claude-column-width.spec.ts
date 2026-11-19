import { expect, type Page, test } from "@playwright/test";
import { dragEdge, edgesOf, waitForNote, widthOf } from "./journey";

// Largeur de la colonne Claude Code : on tire son bord gauche à la souris, la largeur reste entre
// son minimum et son maximum, les colonnes d'édition prennent le reste, et elle revient au
// relancement.

const NOTES = { "alpha.md": { content: "# Alpha\nPremière note.", modified: 20 } };

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const claude = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const claudeEdge = (page: Page) =>
  page.getByRole("separator", { name: "Largeur de la colonne Claude Code" });
const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });

async function openClaude(page: Page) {
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await expect(claude(page)).toBeVisible();
}

/** Les colonnes d'édition s'arrêtent juste avant la colonne Claude Code, qui finit au bord. */
async function expectColumnsBeforeClaude(page: Page) {
  const column = await edgesOf(claude(page));
  expect(column.right).toBe(page.viewportSize()?.width);
  await expect.poll(async () => (await edgesOf(columns(page).last())).right - column.left).toBe(0);
  expect((await edgesOf(page.locator(".editor"))).right).toBe(column.left);
}

test("on tire le bord gauche de la colonne Claude Code ; sa largeur revient au relancement", async ({
  page,
}) => {
  await launch(page);
  await openClaude(page);
  expect(await widthOf(claude(page))).toBe(340);

  // Au survol, le bord s'éclaire et montre le curseur de redimensionnement.
  const before = await claudeEdge(page).evaluate((e) => getComputedStyle(e).backgroundColor);
  await claudeEdge(page).hover();
  const lit = await claudeEdge(page).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(lit).not.toBe(before);
  expect(await claudeEdge(page).evaluate((e) => getComputedStyle(e).cursor)).toBe("col-resize");

  await dragEdge(page, claudeEdge(page), -80);
  expect(await widthOf(claude(page))).toBe(420);
  await expectColumnsBeforeClaude(page);

  await page.reload();
  await waitForNote(page, "Alpha");
  await openClaude(page);
  expect(await widthOf(claude(page))).toBe(420);
  await expectColumnsBeforeClaude(page);
});

test("ni trop étroite ni trop large ; un double-clic rend la largeur par défaut", async ({
  page,
}) => {
  await launch(page);
  await openClaude(page);
  await dragEdge(page, claudeEdge(page), 200);
  // Au moins 16rem.
  expect(await widthOf(claude(page))).toBe(256);
  await dragEdge(page, claudeEdge(page), -600);
  // Au plus 35 % de la fenêtre (1280 pixels de large).
  expect(await widthOf(claude(page))).toBe(448);
  await expectColumnsBeforeClaude(page);

  await claudeEdge(page).dblclick();
  expect(await widthOf(claude(page))).toBe(340);
  await page.reload();
  await waitForNote(page, "Alpha");
  await openClaude(page);
  expect(await widthOf(claude(page))).toBe(340);
});

test("avec trois colonnes, panneaux cachés puis en plein écran, la largeur réglée reste", async ({
  page,
}) => {
  await launch(page);
  const split = page.getByTitle("Diviser la colonne").first();
  await split.click();
  await split.click();
  await expect(columns(page)).toHaveCount(3);
  await openClaude(page);
  await dragEdge(page, claudeEdge(page), -60);
  expect(await widthOf(claude(page))).toBe(400);
  await expectColumnsBeforeClaude(page);

  const panels = page.getByRole("button", { name: "Panneaux" });
  await panels.click();
  expect((await edgesOf(columns(page).first())).left).toBe(0);
  expect(await widthOf(claude(page))).toBe(400);
  await dragEdge(page, claudeEdge(page), -40);
  expect(await widthOf(claude(page))).toBe(440);
  await expectColumnsBeforeClaude(page);

  await page.getByRole("button", { name: "Plein écran" }).click();
  await expect.poll(() => page.evaluate(() => window.backend.fullScreen)).toBe(true);
  expect(await widthOf(claude(page))).toBe(440);
  await panels.click();
  await dragEdge(page, claudeEdge(page), 100);
  expect(await widthOf(claude(page))).toBe(340);
  await expectColumnsBeforeClaude(page);
});
