import { expect, type Page, test } from "@playwright/test";

const NOTES = {
  "idee.md": { content: "# Idée", modified: 3 },
  "Travail/bilan.md": { content: "# Bilan", modified: 2 },
  "Travail/Réunions/lundi.md": { content: "# Lundi", modified: 1 },
};
const FOLDERS = ["Perso", "Travail", "Travail/Réunions"];

async function launch(page: Page, notes: object = NOTES, folders: string[] = FOLDERS) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(folders),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const folderNames = (page: Page) => page.locator(".folders-list .folder-name");
const folderItem = (page: Page, path: string) => page.locator(`.folder-item[data-path="${path}"]`);
const toggle = (page: Page, path: string) => folderItem(page, path).locator(".folder-toggle");
const titles = (page: Page) => page.locator(".note-title");

test("on plie un dossier par sa flèche ; il reste plié au relancement, et se déplie au clavier", async ({
  page,
}) => {
  await launch(page);
  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail", "Réunions"]);
  await expect(page.locator(".folders-list .folder-icon")).toHaveCount(4);
  await expect(folderItem(page, "Travail")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page, "Perso").locator("svg")).toHaveCount(0);

  await toggle(page, "Travail").click();
  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail"]);
  await expect(folderItem(page, "Travail")).toHaveAttribute("aria-expanded", "false");
  // La flèche ne choisit pas le dossier.
  await expect(page.locator(".folder-item.selected")).toHaveText("Notes");
  await expect(titles(page)).toHaveText(["Idée"]);

  await page.reload();

  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail"]);
  await expect(folderItem(page, "Travail")).toHaveAttribute("aria-expanded", "false");

  await folderItem(page, "Travail").focus();
  await page.keyboard.press("ArrowRight");
  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail", "Réunions"]);
  await page.keyboard.press("ArrowLeft");
  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail"]);

  // Cliquer le nom choisit le dossier, comme avant ; il reste plié.
  await folderItem(page, "Travail").click();
  await expect(titles(page)).toHaveText(["Bilan"]);
  await expect(folderItem(page, "Travail")).toHaveAttribute("aria-expanded", "false");
});

test("une note glissée sur un dossier plié y va toujours", async ({ page }) => {
  await launch(page);
  await toggle(page, "Travail").click();
  await page.locator(".note-item", { hasText: "Idée" }).dragTo(folderItem(page, "Travail"));
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.backend.notes).sort()))
    .toContain("Travail/idee.md");
  await expect(folderNames(page)).toHaveText(["Notes", "Perso", "Travail"]);
});

test("une bibliothèque à un seul niveau de dossiers se plie par sa racine, et le reste au relancement", async ({
  page,
}) => {
  const notes = {
    "idee.md": { content: "# Idée", modified: 2 },
    "archives/vieux.md": { content: "# Vieux", modified: 1 },
  };
  await launch(page, notes, ["archives"]);
  await expect(folderNames(page)).toHaveText(["Notes", "archives"]);
  await expect(folderItem(page, "")).toHaveAttribute("aria-expanded", "true");

  await toggle(page, "").click();
  await expect(folderNames(page)).toHaveText(["Notes"]);
  await expect(folderItem(page, "")).toHaveAttribute("aria-expanded", "false");
  await expect(titles(page)).toHaveText(["Idée"]);

  await page.reload();

  await expect(folderNames(page)).toHaveText(["Notes"]);
  await expect(folderItem(page, "")).toHaveAttribute("aria-expanded", "false");

  await toggle(page, "").click();
  await expect(folderNames(page)).toHaveText(["Notes", "archives"]);
  await expect(folderItem(page, "")).toHaveAttribute("aria-expanded", "true");
});
