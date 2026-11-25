import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Fiches d'entreprise et de personne du CRM (fiche 0063), à la souris : ouvertes depuis les listes,
// champs modifiables en cliquant dessus, notes, changer d'entreprise, nouvelle personne, supprimer.
// Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

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

const column = (page: Page) => page.locator(".column").first();
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

test("fiche de personne : champs, notes, changer d'entreprise", async ({ page }) => {
  await openClients(page, "Personnes");
  await page.locator(".crm-row .crm-name", { hasText: "Jean Dupont" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Jean Dupont");
  await expect(page.locator(".cm-editor")).toBeHidden();
  await expect(page.locator(".crm-fiche-company")).toContainText("Acme");
  await shot(page, "fiche-personne");
  await page.getByRole("button", { name: "Modifier : Fonction" }).click();
  await page.locator(".crm-fiche-input").fill("Directeur");
  await page.locator(".crm-fiche-input").press("Enter");
  await expect(page.locator('[data-field="fonction"]')).toContainText("Directeur");
  expect(await savedContent(page, "clients/personnes/jean-dupont.md")).toContain(
    "fonction: Directeur",
  );
  await page.locator(".crm-fiche-notes").fill("Rappeler en janvier");
  await page.locator(".crm-fiche-heading").first().click();
  await expect
    .poll(() => savedContent(page, "clients/personnes/jean-dupont.md"))
    .toContain("Rappeler en janvier");
  await expect(page.locator(".crm-fiche-actions h3")).toHaveText(["Ouvertes (1)", "Terminées (0)"]);
  await expect(page.locator(".crm-fiche-actions .crm-line")).toHaveText(
    "20 nov. · TODO · Refonte du site · Devis",
  );
  await click(page, "Changer d'entreprise");
  await page.locator(".crm-career-form select").selectOption("");
  await click(page, "Valider");
  await expect(page.locator(".crm-fiche-company .crm-name")).toHaveText("NODATA");
  expect(await savedContent(page, "clients/personnes/jean-dupont.md")).not.toContain("entreprise:");
});

test("fiche d'entreprise : un nom ouvre la fiche d'une autre, nouvelle personne, supprimer", async ({
  page,
}) => {
  await openClients(page, "Entreprises");
  await page.locator(".crm-node-company .crm-name", { hasText: "Acme" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Acme");
  await page.getByRole("button", { name: "Modifier : Site" }).click();
  await page.locator(".crm-fiche-input").fill("https://acme.fr");
  await page.locator(".crm-fiche-input").press("Enter");
  expect(await savedContent(page, "clients/entreprises/acme.md")).toContain(
    "site: https://acme.fr",
  );
  await expect(page.locator(".crm-fiche-person")).toHaveText(/Jean Dupont/);
  await click(page, "Nouvelle personne");
  await page.locator(".crm-new-name").fill("Léa Roy");
  await page.locator(".crm-new-name").press("Enter");
  await expect(page.locator(".crm-fiche-person", { hasText: "Léa Roy" })).toBeVisible();
  expect(await savedContent(page, "clients/personnes/lea-roy.md")).toContain(
    "entreprise: '[[acme]]'",
  );
  await shot(page, "fiche-entreprise");
  await page.getByRole("button", { name: "Toutes les actions de Jean Dupont" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Jean Dupont");
});

test("fiche d'entreprise : supprimer, après confirmation", async ({ page }) => {
  await openClients(page, "Entreprises");
  await page.locator(".crm-node-company .crm-name", { hasText: "Acme" }).click();
  await click(page, "Supprimer l'entreprise");
  await expect(page.locator(".confirmation-question")).toContainText(
    "Supprimer l'entreprise « Acme » ? Sa personne passe à NODATA.",
  );
  await page.locator("dialog button.danger").click();
  await expect(page.locator(".crm-fiche-gone")).toHaveText("Cette fiche n'existe plus.");
  expect(await savedContent(page, "clients/entreprises/acme.md")).toBeNull();
  expect(await savedContent(page, "clients/personnes/jean-dupont.md")).not.toContain("entreprise:");
  await expect(column(page)).toBeVisible();
});
