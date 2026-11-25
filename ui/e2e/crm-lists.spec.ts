import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Listes du CRM (fiche 0063), à la souris : Personnes (déplier, créer), Entreprises (l'arbre, créer),
// Projets (créer, renommer, changer la couleur, voir les actions, supprimer). Les captures vont dans
// le dossier des maquettes quand `MAQUETTES` le nomme.

const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .MAQUETTES;
type Notes = Record<string, { content: string; modified: number }>;

const fiche = (type: string, title: string, header: string[] = []) =>
  `---\ntype: ${type}\n${header.map((l) => `${l}\n`).join("")}---\n# ${title}\n`;
const action = (title: string, date: string, header: string[]) =>
  fiche("crm-action", title, ["statut: TODO", `date: '${date}'`, ...header]);

const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
  "clients.md": { content: fiche("crm", "Clients"), modified: 10 },
  "clients/entreprises/acme.md": { content: fiche("crm-entreprise", "Acme"), modified: 1 },
  "clients/personnes/jean-dupont.md": {
    content: fiche("crm-personne", "Jean Dupont", [
      "fonction: Responsable",
      "entreprise: '[[acme]]'",
    ]),
    modified: 2,
  },
  "clients/personnes/marie-durand.md": {
    content: fiche("crm-personne", "Marie Durand"),
    modified: 3,
  },
  "clients/projets/refonte.md": {
    content: fiche("crm-projet", "Refonte du site", ["couleur: bleu"]),
    modified: 4,
  },
  "clients/actions/2026-11-20-devis.md": {
    content: action("Devis", "2026-11-20", [
      "personnes: ['[[jean-dupont]] · [[acme]]']",
      "projet: '[[refonte]]'",
    ]),
    modified: 5,
  },
  "clients/actions/2026-11-25-appel.md": {
    content: action("Appel", "2026-11-25", ["personnes: ['[[marie-durand]]']"]),
    modified: 6,
  },
};

async function openClients(page: Page, tab: string) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["Clients"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await expect(page.locator(".crm-card")).toHaveCount(2);
  await page.locator(".crm-tab", { hasText: tab }).click();
}

