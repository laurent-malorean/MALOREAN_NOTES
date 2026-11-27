// Favoris (fiche 0102), à la souris : l'étoile d'un contenu (ajout, retrait, « Annuler »), l'entrée « Favoris » de la
// liste des dossiers, l'onglet « Favoris » des réglages (choisir, créer, ne plus utiliser). Rust est remplacé par le faux.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

const fiche = (type: string, title: string, header: string[] = []) =>
  `---\ntype: ${type}\n${header.map((l) => `${l}\n`).join("")}---\n# ${title}\n`;
const MAP = "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}]\n---\n# Lancement\n\n- Clients\n";
const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 60 },
  "budget.md": { content: "# Budget", modified: 50 },
  "Favoris.md": { content: "# Favoris\n\n## À lire\n- [[Courses]]\n", modified: 40 },
  "carnet.md": { content: fiche("cahier-de-recherche", "Levures"), modified: 30 },
  "lancement.md": { content: MAP, modified: 20 },
  "plan.canvas": { content: '{"nodes":[],"edges":[]}', modified: 15 },
  "clients.md": { content: fiche("crm", "Clients"), modified: 10 },
  "clients/personnes/jean-dupont.md": {
    content: fiche("crm-personne", "Jean Dupont"),
    modified: 1,
  },
};

async function launch(page: Page, options: { favorites?: string } = {}) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["clients"]),
    remembered: "1",
    ...(options.favorites ? { favorites: options.favorites } : {}),
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const star = (page: Page) => page.locator(".column .favorite-star");
const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const entry = (page: Page) => page.locator(".folders").getByRole("button", { name: "Favoris" });
const settings = (page: Page) => page.getByRole("dialog", { name: "Réglages" });
const toast = (page: Page, text: string) => page.locator(".toast", { hasText: text });
const current = (dialog: Locator) => dialog.locator("output");
const openNoteByTitle = (page: Page, title: string) =>
  page.locator(".note-item", { hasText: title }).first().click();

test("l'étoile ajoute un contenu aux favoris, le retire, et « Annuler » remet la ligne à sa place", async ({
  page,
}) => {
  await launch(page, { favorites: "Favoris.md" });
  await openNoteByTitle(page, "Budget");
  await waitForNote(page, "Budget");
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await expect(star(page)).toHaveAttribute("title", "Ajouter aux favoris");

  await star(page).click();
  await expect(toast(page, "Ajouté aux favoris")).toBeVisible();
  await expect(star(page)).toHaveAttribute("aria-pressed", "true");
  await expect(star(page)).toHaveAttribute("title", "Retirer des favoris");
  expect(await saved(page, "Favoris.md")).toBe(
    "# Favoris\n\n## À lire\n- [[Courses]]\n- [[Budget]]\n",
  );

  await star(page).click();
  await expect(toast(page, "Retiré des favoris")).toBeVisible();
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  expect(await saved(page, "Favoris.md")).toBe("# Favoris\n\n## À lire\n- [[Courses]]\n");

  await toast(page, "Retiré des favoris").getByRole("button", { name: "Annuler" }).click();
  await expect(star(page)).toHaveAttribute("aria-pressed", "true");
  expect(await saved(page, "Favoris.md")).toBe(
    "# Favoris\n\n## À lire\n- [[Courses]]\n- [[Budget]]\n",
  );
});

test("un contenu déjà en favori a son étoile pleine, et la note des favoris n'a pas d'étoile", async ({
  page,
}) => {
  await launch(page, { favorites: "Favoris.md" });
  await expect(star(page)).toHaveAttribute("aria-pressed", "true");
  await entry(page).click();
  await waitForNote(page, "Favoris");
  await expect(star(page)).toBeHidden();
});

