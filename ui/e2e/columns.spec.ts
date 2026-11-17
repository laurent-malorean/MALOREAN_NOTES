import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const LIBRARY: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\n## Détail\ntexte", modified: 20 },
  "vieille-note.md": { content: "# Vieille note\ntexte", modified: 10 },
};

async function launch(page: Page, notes: Notes = LIBRARY) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const firstLine = (page: Page, index: number) =>
  columns(page).nth(index).locator(".cm-line").first();
const split = (page: Page) => page.getByTitle("Diviser la colonne").first();
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

test("diviser ouvre la même note dans une colonne à droite, où s'ouvre la note choisie ensuite", async ({
  page,
}) => {
  await launch(page);
  await expect(columns(page)).toHaveCount(1);
  await split(page).click();
  await expect(columns(page)).toHaveCount(2);
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(firstLine(page, 1)).toHaveText("Courses");
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(firstLine(page, 1)).toHaveText("Idée");
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Idée");
});

test("on écrit dans chaque colonne, chacune enregistre sa note, la liste suit la colonne active", async ({
  page,
}) => {
  await launch(page);
  await split(page).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await columns(page).nth(1).locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" à droite");
  await columns(page).nth(0).locator(".cm-line").last().click();
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  await page.keyboard.press("End");
  await page.keyboard.type(" frais");
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- pain frais");
  await expect
    .poll(() => savedContent(page, "vieille-note.md"))
    .toBe("# Vieille note\ntexte à droite");
});

test("le plan et la recherche dans la note suivent la colonne active", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "Plan" }).click();
  const outline = page.getByRole("navigation", { name: "Plan de la note" });
  await expect(outline.locator(".outline-item")).toHaveText(["Courses"]);
  await split(page).click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(outline.locator(".outline-item")).toHaveText(["Idée", "Détail"]);
  await firstLine(page, 0).click();
  await expect(outline.locator(".outline-item")).toHaveText(["Courses"]);
  await page.keyboard.press("Meta+F");
  await expect(columns(page).nth(0).locator(".cm-search")).toBeVisible();
  await expect(columns(page).nth(1).locator(".cm-search")).toHaveCount(0);
});

test("pas plus de trois colonnes", async ({ page }) => {
  await launch(page);
  await split(page).click();
  await split(page).click();
  await expect(columns(page)).toHaveCount(3);
  await expect(page.getByTitle("Diviser la colonne")).toHaveCount(3);
  for (const button of await page.getByTitle("Diviser la colonne").all()) {
    await expect(button).toBeHidden();
  }
});

test("glisser le séparateur règle la largeur des deux colonnes voisines", async ({ page }) => {
  await launch(page);
  await split(page).click();
  const widthOf = async (index: number) =>
    (await columns(page).nth(index).boundingBox())?.width ?? 0;
  const before = await widthOf(0);
  expect(Math.abs(before - (await widthOf(1)))).toBeLessThan(2);
  const divider = (await page.getByRole("separator").boundingBox()) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2 + 120, divider.y + divider.height / 2);
  await page.mouse.up();
  await expect.poll(() => widthOf(0)).toBeGreaterThan(before + 100);
  expect(await widthOf(1)).toBeLessThan(before - 100);
});
