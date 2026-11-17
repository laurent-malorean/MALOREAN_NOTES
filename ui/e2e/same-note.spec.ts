import { expect, type Page, test } from "@playwright/test";

// La même note ouverte dans deux colonnes : un seul texte, un seul enregistrement.
const LINES = Array.from({ length: 80 }, (_, index) => `ligne ${index + 1}`);
const LONG_NOTE = `# Courses\n${LINES.join("\n")}`;

async function launch(page: Page) {
  const notes = { "courses.md": { content: LONG_NOTE, modified: 10 } };
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const column = (page: Page, index: number) =>
  page.getByRole("region", { name: "Colonne" }).nth(index);
const line = (page: Page, index: number, text: string) =>
  column(page, index).locator(".cm-line", { hasText: new RegExp(`^${text}$`) });
const top = async (page: Page, index: number, text: string) =>
  (await line(page, index, text).boundingBox())?.y ?? Number.NaN;
/** De combien « ligne 60 » a bougé à droite ; une fraction de pixel vient de l'arrondi du défilement. */
const shift = async (page: Page, before: number) =>
  Math.abs((await top(page, 1, "ligne 60")) - before);
/** Fait défiler la colonne jusqu'à montrer la ligne `text`. */
async function scrollTo(page: Page, index: number, text: string) {
  await column(page, index).locator(".cm-content").hover();
  await expect(async () => {
    await page.mouse.wheel(0, 300);
    await expect(line(page, index, text)).toBeInViewport({ timeout: 100 });
  }).toPass();
}
const savedNotes = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.entries(window.backend.notes).map(([p, n]) => [p, n.content])),
  );

test("la même note dans deux colonnes : ce qu'on tape d'un côté apparaît de l'autre, sans déplacer son texte, et s'enregistre une fois", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await expect(line(page, 1, "Courses")).toBeVisible();

  // La colonne de droite descend vers la fin de la note, son curseur sur « ligne 60 ».
  await scrollTo(page, 1, "ligne 60");
  await line(page, 1, "ligne 60").click();
  await page.keyboard.press("End");
  const before = await top(page, 1, "ligne 60");

  // À gauche, on écrit tout en haut, hors de la vue de la colonne de droite.
  await line(page, 0, "Courses").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ajout en haut");
  await expect(line(page, 0, "ajout en haut")).toBeVisible();
  // La colonne de droite garde son texte à sa place.
  await expect.poll(() => shift(page, before)).toBeLessThan(1);

  // À gauche, on écrit sur une ligne que la colonne de droite montre : elle y apparaît aussitôt.
  await scrollTo(page, 0, "ligne 58");
  await line(page, 0, "ligne 58").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" depuis la gauche");
  await expect(line(page, 1, "ligne 58 depuis la gauche")).toBeVisible();
  expect(await shift(page, before)).toBeLessThan(1);

  // À droite, on écrit à son tour : la gauche le voit, et la note enregistrée a les deux.
  await line(page, 1, "ligne 61").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" depuis la droite");
  await expect(line(page, 0, "ligne 61 depuis la droite")).toBeVisible();
  const expected = LONG_NOTE.replace("# Courses", "# Courses\najout en haut")
    .replace("ligne 58\n", "ligne 58 depuis la gauche\n")
    .replace("ligne 61\n", "ligne 61 depuis la droite\n");
  await expect.poll(() => savedNotes(page)).toEqual({ "courses.md": expected });
});
