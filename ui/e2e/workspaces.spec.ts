import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\ntexte", modified: 20 },
};
const TRAVAIL: Notes = {
  "reunion.md": { content: "# Réunion\nordre du jour", modified: 50 },
  "budget.md": { content: "# Budget\nchiffres", modified: 40 },
};
const TRAVAIL_FOLDER = "/Users/moi/Travail";

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    spaces: JSON.stringify({ [TRAVAIL_FOLDER]: TRAVAIL }),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".workspace-switcher")).toHaveText("Notes");
  await waitForLaunchedNote(page, NOTES);
}

const switcher = (page: Page) => page.locator(".workspace-switcher");
const bar = (page: Page) => page.locator(".workspace-bar");
const titles = (page: Page) => page.locator(".note-title");
const menuEntries = (page: Page) => page.locator(".context-menu button");
const tabs = (page: Page) => page.getByRole("tab");
const tabTitles = (page: Page) => page.locator(".tab-title");

async function menuChoice(page: Page, label: string) {
  await switcher(page).click();
  await page.locator(".context-menu").getByRole("menuitem", { name: label, exact: true }).click();
}

/** Ajoute le dossier Travail par le sélecteur, sous le nom `name` (celui du dossier par défaut). */
async function addTravail(page: Page, name?: string) {
  await page.evaluate((folder) => (window.backend.nextFolder = folder), TRAVAIL_FOLDER);
  await menuChoice(page, "Ajouter un espace de travail…");
  await expect(page.locator(".name-prompt-input")).toHaveValue("Travail");
  if (name !== undefined) await page.locator(".name-prompt-input").fill(name);
  await page.getByRole("button", { name: "Ajouter" }).click();
}

test("ajouter un espace de travail : choisir un dossier, le nommer ; ce qui est tapé avant est enregistré", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-content").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" frais");
  await addTravail(page, "Bureau");
  await expect(switcher(page)).toHaveText("Bureau");
  await expect(titles(page)).toHaveText(["Réunion", "Budget"]);
  await expect(page.locator(".folders-list")).toContainText("Bureau");
  await switcher(page).click();
  await expect(menuEntries(page)).toHaveText([
    "Notes",
    "✓Bureau ouvert",
    "Ajouter un espace de travail…",
    "Renommer l'espace de travail…",
    "Retirer « Notes » de la liste…",
  ]);
  await page.keyboard.press("Escape");
  await page.locator(".workspace-switcher").click();
  await page.locator(".context-menu").getByRole("menuitem", { name: "Notes", exact: true }).click();
  await expect(titles(page).first()).toHaveText("Courses");
  const saved = await page.evaluate(() => window.backend.notes["courses.md"]?.content);
  expect(saved).toContain("frais");
});

