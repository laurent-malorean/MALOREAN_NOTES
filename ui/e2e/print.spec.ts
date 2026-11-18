import { expect, type Page, test } from "@playwright/test";

const VOYAGE = "---\ntags: [loin]\n---\n# Voyage\nUn *beau* départ.";
const WORKSPACE = {
  "voyage.md": { content: VOYAGE, modified: 20 },
  "courses.md": { content: "# Courses\n- [x] pain", modified: 10 },
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

const printed = (page: Page) => page.evaluate(() => window.backend.printed);

test("Cmd+P imprime la note de la colonne active, mise en forme, ce qui est tapé compris", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Fin.");
  await page.keyboard.press("Meta+P");
  await expect
    .poll(() => printed(page))
    .toEqual(["<h1>Voyage</h1><p>Un <em>beau</em> départ. Fin.</p>"]);
  await expect(page.locator(".print-sheet")).toBeHidden();
  const saved = await page.evaluate(() => window.backend.notes["voyage.md"]?.content);
  expect(saved).toBe(`${VOYAGE} Fin.`);
});

test("la palette, le menu d'une note de la liste et celui d'un onglet impriment aussi", async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("Imprimer");
  await page.getByRole("option", { name: /Imprimer…/ }).click();
  await expect.poll(async () => (await printed(page)).length).toBe(1);

  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Imprimer…", exact: true }).click();
  await expect.poll(async () => (await printed(page)).length).toBe(2);
  expect((await printed(page))[1]).toBe(
    '<h1>Courses</h1><ul><li><input type="checkbox" disabled="" checked=""> pain</li></ul>',
  );

  await page.getByRole("tab", { name: /Voyage/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Imprimer…", exact: true }).click();
  await expect.poll(async () => (await printed(page)).length).toBe(3);
  expect((await printed(page))[2]).toBe("<h1>Voyage</h1><p>Un <em>beau</em> départ.</p>");
});
