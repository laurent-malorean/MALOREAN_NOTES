import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Tout se fait sans raccourci clavier : à la souris, par la barre des menus, un bouton ou le clic droit.

const NOTES = {
  "voyage.md": { content: "# Voyage\npain frais\nvoir [[Courses]] demain", modified: 20 },
  "courses.md": { content: "# Courses\n- lait", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

test("la mise en forme et la date du jour se choisissent dans le menu Format", async ({ page }) => {
  await launch(page);
  await page
    .locator(".cm-line")
    .nth(1)
    .dblclick({ position: { x: 10, y: 5 } });
  await choose(page, "bold");
  await expect
    .poll(() => savedContent(page, "voyage.md"))
    .toBe("# Voyage\n**pain** frais\nvoir [[Courses]] demain");
  await choose(page, "heading-2");
  await expect.poll(() => savedContent(page, "voyage.md")).toMatch(/^# Voyage\n## \*\*pain\*\*/);
  await choose(page, "insert-date");
  await expect
    .poll(() => savedContent(page, "voyage.md"))
    .toMatch(/^# Voyage\n## \*\*\d{1,2}(er)? [a-zéû]+ \d{4}\*\* frais\n/);
});

test("un clic dans un lien entre notes puis « Ouvrir le lien » ouvre la note visée", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-note-link", { hasText: "Courses" }).click();
  await choose(page, "open-link");
  // Le curseur arrive en tête de la note ouverte : la syntaxe de son titre se montre.
  await waitForNote(page, /^(# )?Courses$/);
});

test("une fenêtre de choix ouverte par le menu se ferme d'un clic à côté", async ({ page }) => {
  await launch(page);
  await choose(page, "command-palette");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(palette).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(palette).toBeHidden();
  await choose(page, "quick-open");
  await page.getByRole("option", { name: /Courses/ }).click();
  await waitForNote(page, "Courses");
});
