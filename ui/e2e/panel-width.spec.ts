import { expect, type Page, test } from "@playwright/test";
import { dragEdge as drag, edgesOf as edges, widthOf as width } from "./journey";

// Largeur des panneaux latéraux : on tire le bord des dossiers ou des notes à la souris, la
// largeur reste entre son minimum et son maximum, et revient au relancement.

const NOTES = {
  "idee.md": { content: "# Idée", modified: 2 },
  "comptabilite/impots/declarations.md": {
    content: "# Déclarations de revenus de l'année deux mille vingt-six",
    modified: 1,
  },
};
const FOLDERS = [
  "comptabilite",
  "comptabilite/impots",
  "comptabilite/impots/declarations annuelles",
];

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(FOLDERS),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".note-title").first()).toBeVisible();
}

const folders = (page: Page) => page.locator(".folders");
const notes = (page: Page) => page.locator(".sidebar");
const edge = (page: Page, name: string) => page.getByRole("separator", { name });
const foldersEdge = (page: Page) => edge(page, "Largeur des dossiers");
const notesEdge = (page: Page) => edge(page, "Largeur de la liste des notes");

/** Les colonnes d'édition commencent juste après la liste des notes. */
async function expectEditorAfterNotes(page: Page) {
  const editor = await edges(page.locator(".editor"));
  expect(editor.left).toBe((await edges(notes(page))).right);
}

test("on tire le bord des dossiers puis des notes ; les largeurs reviennent au relancement", async ({
  page,
}) => {
  await launch(page);
  expect(await width(folders(page))).toBe(200);
  expect(await width(notes(page))).toBe(280);

  // Au survol, le bord s'éclaire et montre le curseur de redimensionnement.
  const before = await foldersEdge(page).evaluate((e) => getComputedStyle(e).backgroundColor);
  await foldersEdge(page).hover();
  const lit = await foldersEdge(page).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(lit).not.toBe(before);
  expect(await foldersEdge(page).evaluate((e) => getComputedStyle(e).cursor)).toBe("col-resize");

  await drag(page, foldersEdge(page), 120);
  expect(await width(folders(page))).toBe(320);
  expect((await edges(notes(page))).left).toBe(320);
  await drag(page, notesEdge(page), -50);
  expect(await width(notes(page))).toBe(230);
  await expectEditorAfterNotes(page);

  await page.reload();
  await expect(page.locator(".note-title").first()).toBeVisible();
  expect(await width(folders(page))).toBe(320);
  expect(await width(notes(page))).toBe(230);
  await expectEditorAfterNotes(page);
});

test("ni trop étroit ni trop large ; un double-clic rend la largeur par défaut", async ({
  page,
}) => {
  await launch(page);
  await drag(page, foldersEdge(page), -150);
  // Au moins 9rem.
  expect(await width(folders(page))).toBe(144);
  await drag(page, notesEdge(page), 400);
  // Au plus 30 % de la fenêtre (1280 pixels de large).
  expect(await width(notes(page))).toBe(384);
  await expectEditorAfterNotes(page);

  await foldersEdge(page).dblclick();
  expect(await width(folders(page))).toBe(200);
  await notesEdge(page).dblclick();
  expect(await width(notes(page))).toBe(280);
  await page.reload();
  await expect(page.locator(".note-title").first()).toBeVisible();
  expect(await width(folders(page))).toBe(200);
  expect(await width(notes(page))).toBe(280);
});

test("panneaux cachés puis montrés, et en plein écran, la largeur réglée reste", async ({
  page,
}) => {
  await launch(page);
  await drag(page, foldersEdge(page), 100);
  const panels = page.getByRole("button", { name: "Panneaux" });
  await panels.click();
  await expect(foldersEdge(page)).toBeHidden();
  expect((await edges(page.locator(".editor"))).left).toBe(0);
  await panels.click();
  expect(await width(folders(page))).toBe(300);

  await page.getByRole("button", { name: "Plein écran" }).click();
  await expect.poll(() => page.evaluate(() => window.backend.fullScreen)).toBe(true);
  expect(await width(folders(page))).toBe(300);
  await drag(page, notesEdge(page), -20);
  expect(await width(notes(page))).toBe(260);
  await expectEditorAfterNotes(page);
});

test("un nom de dossier ou de note coupé montre son nom complet au survol", async ({ page }) => {
  await launch(page);
  const deep = page.locator(".folder-name", { hasText: "declarations annuelles" });
  await deep.hover();
  await expect(deep).toHaveAttribute("title", "declarations annuelles");
  const short = page.locator(".folder-name", { hasText: /^comptabilite$/ });
  await short.hover();
  await expect(short).not.toHaveAttribute("title");

  await page.locator(".folder-item", { hasText: "impots" }).first().click();
  const title = page.locator(".note-title", { hasText: "Déclarations" });
  await title.hover();
  await expect(title).toHaveAttribute(
    "title",
    "Déclarations de revenus de l'année deux mille vingt-six",
  );

  // Le panneau élargi, le nom entier tient : plus rien au survol.
  await drag(page, foldersEdge(page), 180);
  await deep.hover();
  await expect(deep).not.toHaveAttribute("title");
});
