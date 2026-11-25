// Lier un contenu sans saisir son nom : `[[` (complétion sous le curseur) et `/` (menu « Lien
// vers… ») ouvrent une seule liste de tout ce qu'on peut lier, avec l'icône de chaque type ;
// deux contenus de même nom se distinguent par leur dossier, et le lien écrit le contient.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

const NOTES: Notes = {
  "brouillon.md": { content: "# Brouillon\n", modified: 50 },
  "courses.md": { content: "# Courses\nlait", modified: 40 },
  "Vieux/courses.md": { content: "# Courses\npain", modified: 30 },
  "plan.canvas": { content: "{}", modified: 20 },
  "carte.md": { content: "---\ntype: carte-mentale\n---\n# Ma carte\n", modified: 10 },
};

async function launch(page: Page, notes: Notes = NOTES) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, notes);
}

const saved = (page: Page, path = "brouillon.md") =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const menu = (page: Page) => page.locator(".link-menu");
const options = (page: Page) => page.locator(".link-menu-option");

async function typeInNote(page: Page, text: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(text);
}

test("[[ ouvre la liste de tout ce qu'on peut lier, chaque ligne avec l'icône de son type et son dossier", async ({
  page,
}) => {
  await launch(page);
  await typeInNote(page, "[[");
  await expect(menu(page)).toBeVisible();
  await expect(options(page)).toHaveCount(5);
  await expect(options(page).locator("svg")).toHaveCount(5);
  await expect(
    options(page).filter({ hasText: "Courses" }).locator(".link-menu-detail"),
  ).toHaveText(["Racine", "Vieux"]);
  await expect(options(page).filter({ hasText: "Plan" })).toHaveCount(1);
  await expect(options(page).filter({ hasText: "Ma carte" })).toHaveCount(1);
});

test("chaque lettre filtre, les flèches et Entrée choisissent, le lien est écrit entre crochets", async ({
  page,
}) => {
  await launch(page);
  await typeInNote(page, "voir [[ma c");
  await expect(options(page)).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => saved(page)).toContain("voir [[Ma carte]]");
});

test("à la souris : un clic sur une ligne écrit le lien", async ({ page }) => {
  await launch(page);
  await typeInNote(page, "[[bro");
  await options(page).first().click();
  await expect.poll(() => saved(page)).toContain("[[Brouillon]]");
});

test("deux contenus de même nom : le menu montre le dossier de chacun et le lien écrit le contient", async ({
  page,
}) => {
  await launch(page);
  await typeInNote(page, "[[cour");
  await expect(options(page)).toHaveCount(2);
  await expect(options(page).locator(".link-menu-detail")).toHaveText(["Racine", "Vieux"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("[[Vieux/Courses]]");
});

test("un canvas se lie par le nom de son fichier, avec son extension", async ({ page }) => {
  await launch(page);
  await typeInNote(page, "[[pla");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("[[plan.canvas]]");
});

test("/ en début de ligne ouvre le menu « Lien vers… », qui ne propose que des liens", async ({
  page,
}) => {
  await launch(page);
  await typeInNote(page, "/");
  await expect(menu(page).locator(".link-menu-title")).toHaveText("Lien vers…");
  await expect(page.getByRole("listbox", { name: "Lien vers…" })).toBeVisible();
  await expect(menu(page).getByRole("button")).toHaveCount(0);
  await page.keyboard.type("ma");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("\n[[Ma carte]]");
});

test("/ après une espace ouvre le menu, mais pas collé à un mot", async ({ page }) => {
  await launch(page);
  await typeInNote(page, "et/ou");
  await expect(menu(page)).toBeHidden();
  await page.keyboard.type(" /");
  await expect(menu(page)).toBeVisible();
});

test("Échap ferme le menu sans rien écrire", async ({ page }) => {
  await launch(page);
  await typeInNote(page, "[[bro");
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await page.keyboard.type("u");
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => saved(page)).toContain("[[brou");
});
