import { expect, type Page, test } from "@playwright/test";

const WORKSPACE = {
  "courses.md": { content: "---\ntags: [perso]\n---\n# Courses\npain", modified: 30 },
  "Travail/budget.md": { content: "# Budget", modified: 20 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(["Travail"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").nth(3)).toHaveText("Courses");
}

test("la palette reconstruit l'index, puis relit dossiers, étiquettes et liste", async ({
  page,
}) => {
  await launch(page);
  await page.evaluate(() => (window.backend.calls.length = 0));
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("index");
  await page.keyboard.press("Enter");
  await expect(page.locator(".status")).toContainText("Index reconstruit");
  const calls = await page.evaluate(() => window.backend.calls);
  expect(calls.slice(0, 4)).toEqual(["rebuild_index", "list_folders", "list_tags", "list_notes"]);
  await expect(page.locator(".notes-list .note-title")).toHaveText(["Courses"]);
  await expect(page.locator(".tag-item")).toHaveText(["#perso1"]);
});
