import { expect, type Page, test } from "@playwright/test";

const VOYAGE = "---\ntags: [loin]\n---\n# Voyage\nUn *beau* départ.\n\n```js\nlet a = 1;\n```";
const WORKSPACE = {
  "voyage.md": { content: VOYAGE, modified: 20 },
  "courses.md": { content: "# Courses\n- [x] pain\n- lait", modified: 10 },
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

const copied = (page: Page) => page.evaluate(() => window.backend.copied);

test("Cmd+Maj+C copie la note active en HTML aux styles en ligne et en texte brut", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").nth(4).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Fin.");
  await page.keyboard.press("Meta+Shift+C");
  await expect(page.locator(".status")).toContainText("Note copiée");
  const [copy] = await copied(page);
  expect(copy?.text).toBe("Voyage\n\nUn beau départ. Fin.\n\nlet a = 1;");
  // Les couleurs et les polices sont dans les attributs, aucune classe ne reste.
  expect(copy?.html).toMatch(/^<div style="color: #[0-9a-f]{6}; font-family: [^"]+; font-size: /);
  expect(copy?.html).toMatch(/<h1 style="font-size: 1\.8em">Voyage<\/h1>/);
  expect(copy?.html).toMatch(/<span style="color: #[0-9a-f]{6}">let<\/span>/);
  expect(copy?.html).not.toContain("class=");
  const saved = await page.evaluate(() => window.backend.notes["voyage.md"]?.content);
  expect(saved).toContain("départ. Fin.");
});

test("depuis la palette, une sélection est copiée seule", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-line").nth(4).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("Copier en texte");
  await page.getByRole("option", { name: /Copier en texte mis en forme/ }).click();
  await expect(page.locator(".status")).toContainText("Sélection copiée");
  const [copy] = await copied(page);
  expect(copy?.text).toBe("Un beau départ.");
  expect(copy?.html).toContain("<p>Un <em>beau</em> départ.</p>");
});

test("le menu d'une note de la liste et celui d'un onglet copient la note cliquée", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copier en texte mis en forme", exact: true }).click();
  await expect.poll(async () => (await copied(page)).length).toBe(1);
  const [courses] = await copied(page);
  expect(courses?.text).toBe("Courses\n\n☑ pain\n• lait");
  expect(courses?.html).toContain("<li>☑ pain</li>");

  await page.getByRole("tab", { name: /Voyage/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copier en texte mis en forme", exact: true }).click();
  await expect.poll(async () => (await copied(page)).length).toBe(2);
  expect((await copied(page))[1]?.text).toContain("Un beau départ.");
});
