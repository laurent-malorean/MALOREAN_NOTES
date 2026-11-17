import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

async function launch(page: Page, notes: Notes) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

/** Place le curseur à la fin de la note ouverte. */
async function typeAtEnd(page: Page) {
  await page.locator(".cm-line").last().click();
  await page.keyboard.press("Meta+ArrowDown");
}

test("une liste continue à la ligne et s'arrête sur un élément vide", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\n- pain", modified: 1 } });
  await typeAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("lait");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("fin");
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- pain\n- lait\nfin");
});

test("Échap ferme la recherche dans la note sans quitter le plein écran", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain\npain", modified: 1 } });
  await page.getByRole("button", { name: "Plein écran" }).click();
  await typeAtEnd(page);
  await page.keyboard.press("Meta+F");
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  expect(await page.evaluate(() => window.backend.fullScreen)).toBe(true);
});

test("remplacer partout dans la note enregistre le résultat", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain\npain", modified: 1 } });
  await typeAtEnd(page);
  await page.keyboard.press("Meta+F");
  await page.keyboard.type("pain");
  await page.locator(".cm-search input[name=replace]").fill("brioche");
  await page.getByRole("button", { name: "tout remplacer" }).click();
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\nbrioche\nbrioche");
});
