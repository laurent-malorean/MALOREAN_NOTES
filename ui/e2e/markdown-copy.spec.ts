import { expect, type Page, test } from "@playwright/test";

const VOYAGE = "---\ntags: [loin]\n---\n# Voyage\nUn *beau* départ.\n\n- [ ] valise";
const WORKSPACE = {
  "voyage.md": { content: VOYAGE, modified: 20 },
  "courses.md": { content: "# Courses\n- [x] **pain**\n- lait", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").nth(3)).toHaveText("Voyage");
}

const copied = (page: Page) => page.evaluate(() => window.backend.copiedMarkdown);

test("Ctrl+Cmd+C copie le texte Markdown de la note active tel quel, en-tête compris", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").nth(4).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Fin.");
  await page.keyboard.press("Meta+Control+C");
  await expect(page.locator(".status")).toContainText("Markdown copié");
  expect(await copied(page)).toEqual([
    "---\ntags: [loin]\n---\n# Voyage\nUn *beau* départ. Fin.\n\n- [ ] valise",
  ]);
  expect(await page.evaluate(() => window.backend.copied)).toEqual([]);
});

test("depuis la palette, une sélection est copiée seule, syntaxe comprise", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-line").nth(4).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("Copier en Markdown");
  await page.getByRole("option", { name: /Copier en Markdown/ }).click();
  await expect(page.locator(".status")).toContainText("Sélection copiée");
  expect(await copied(page)).toEqual(["Un *beau* départ."]);
});

test("le menu d'une note de la liste et celui d'un onglet copient la note cliquée en Markdown", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copier en Markdown", exact: true }).click();
  await expect.poll(() => copied(page)).toEqual(["# Courses\n- [x] **pain**\n- lait"]);

  await page.getByRole("tab", { name: /Voyage/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copier en Markdown", exact: true }).click();
  await expect.poll(async () => (await copied(page)).length).toBe(2);
  expect((await copied(page))[1]).toBe(VOYAGE);
});
