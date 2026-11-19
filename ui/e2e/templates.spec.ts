import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

const WORKSPACE: Notes = {
  "courses.md": { content: "# Courses\npain", modified: 30 },
  "Travail/budget.md": { content: "# Budget\nchiffres", modified: 20 },
  "Modèles/reunion.md": {
    content:
      "---\ntags: [réunion]\npinned: true\n---\n# Réunion du {{date}}\nÀ {{time}}, d'après « {{title}} ».\n",
    modified: 10,
  },
  "Modèles/journal.md": { content: "# Journal\n{{date}}", modified: 5 },
  "Modèles/Archives/ancien.md": { content: "# Ancien modèle", modified: 1 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(["Modèles", "Modèles/Archives", "Travail"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const picker = (page: Page) => page.getByRole("dialog", { name: "Nouvelle note depuis un modèle" });
const tabs = (page: Page) => page.getByRole("region", { name: "Colonne" }).getByRole("tab");
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

async function chooseTemplatesFolder(page: Page, label: string) {
  await page.getByRole("button", { name: "Réglages" }).click();
  const dialog = page.getByRole("dialog", { name: "Réglages" });
  await dialog.getByLabel("Dossier des modèles").selectOption({ label });
  await dialog.getByRole("button", { name: "Fermer" }).click();
}

test("sans dossier des modèles, l'action le dit", async ({ page }) => {
  await launch(page);
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  await page.keyboard.press("Meta+Shift+N");
  await expect(page.locator(".status")).toContainText("Aucun dossier des modèles");
  await expect(picker(page)).toHaveCount(0);
});

test("une note créée depuis un modèle, dans le dossier affiché, ouverte dans un nouvel onglet", async ({
  page,
}) => {
  await launch(page);
  await chooseTemplatesFolder(page, "Modèles");
  await expect(page.locator(".folder-item", { hasText: "Modèles" }).first()).toBeVisible();
  await page.locator(".folder-item", { hasText: "Travail" }).click();
  await expect(page.locator(".cm-line").first()).toHaveText("Budget");

  await page.keyboard.press("Meta+Shift+N");
  await expect(picker(page).getByRole("option")).toHaveText(["Réunion du {{date}}", "Journal"]);
  await page.keyboard.type("reu");
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeHidden();

  const created = "Travail/reunion-du-16-novembre-2026.md";
  await expect
    .poll(() => savedContent(page, created))
    .toBe(
      "---\ntags: [réunion]\n---\n# Réunion du 16 novembre 2026\nÀ 18:30, d'après « Réunion du 16 novembre 2026 ».\n",
    );
  await expect(tabs(page)).toHaveText(["Budget×", "Réunion du 16 novembre 2026×"]);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".note-title")).toContainText(["Réunion du 16 novembre 2026"]);
  // La liste montre la note avant l'éditeur : attendre qu'il la montre (son en-tête) avant de taper.
  await waitForNote(page, "---");
  await page.keyboard.type("Ordre du jour");
  await expect.poll(() => savedContent(page, created)).toContain("Ordre du jour");
});

test("le dossier des modèles est gardé au relancement, et la palette propose l'action", async ({
  page,
}) => {
  await launch(page);
  await chooseTemplatesFolder(page, "Modèles");
  await page.reload();
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("depuis un modèle");
  await expect(
    page.getByRole("dialog", { name: "Palette de commandes" }).getByRole("option"),
  ).toHaveText(["Nouvelle note depuis un modèleCmd+Maj+N"]);
  await page.keyboard.press("Enter");
  await expect(picker(page).getByRole("option")).toHaveCount(2);
  await page.keyboard.type("journal");
  await page.keyboard.press("Enter");
  await expect.poll(() => savedContent(page, "journal.md")).toBe("# Journal\n16 novembre 2026");

  await chooseTemplatesFolder(page, "Aucun");
  await page.keyboard.press("Meta+Shift+N");
  await expect(page.locator(".status")).toContainText("Aucun dossier des modèles");
});
