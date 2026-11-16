import { expect, type Page, test } from "@playwright/test";

const LIBRARY = {
  "courses.md": { content: "# Courses\n- pain", modified: 20 },
  "idee.md": { content: "# Idée\ntexte", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(LIBRARY),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
}

const lines = (page: Page) => page.locator(".cm-line");
const titles = (page: Page) => page.locator(".note-title");
const content = (page: Page, path: string) =>
  page.evaluate((p) => window.backend.notes[p]?.content ?? null, path);
const changeOutside = (page: Page, path: string, text: string | null) =>
  page.evaluate(([p, t]) => window.backend.changeOutside(p ?? "", t ?? null), [path, text]);

test("une note ajoutée hors de l'application apparaît dans la liste", async ({ page }) => {
  await launch(page);
  await changeOutside(page, "nouvelle.md", "# Nouvelle");
  await expect(titles(page)).toContainText(["Nouvelle"]);
});

test("la note ouverte modifiée ailleurs est rechargée quand on n'a rien tapé", async ({ page }) => {
  await launch(page);
  await changeOutside(page, "courses.md", "# Courses\n- pain\n- lait");
  await expect(lines(page)).toHaveText(["Courses", "•pain", "•lait"]);
  expect(await content(page, "courses (conflit 2026-11-16 18h30).md")).toBeNull();
});

test("quand la note change des deux côtés, rien n'est perdu", async ({ page }) => {
  await launch(page);
  await lines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" frais");
  await changeOutside(page, "courses.md", "# Courses\n- lait");
  await expect(page.locator(".status")).toContainText("courses (conflit 2026-11-16 18h30).md");
  await expect.poll(() => content(page, "courses.md")).toBe("# Courses\n- pain frais");
  expect(await content(page, "courses (conflit 2026-11-16 18h30).md")).toBe("# Courses\n- lait");
});

test("une note ouverte supprimée ailleurs garde son texte et revient à la prochaine frappe", async ({
  page,
}) => {
  await launch(page);
  await changeOutside(page, "courses.md", null);
  await expect(page.locator(".status")).toContainText("supprimée hors de l'application");
  await expect(lines(page).first()).toHaveText("Courses");
  await lines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" complet");
  await expect.poll(() => content(page, "courses.md")).toBe("# Courses\n- pain complet");
});
