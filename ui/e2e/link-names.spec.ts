// Liens à la Obsidian, par le nom seul : un lien ambigu est signalé au lieu d'ouvrir au hasard,
// le dossier devant le nom le précise, `nom.canvas` ouvre un canvas.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote, waitForNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

const NOTES: Notes = {
  "lundi.md": {
    content:
      "# Lundi\nVoir [[Courses]], [[Vieux/Courses]], [[plan.canvas]] et [[Agenda]]\n\n[[Courses|ma liste]]",
    modified: 50,
  },
  "courses.md": { content: "# Courses\nlait", modified: 40 },
  "Vieux/courses.md": { content: "# Courses\npain", modified: 30 },
  "agenda.md": { content: "# Agenda\nrendez-vous", modified: 20 },
  "plan.canvas": { content: "{}", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
}

const link = (page: Page, text: string) => page.locator(".cm-note-link", { hasText: text });

test("un lien ambigu est souligné, les autres non, avec une bulle qui dit comment le préciser", async ({
  page,
}) => {
  await launch(page);
  const ambiguous = page.locator(".cm-note-link-ambiguous");
  await expect(ambiguous).toHaveText(["Courses", "ma liste"]);
  await expect(ambiguous.first()).toHaveAttribute("title", /écrivez le dossier devant/);
  await expect(link(page, "Vieux/Courses")).not.toHaveClass(/ambiguous/);
  await expect(link(page, "Agenda")).not.toHaveClass(/ambiguous/);
  await expect(link(page, "plan.canvas")).not.toHaveClass(/ambiguous/);
});

test("un clic sur un lien ambigu n'ouvre aucun contenu : un message dit de préciser le dossier", async ({
  page,
}) => {
  await launch(page);
  await link(page, "Courses").first().click();
  await expect(page.getByRole("status")).toContainText(
    "Plusieurs contenus portent le nom « Courses »",
  );
  await expect(page.locator(".cm-line").first()).toHaveText("Lundi");
});

test("le dossier devant le nom ouvre le bon contenu", async ({ page }) => {
  await launch(page);
  await link(page, "Vieux/Courses").click();
  await waitForNote(page, "Courses");
  await expect(page.locator(".cm-line").nth(1)).toHaveText("pain");
});

test("un lien vers un nom unique ouvre ce contenu", async ({ page }) => {
  await launch(page);
  await link(page, "Agenda").click();
  await waitForNote(page, "Agenda");
});

test("[[nom.canvas]] ouvre le canvas", async ({ page }) => {
  await launch(page);
  await link(page, "plan.canvas").click();
  await expect(page.locator(".canvas-view")).toBeVisible();
});

test("un lien devient ambigu au fil de la frappe : il est souligné après une courte pause", async ({
  page,
}) => {
  await launch(page);
  await expect(link(page, "Agenda")).not.toHaveClass(/ambiguous/);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type("\n[[Courses");
  await page.keyboard.press("Escape");
  await page.keyboard.type("]]");
  await expect(page.locator(".cm-note-link-ambiguous")).toHaveText([
    "Courses",
    "ma liste",
    "Courses",
  ]);
});
