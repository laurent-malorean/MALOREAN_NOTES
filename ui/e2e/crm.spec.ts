import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// CRM (fiche 0060), à la souris : création par le menu Fichier et par le clic droit sur un dossier ou
// sur la racine. Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

const NOTES = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
};

async function launch(page: Page, notes: Record<string, { content: string; modified: number }>) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(["Clients"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

test("un CRM se crée par le menu Fichier : un nom vide est refusé, Échap annule", async ({
  page,
}) => {
  await launch(page, NOTES);
  await choose(page, "new-crm");
  const ask = page.getByRole("dialog", { name: "Nom du nouveau CRM" });
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("textbox").fill("Prospects");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await savedContent(page, "prospects.md")).toBe("---\ntype: crm\n---\n# Prospects\n");
  await choose(page, "new-crm");
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  expect(await savedContent(page, "prospects-2.md")).toBeNull();
});

test("le clic droit sur un dossier ou sur la racine crée un CRM dedans", async ({ page }) => {
  await launch(page, NOTES);
  await page.locator(".folder-item", { hasText: "Clients" }).click({ button: "right" });
  await page.locator(".context-menu button", { hasText: "Nouveau CRM" }).click();
  const ask = page.getByRole("dialog", { name: "Nom du nouveau CRM" });
  await ask.getByRole("textbox").fill("Dans le dossier");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await savedContent(page, "Clients/dans-le-dossier.md")).toBe(
    "---\ntype: crm\n---\n# Dans le dossier\n",
  );
});