const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/crm-${name}.png` });
};
const create = async (page: Page, button: string, name: string) => {
  await page.getByRole("button", { name: button }).click();
  await page.locator(".crm-new-name").fill(name);
  await page.locator(".crm-new-name").press("Enter");
};

test("Personnes : le tableau, déplier une personne, créer une personne", async ({ page }) => {
  await openClients(page, "Personnes");
  await expect(page.locator(".crm-row")).toHaveCount(2);
  const jean = page.locator(".crm-row", { hasText: "Jean Dupont" });
  await expect(jean).toContainText("Responsable");
  await expect(jean).toContainText("Acme");
  await expect(page.locator(".crm-row", { hasText: "Marie Durand" })).toContainText("NODATA");
  await jean.getByRole("button", { name: "Déplier Jean Dupont" }).click();
  await expect(page.locator(".crm-sub .crm-line")).toHaveText(
    "20 nov. · TODO · Refonte du site · Devis",
  );
  await shot(page, "personnes");
  await create(page, "Nouvelle personne", "Léa Roy");
  await expect(page.locator(".crm-row", { hasText: "Léa Roy" })).toBeVisible();
  const written = await savedContent(page, "clients/personnes/lea-roy.md");
  expect(written).toBe("---\ntype: crm-personne\n---\n# Léa Roy\n");
  // Ce qui est déplié est gardé quand on change d'onglet.
  await page.locator(".crm-tab", { hasText: "Kanban" }).click();
  await page.locator(".crm-tab", { hasText: "Personnes" }).click();
  await expect(page.locator(".crm-sub")).toHaveCount(1);
});

test("Entreprises : l'arbre se déplie, une entreprise se crée", async ({ page }) => {
  await openClients(page, "Entreprises");
  const names = page.locator(".crm-node-company > .crm-node-row .crm-name");
  await expect(names).toHaveText(["NODATA", "Acme"]);
  const acme = page.locator(".crm-node-company", { hasText: "Acme" });
  await expect(acme.locator(":scope > .crm-node-row")).toContainText("1 personne");
  await expect(acme.locator(":scope > .crm-node-row .crm-badge.late")).toHaveText("1 en retard");
  await acme.getByRole("button", { name: "Déplier Acme" }).click();
  await acme.getByRole("button", { name: "Déplier Jean Dupont" }).click();
  await expect(acme.locator(".crm-line")).toHaveText("20 nov. · TODO · Refonte du site · Devis");
  await page
    .locator(".crm-node-company", { hasText: "NODATA" })
    .getByRole("button", { name: "Déplier NODATA" })
    .click();
  await expect(page.locator('.crm-node-person[data-person="marie-durand"]')).toBeVisible();
  await shot(page, "entreprises");
  await page.locator(".crm-list-search").fill("zzz");
  await expect(names).toHaveCount(0);
  await page.locator(".crm-list-search").fill("");
  await create(page, "Nouvelle entreprise", "Globex");
  await expect(names).toHaveText(["NODATA", "Acme", "Globex"]);
  expect(await savedContent(page, "clients/entreprises/globex.md")).toBe(
    "---\ntype: crm-entreprise\n---\n# Globex\n",
  );
});

test("Projets : créer, renommer, changer la couleur, voir les actions, supprimer", async ({
  page,
}) => {
  await openClients(page, "Projets");
  const refonte = page.locator('.crm-project[data-project="refonte"]');
  await expect(refonte).toContainText("Refonte du site");
  await expect(refonte).toContainText("1 ouverte");
  await expect(refonte.locator(".crm-badge.late")).toHaveText("1 en retard");
  await create(page, "Nouveau projet", "Salon");
  const salon = page.locator('.crm-project[data-project="salon"]');
  await expect(salon).toContainText("Salon");
  // La couleur est la moins utilisée : « bleu » est prise, « rouge » est la première libre.
  expect(await savedContent(page, "clients/projets/salon.md")).toContain("couleur: rouge");
  await salon.getByRole("button", { name: "Renommer Salon" }).click();
  await page.locator(".crm-project-rename").fill("Grand salon");
  await page.locator(".crm-project-rename").press("Enter");
  await expect(page.locator(".crm-project-name", { hasText: "Grand salon" })).toBeVisible();
  expect(await savedContent(page, "clients/projets/salon.md")).toContain("# Grand salon");
  await salon.locator(".crm-swatch").click();
  await shot(page, "projets-couleur");
  await expect(salon.locator(".crm-palette-color.taken")).toHaveCount(1);
  await salon.locator('.crm-palette-color[data-color="bleu"]').click();
  expect(await savedContent(page, "clients/projets/salon.md")).toContain("couleur: bleu");
  await refonte.getByRole("button", { name: "Voir les actions de Refonte du site" }).click();
  await expect(page.locator(".crm-tab[aria-selected='true']")).toHaveText("Kanban");
  await expect(page.locator('.crm-pill[aria-pressed="true"]')).toHaveText("Refonte du site");
  await page.locator(".crm-tab", { hasText: "Projets" }).click();
  await page.getByRole("button", { name: "Supprimer Refonte du site" }).click();
  await expect(page.locator(".confirmation-question")).toContainText(
    "Supprimer le projet « Refonte du site » ? Son action passe à « Sans projet ».",
  );
  await page.locator("dialog button.danger").click();
  await expect(page.locator('.crm-project[data-project="refonte"]')).toHaveCount(0);
  expect(await savedContent(page, "clients/projets/refonte.md")).toBeNull();
  expect(await savedContent(page, "clients/actions/2026-11-20-devis.md")).not.toContain("projet:");
});
