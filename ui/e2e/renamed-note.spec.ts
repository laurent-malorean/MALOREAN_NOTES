import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const WORKSPACE: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\ntexte", modified: 20 },
};

async function launch(page: Page, folders: string[] = []) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(folders),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const tabs = (page: Page, index: number) => columns(page).nth(index).getByRole("tab");
const firstLine = (page: Page, index: number) =>
  columns(page).nth(index).locator(".cm-line").first();
const status = (page: Page) => page.locator(".status");

/** Deux colonnes : Courses montrée à gauche, et en onglet caché à droite derrière Idée. */
async function courseInBackground(page: Page) {
  await page.getByTitle("Diviser la colonne").first().click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Idée×"]);
  await expect(firstLine(page, 1)).toHaveText("Idée");
}

/** Revenir à l'onglet caché de Courses, à droite : il montre la note, sans erreur. */
async function backToCourses(page: Page, title: string) {
  await tabs(page, 1).first().click();
  await expect(firstLine(page, 1)).toHaveText(title);
  await expect(status(page)).not.toContainText("n'existe pas");
}

test("le titre tapé renomme la note dans tous ses onglets, même cachés, qui la montrent ensuite", async ({
  page,
}) => {
  await launch(page);
  await courseInBackground(page);
  await firstLine(page, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await expect(tabs(page, 1)).toHaveText(["Courses bio×", "Idée×"]);
  await expect(tabs(page, 0)).toHaveText(["Courses bio×"]);
  await backToCourses(page, "Courses bio");
});

test("une note glissée dans un dossier reste ouverte dans ses onglets cachés", async ({ page }) => {
  await launch(page, ["Perso"]);
  await courseInBackground(page);
  await page
    .locator(".note-item", { hasText: "Courses" })
    .dragTo(page.locator(".folder-item", { hasText: "Perso" }));
  await expect(page.locator(".note-title")).toHaveText(["Idée"]);
  await backToCourses(page, "Courses");
});

test("une note dont le titre change hors de l'application met à jour ses onglets cachés", async ({
  page,
}) => {
  await launch(page);
  await courseInBackground(page);
  await firstLine(page, 0).click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×"]);
  await page.evaluate(() => window.backend.changeOutside("courses.md", "# Marché\n- pain"));
  await expect(tabs(page, 0)).toHaveText(["Marché×", "Idée×"]);
  await expect(tabs(page, 1)).toHaveText(["Marché×", "Idée×"]);
  await backToCourses(page, "Marché");
});

test("une note renommée hors de l'application reste ouverte dans tous ses onglets", async ({
  page,
}) => {
  await launch(page);
  await courseInBackground(page);
  await page.evaluate(() =>
    window.backend.renameOutside("courses.md", "marche.md", "# Marché\n- pain"),
  );
  await expect(tabs(page, 1)).toHaveText(["Marché×", "Idée×"]);
  await expect(tabs(page, 0)).toHaveText(["Marché×"]);
  await expect(status(page)).not.toContainText("supprimée");
  await backToCourses(page, "Marché");
});