test("l'étoile est la même, au même endroit, sur une note, un cahier, une carte mentale, un canvas et un CRM, pas sur une fiche", async ({
  page,
}) => {
  await launch(page, { favorites: "Favoris.md" });
  const places: (number | undefined)[] = [];
  for (const title of ["Courses", "Levures", "Lancement", "plan", "Clients"]) {
    await openNoteByTitle(page, title);
    await expect(page.getByRole("tab", { name: title, selected: true })).toBeVisible();
    await expect(star(page)).toBeVisible();
    const box = await star(page).boundingBox();
    const column = await page.locator(".column").first().boundingBox();
    places.push(
      box && column ? Math.round(column.x + column.width - (box.x + box.width)) : undefined,
    );
  }
  // Même distance au bord droit de la colonne sur tous les contenus.
  expect(new Set(places).size).toBe(1);
  await expect(page.locator(".crm-card, .crm-tab").first()).toBeVisible();
  await page.locator(".crm-tab", { hasText: "Personnes" }).click();
  await page.locator(".crm-row .crm-name", { hasText: "Jean Dupont" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Jean Dupont");
  await expect(star(page)).toBeHidden();
});

test("l'entrée « Favoris », au-dessus de « Corbeille », ouvre la note des favoris dans la colonne active", async ({
  page,
}) => {
  await launch(page, { favorites: "Favoris.md" });
  const trash = page.locator(".folders").getByRole("button", { name: "Corbeille" });
  const above = await entry(page).boundingBox();
  const below = await trash.boundingBox();
  expect(above && below && above.y + above.height <= below.y + 1).toBe(true);
  expect(above?.height).toBe(below?.height);
  await entry(page).click();
  await waitForNote(page, "Favoris");
  await expect(page.locator(".cm-content")).toContainText("Courses");
});

test("sans note des favoris, l'entrée « Favoris » ouvre les réglages sur l'onglet « Favoris »", async ({
  page,
}) => {
  await launch(page);
  await entry(page).click();
  await expect(settings(page).getByRole("tab", { name: "Favoris" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(current(settings(page))).toHaveText("Aucune");
  await expect(
    settings(page).getByRole("button", { name: "Ne plus utiliser de note des favoris" }),
  ).toBeDisabled();
});

test("réglages : créer la note des favoris (nom et dossier demandés), l'ouvrir, puis ne plus l'utiliser", async ({
  page,
}) => {
  await launch(page);
  await entry(page).click();
  const dialog = settings(page);
  await dialog.getByRole("button", { name: "Créer la note des favoris" }).click();
  await expect(dialog.getByRole("textbox", { name: "Nom de la note" })).toHaveValue("Favoris");
  await expect(dialog.getByRole("combobox", { name: "Dossier" })).toHaveValue("");
  await dialog.getByRole("textbox", { name: "Nom de la note" }).fill("Mes favoris");
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(current(dialog)).toHaveText("Mes favoris");
  expect(await saved(page, "mes-favoris.md")).toBe("# Mes favoris\n");
  await dialog.getByRole("button", { name: "Fermer" }).click();
  await waitForNote(page, "Mes favoris");
  await expect(star(page)).toBeHidden();

  await page.getByRole("button", { name: "Réglages" }).click();
  await dialog.getByRole("button", { name: "Ne plus utiliser de note des favoris" }).click();
  await expect(current(dialog)).toHaveText("Aucune");
  expect(await saved(page, "mes-favoris.md")).toBe("# Mes favoris\n");
});

test("réglages : un nom vide est refusé par le moteur, son message est montré tel quel", async ({
  page,
}) => {
  await launch(page);
  await entry(page).click();
  const dialog = settings(page);
  await dialog.getByRole("button", { name: "Créer la note des favoris" }).click();
  await dialog.getByRole("textbox", { name: "Nom de la note" }).fill("  ");
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.locator(".toast-error", { hasText: "le titre est vide" })).toBeVisible();
  await expect(current(dialog)).toHaveText("Aucune");
});

test("réglages : choisir une note dans la liste des notes, filtrée en tapant", async ({ page }) => {
  await launch(page);
  await entry(page).click();
  const dialog = settings(page);
  await dialog.getByRole("button", { name: "Choisir une note" }).click();
  const picker = page.getByRole("dialog", { name: "Choisir une note" });
  await expect(picker.getByRole("option")).not.toHaveCount(0);
  await expect(picker.getByRole("option", { name: /Plan/ })).toHaveCount(0);
  await expect(picker.getByRole("option", { name: /Levures/ })).toHaveCount(0);
  await picker.getByRole("combobox").fill("budg");
  await expect(picker.getByRole("option")).toHaveCount(1);
  await picker.getByRole("combobox").press("Enter");
  await expect(current(dialog)).toHaveText("Budget");
});

test("l'étoile sans note des favoris ouvre les réglages ; la note créée reçoit le contenu cliqué", async ({
  page,
}) => {
  await launch(page);
  await expect(star(page)).toHaveAttribute("aria-pressed", "false");
  await star(page).click();
  const dialog = settings(page);
  await expect(dialog.getByRole("tab", { name: "Favoris" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("button", { name: "Créer la note des favoris" }).click();
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(toast(page, "Ajouté aux favoris")).toBeVisible();
  expect(await saved(page, "favoris.md")).toBe("# Favoris\n- [[Courses]]\n");
  await dialog.getByRole("button", { name: "Fermer" }).click();
  await waitForNote(page, "Favoris");
});
