import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const LIBRARY: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\nUne idée.", modified: 20 },
  "Travail/lundi.md": { content: "# Lundi\nréunion", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(LIBRARY),
    folders: JSON.stringify(["Travail"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const titles = (page: Page) => page.locator(".notes-list .note-title");
const editorLines = (page: Page) => page.locator(".cm-line");
const folders = (page: Page) => page.locator(".folders-list .folder-name");
const trashLabels = (page: Page) => page.locator(".trash-label");
const savedPaths = (page: Page) => page.evaluate(() => Object.keys(window.backend.notes).sort());

test("la note ouverte placée dans la corbeille laisse la place à la suivante, puis revient", async ({
  page,
}) => {
  await launch(page);
  await expect(editorLines(page).first()).toHaveText("Courses");
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" et beurre");
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Placer dans la corbeille" }).click();
  await expect(titles(page)).toHaveText(["Idée"]);
  await expect(editorLines(page).first()).toHaveText("Idée");

  await page.getByRole("button", { name: "Corbeille" }).click();
  await expect(page.locator(".library-name")).toHaveText("Corbeille");
  await expect(trashLabels(page)).toHaveText(["Courses"]);
  await expect(page.locator(".trash-origin")).toHaveText(["Notes"]);
  await page.getByRole("button", { name: "Restaurer" }).click();
  await expect(page.getByText("La corbeille est vide")).toBeVisible();
  // Ce qu'on avait tapé n'est pas perdu.
  await expect
    .poll(() => page.evaluate(() => window.backend.notes["courses.md"]?.content))
    .toBe("# Courses\n- pain et beurre");

  await folders(page).first().click();
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);
});

test("la touche Effacer place la note choisie dans la corbeille", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).focus();
  await page.keyboard.press("Backspace");
  await expect(titles(page)).toHaveText(["Courses"]);
  expect(await savedPaths(page)).toEqual(["Travail/lundi.md", "courses.md"]);
});

test("un dossier placé dans la corbeille part avec ses notes et revient entier", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".folder-item", { hasText: "Travail" }).click();
  await expect(titles(page)).toHaveText(["Lundi"]);
  await page.locator(".folder-item", { hasText: "Travail" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Placer dans la corbeille" }).click();
  await expect(folders(page)).toHaveText(["Notes"]);
  await expect(page.locator(".library-name")).toHaveText("Notes");
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);

  await page.getByRole("button", { name: "Corbeille" }).click();
  await expect(trashLabels(page)).toHaveText(["Travail", "Lundi"]);
  await page.locator(".trash-folder").getByRole("button", { name: "Restaurer" }).click();
  await expect(folders(page)).toHaveText(["Notes", "Travail"]);
  expect(await savedPaths(page)).toContain("Travail/lundi.md");
});

test("vider la corbeille demande une confirmation, puis supprime définitivement", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Placer dans la corbeille" }).click();
  await page.getByRole("button", { name: "Corbeille" }).click();
  await page.getByRole("button", { name: "Vider la corbeille" }).click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(trashLabels(page)).toHaveText(["Idée"]);
  await page.getByRole("button", { name: "Vider la corbeille" }).click();
  await page.getByRole("button", { name: "Vider définitivement" }).click();
  await expect(page.getByText("La corbeille est vide")).toBeVisible();
  expect(await savedPaths(page)).toEqual(["Travail/lundi.md", "courses.md"]);
});
