import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const WORKSPACE: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\ntexte", modified: 20 },
  "vieille-note.md": { content: "# Vieille note\ntexte", modified: 10 },
};

async function launch(page: Page, notes: Notes = WORKSPACE) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const tabs = (page: Page, index: number) => columns(page).nth(index).getByRole("tab");
const activeTab = (page: Page, index: number) =>
  columns(page).nth(index).locator('[role="tab"][aria-selected="true"]');
const firstLine = (page: Page, index: number) =>
  columns(page).nth(index).locator(".cm-line").first();
const widthOf = async (page: Page, index: number) =>
  (await columns(page).nth(index).boundingBox())?.width ?? 0;

/** Glisse le séparateur des deux colonnes vers la droite. */
async function widenLeft(page: Page, by: number) {
  const box = await page.getByRole("separator").boundingBox();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by, y);
  await page.mouse.up();
}

test("au relancement, les colonnes reviennent avec leurs largeurs, leurs onglets, leurs onglets actifs et la colonne active", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await firstLine(page, 0).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await tabs(page, 1).filter({ hasText: "Courses" }).click();
  const before = await widthOf(page, 0);
  await widenLeft(page, 120);
  await expect.poll(() => widthOf(page, 0)).toBeGreaterThan(before + 100);
  const widths = [await widthOf(page, 0), await widthOf(page, 1)];

  await page.reload();

  await expect(columns(page)).toHaveCount(2);
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Vieille note×"]);
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Idée×"]);
  await expect(activeTab(page, 0)).toHaveText("Vieille note×");
  await expect(activeTab(page, 1)).toHaveText("Courses×");
  await expect(firstLine(page, 0)).toHaveText("Vieille note");
  await expect(firstLine(page, 1)).toHaveText("Courses");
  // La colonne active choisit la note sélectionnée de la liste.
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  expect(Math.abs((await widthOf(page, 0)) - (widths[0] as number))).toBeLessThan(2);
  expect(Math.abs((await widthOf(page, 1)) - (widths[1] as number))).toBeLessThan(2);
});

test("au relancement, les notes disparues sont oubliées et une colonne sans onglet se ferme", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await firstLine(page, 0).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Vieille note×"]);

  const { "vieille-note.md": kept } = WORKSPACE;
  await launch(page, { "vieille-note.md": kept as Notes[string] });

  await expect(columns(page)).toHaveCount(1);
  await expect(tabs(page, 0)).toHaveText(["Vieille note×"]);
  await expect(firstLine(page, 0)).toHaveText("Vieille note");
});

test("s'il ne reste rien des colonnes gardées, l'application démarre comme d'habitude", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×"]);

  const { "vieille-note.md": kept } = WORKSPACE;
  await launch(page, { "vieille-note.md": kept as Notes[string] });

  await expect(columns(page)).toHaveCount(1);
  await expect(tabs(page, 0)).toHaveText(["Vieille note×"]);
});

test("une disposition gardée abîmée n'empêche pas de démarrer", async ({ page }) => {
  await launch(page);
  await page.evaluate(() => localStorage.setItem("malorean.layout:/Users/moi/Notes", "{abîmée"));
  await page.reload();
  await expect(columns(page)).toHaveCount(1);
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
  await expect(firstLine(page, 0)).toHaveText("Courses");
});
