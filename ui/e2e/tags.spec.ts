import { expect, type Page, test } from "@playwright/test";

const WORKSPACE = {
  "courses.md": { content: "---\ntags: [perso, maison]\n---\n# Courses\npain", modified: 30 },
  "Travail/budget.md": { content: "---\ntags: [travail]\n---\n# Budget", modified: 20 },
  "Loisirs/rando.md": { content: "---\ntags: [perso]\n---\n# Randonnée", modified: 10 },
  "idee.md": { content: "# Idée", modified: 5 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(["Loisirs", "Travail"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").nth(3)).toHaveText("Courses");
}

const titles = (page: Page) => page.locator(".notes-list .note-title");
const filterBar = (page: Page) => page.locator(".tag-filter");
const tagsList = (page: Page) => page.getByRole("navigation", { name: "Étiquettes" });

test("les étiquettes se voient sous la date ; un clic filtre tout l'espace de travail ; la croix retire le filtre", async ({
  page,
}) => {
  await launch(page);
  const courses = page.locator(".note-item", { hasText: "Courses" });
  await expect(courses.locator(".note-tag")).toHaveText(["#perso", "#maison"]);
  await expect(page.locator(".note-item", { hasText: "Idée" }).locator(".note-tag")).toHaveCount(0);
  await expect(tagsList(page).locator(".tag-item")).toHaveText([
    "#maison1",
    "#perso2",
    "#travail1",
  ]);
  await expect(filterBar(page)).toBeHidden();

  await courses.locator(".note-tag", { hasText: "#perso" }).click();
  await expect(titles(page)).toHaveText(["Courses", "Randonnée"]);
  await expect(filterBar(page)).toBeVisible();
  await expect(filterBar(page)).toContainText("#perso");
  await expect(page.locator(".workspace-name")).toHaveText("#perso");
  await expect(tagsList(page).locator(".tag-item.selected")).toHaveText("#perso2");

  await filterBar(page).getByRole("button", { name: "Retirer le filtre" }).click();
  await expect(filterBar(page)).toBeHidden();
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);
  await expect(page.locator(".workspace-name")).toHaveText("Notes");
});

test("la liste des étiquettes filtre ; Échap retire le filtre ; choisir un dossier aussi", async ({
  page,
}) => {
  await launch(page);
  await tagsList(page).locator(".tag-item", { hasText: "travail" }).click();
  await expect(titles(page)).toHaveText(["Budget"]);
  await expect(page.locator(".cm-line").nth(3)).toHaveText("Budget");
  await page.keyboard.press("Escape");
  await expect(filterBar(page)).toBeHidden();
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);

  await tagsList(page).locator(".tag-item", { hasText: "perso" }).click();
  await expect(titles(page)).toHaveText(["Courses", "Randonnée"]);
  await page.locator(".folder-item", { hasText: "Travail" }).click();
  await expect(filterBar(page)).toBeHidden();
  await expect(titles(page)).toHaveText(["Budget"]);
});

test("la recherche porte sur tout l'espace de travail ; vidée, le filtre revient", async ({
  page,
}) => {
  await launch(page);
  await tagsList(page).locator(".tag-item", { hasText: "perso" }).click();
  await expect(titles(page)).toHaveText(["Courses", "Randonnée"]);
  await page.locator(".search-field").fill("budget");
  await expect(page.locator(".search-result .note-title")).toHaveText(["Budget"]);
  await expect(filterBar(page)).toBeHidden();
  await page.locator(".search-field").press("Escape");
  await expect(filterBar(page)).toBeVisible();
  await expect(titles(page)).toHaveText(["Courses", "Randonnée"]);
});

test("une étiquette ajoutée en écrivant entre dans la liste des étiquettes", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-line").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type(", jardin");
  await expect(tagsList(page).locator(".tag-item")).toHaveText([
    "#jardin1",
    "#maison1",
    "#perso2",
    "#travail1",
  ]);
  await expect(page.locator(".note-item", { hasText: "Courses" }).locator(".note-tag")).toHaveText([
    "#perso",
    "#maison",
    "#jardin",
  ]);
});