test("passer d'un espace à l'autre, au clavier aussi, retrouve les colonnes de chacun", async ({
  page,
}) => {
  await launch(page);
  await titles(page).filter({ hasText: "Idée" }).click();
  await expect(tabTitles(page)).toHaveText(["Courses", "Idée"]);
  await addTravail(page);
  await titles(page).filter({ hasText: "Budget" }).click();
  await expect(tabs(page).filter({ hasText: "Budget" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Meta+Shift+E");
  await expect(page.locator(".picker-option")).toHaveText(["Notes", "Travailouvert"]);
  await page.keyboard.type("not");
  await page.keyboard.press("Enter");
  await expect(switcher(page)).toHaveText("Notes");
  await expect(tabTitles(page)).toHaveText(["Courses", "Idée"]);
  await expect(tabs(page).filter({ hasText: "Idée" })).toHaveAttribute("aria-selected", "true");
  await bar(page).click();
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: "Travail", exact: true })
    .click();
  await expect(switcher(page)).toHaveText("Travail");
  await expect(tabs(page).filter({ hasText: "Budget" })).toHaveAttribute("aria-selected", "true");
});

test("la barre du pied des dossiers montre l'espace ouvert et ouvre au-dessus d'elle le menu des espaces", async ({
  page,
}) => {
  await launch(page);
  await addTravail(page, "Bureau");
  await expect(bar(page)).toHaveText("Bureau");
  await expect(bar(page)).toHaveAccessibleName("Espace de travail : Bureau");
  const bounds = async (selector: string) =>
    (await page.locator(selector).boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  const settings = await bounds("[data-settings]");
  const barBox = await bounds(".workspace-bar");
  const folders = await bounds(".folders");
  expect(barBox.y).toBeGreaterThan(settings.y + settings.height - 1);
  expect(barBox.x).toBeGreaterThanOrEqual(folders.x);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(folders.x + folders.width + 1);
  await bar(page).click();
  const menu = await bounds(".context-menu");
  expect(menu.y + menu.height).toBeLessThanOrEqual(barBox.y);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  await expect(menuEntries(page)).toHaveText([
    "Notes",
    "✓Bureau ouvert",
    "Ajouter un espace de travail…",
    "Renommer l'espace de travail…",
    "Retirer « Notes » de la liste…",
  ]);
  await expect(page.getByRole("menuitemcheckbox", { name: "Bureau ouvert" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Notes", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(bar(page)).toHaveText("Notes");
  await expect(titles(page).first()).toHaveText("Courses");
  await bar(page).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".context-menu")).toHaveCount(0);
  await expect(bar(page)).toBeFocused();
});

test("l'ancienne ligne « Changer d'espace de travail » du bas de la liste des notes a disparu", async ({
  page,
}) => {
  await launch(page);
  await expect(page.locator(".notes-panel")).not.toContainText("Changer d'espace de travail");
});

test("renommer l'espace ouvert ne change que son nom, et un nom pris est refusé", async ({
  page,
}) => {
  await launch(page);
  await addTravail(page);
  await menuChoice(page, "Renommer l'espace de travail…");
  await expect(page.locator(".name-prompt-input")).toHaveValue("Travail");
  await page.locator(".name-prompt-input").fill("notes");
  await page.keyboard.press("Enter");
  await expect(page.locator(".status")).toContainText(
    "un espace de travail s'appelle déjà « Notes »",
  );
  await menuChoice(page, "Renommer l'espace de travail…");
  await page.locator(".name-prompt-input").fill("Bureau");
  await page.keyboard.press("Enter");
  await expect(switcher(page)).toHaveText("Bureau");
  await expect(titles(page)).toHaveText(["Réunion", "Budget"]);
  expect(await page.evaluate(() => Object.keys(window.backend.notes).sort())).toEqual([
    "budget.md",
    "reunion.md",
  ]);
});

test("retirer un espace l'oublie sans toucher à ses notes ; un dossier déjà pris est refusé", async ({
  page,
}) => {
  await launch(page);
  await addTravail(page);
  await page.evaluate(() => (window.backend.nextFolder = "/Users/moi/Notes"));
  await menuChoice(page, "Ajouter un espace de travail…");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.locator(".status")).toContainText(
    "ce dossier est déjà l'espace de travail « Notes »",
  );
  await menuChoice(page, "Retirer « Notes » de la liste…");
  await expect(page.locator(".confirmation-question")).toContainText(
    "Ses notes restent dans leur dossier.",
  );
  await page.getByRole("button", { name: "Retirer" }).click();
  await switcher(page).click();
  await expect(menuEntries(page)).toHaveText([
    "✓Travail ouvert",
    "Ajouter un espace de travail…",
    "Renommer l'espace de travail…",
  ]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window.backend.nextFolder = "/Users/moi/Notes"));
  await addNotesAgain(page);
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);
});

/** Rajoute le dossier Notes, retiré plus tôt : ses notes sont toujours là. */
async function addNotesAgain(page: Page) {
  await menuChoice(page, "Ajouter un espace de travail…");
  await expect(page.locator(".name-prompt-input")).toHaveValue("Notes");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(switcher(page)).toHaveText("Notes");
}

test("au relancement, la liste revient et l'espace ouvert en dernier est rouvert", async ({
  page,
}) => {
  await launch(page);
  await addTravail(page, "Bureau");
  await page.reload();
  await expect(switcher(page)).toHaveText("Bureau");
  await expect(titles(page)).toHaveText(["Réunion", "Budget"]);
  await switcher(page).click();
  await expect(menuEntries(page).first()).toHaveText("Notes");
  await expect(menuEntries(page).nth(1)).toHaveText("✓Bureau ouvert");
});
