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

test("le mode machine à écrire se met en marche, est gardé, puis s'arrête", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain", modified: 1 } });
  const button = page.getByRole("button", { name: "Machine à écrire" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Meta+Shift+T");
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("le bandeau compte les mots, les caractères et les pages de la note", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain lait", modified: 1 } });
  const bar = page.locator(".cm-status-bar");
  await expect(bar).toHaveText("3 mots · 16 caractères · 0 page");
  await typeAtEnd(page);
  await page.keyboard.type(" œufs");
  await expect(bar).toHaveText("4 mots · 21 caractères · 0 page");
});
