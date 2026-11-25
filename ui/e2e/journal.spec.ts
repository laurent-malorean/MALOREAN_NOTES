import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const WORKSPACE: Notes = {
  "courses.md": { content: "# Courses\npain", modified: 30 },
  "Modèles/journal.md": { content: "# Journal\n## Humeur à {{time}}\n", modified: 10 },
};
const TODAY = "Journal/2026-11-16.md";

async function launch(page: Page, notes: Notes = WORKSPACE, folders = ["Modèles"]) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(folders),
    remembered: "1",
    journal: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const tabs = (page: Page) => page.getByRole("region", { name: "Colonne" }).getByRole("tab");
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const dailyNotes = (page: Page) =>
  page.evaluate(() => Object.keys(window.backend.notes).filter((p) => p.endsWith("2026-11-16.md")));

test("au lancement, la note du jour est créée dans le journal et ouverte ; au relancement, elle est rouverte, sans doublon", async ({
  page,
}) => {
  await launch(page);
  await expect(tabs(page)).toHaveText(["Courses×", "16 novembre 2026×"]);
  await expect(page.locator(".cm-line").first()).toHaveText(/16 novembre 2026$/);
  expect(await savedContent(page, TODAY)).toBe("# 16 novembre 2026\n");
  await expect(page.locator(".folder-item", { hasText: "Journal" })).toBeVisible();

  await page.locator(".cm-line").last().click();
  await page.keyboard.type("Il fait beau.");
  await expect.poll(() => savedContent(page, TODAY)).toBe("# 16 novembre 2026\nIl fait beau.");

  // Relancement sur l'espace de travail tel qu'il est maintenant sur le disque.
  const notes = await page.evaluate(() => window.backend.notes);
  const folders = await page.evaluate(() => window.backend.folders);
  await launch(page, notes, folders);
  await expect(page.locator(".cm-line").nth(1)).toHaveText("Il fait beau.");
  await expect(tabs(page)).toHaveText(["Courses×", "16 novembre 2026×"]);
  expect(await dailyNotes(page)).toEqual([TODAY]);
});

test("Cmd+Maj+J ouvre la note du jour depuis le modèle Journal, dans le dossier choisi ; la case décochée n'ouvre rien au lancement", async ({
  page,
}) => {
  await launch(page);
  await expect(tabs(page)).toHaveText(["Courses×", "16 novembre 2026×"]);
  await page.getByRole("button", { name: "Réglages" }).click();
  const dialog = page.getByRole("dialog", { name: "Réglages" });
  await dialog.getByRole("tab", { name: "Écriture" }).click();
  await dialog.getByLabel("Dossier des modèles").selectOption({ label: "Modèles" });
  // Le dossier du journal se choisit dans la liste : « Nouveau dossier… » en crée un au besoin.
  await dialog.getByLabel("Dossier du journal").selectOption({ label: "Nouveau dossier…" });
  await dialog.getByLabel("Nom du nouveau dossier").fill("Carnet");
  await dialog.getByLabel("Nom du nouveau dossier").press("Enter");
  await expect(dialog.getByLabel("Dossier du journal")).toHaveValue("Carnet");
  await dialog.getByLabel("Créer la note du jour au lancement").uncheck();
  await dialog.getByRole("button", { name: "Fermer" }).click();

  await page.keyboard.press("Meta+Shift+J");
  await expect(tabs(page)).toHaveText(["Courses×", "16 novembre 2026×", "16 novembre 2026×"]);
  expect(await savedContent(page, "Carnet/2026-11-16.md")).toBe(
    "# 16 novembre 2026\n## Humeur à 18:30\n",
  );
  await expect(page.locator(".folder-item", { hasText: "Carnet" })).toBeVisible();

  await page.keyboard.press("Meta+Shift+J");
  await expect(tabs(page)).toHaveCount(3);

  await launch(page);
  await expect(page.locator(".cm-line").first()).toHaveText(/./);
  await expect(tabs(page).first()).toBeVisible();
  expect(await dailyNotes(page)).toEqual([]);
});

test("les deux dossiers des réglages se choisissent dans une liste en arborescence ; « Nouveau dossier… » refuse un nom invalide et Échap l'annule sans fermer les réglages", async ({
  page,
}) => {
  await launch(page, WORKSPACE, ["Modèles", "Notes", "Notes/Travail"]);
  await page.getByRole("button", { name: "Réglages" }).click();
  const dialog = page.getByRole("dialog", { name: "Réglages" });
  await dialog.getByRole("tab", { name: "Écriture" }).click();
  const texts = (label: string) => dialog.getByLabel(label).locator("option").allTextContents();
  expect(await texts("Dossier des modèles")).toEqual([
    "Aucun",
    "Journal",
    "Modèles",
    "Notes",
    "⎿ Travail",
  ]);
  expect((await texts("Dossier du journal")).at(-1)).toBe("Nouveau dossier…");

  const journal = dialog.getByLabel("Dossier du journal");
  await journal.selectOption({ label: "Nouveau dossier…" });
  const name = dialog.getByLabel("Nom du nouveau dossier");
  await name.fill("a/b");
  await name.press("Enter");
  await expect(dialog.getByText("Ce nom ne convient pas")).toBeVisible();
  await name.press("Escape");
  await expect(name).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(journal).toHaveValue("Journal");
});
