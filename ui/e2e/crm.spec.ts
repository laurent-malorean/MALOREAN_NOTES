import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// CRM (fiche 0060), à la souris : création par le menu Fichier et par le clic droit sur un dossier ou
// sur la racine, Kanban (ajout rapide, glisser une carte, étapes), Ma semaine. Les captures vont
// dans le dossier des maquettes quand `MAQUETTES` le nomme.

const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .MAQUETTES;
type Notes = Record<string, { content: string; modified: number }>;

const action = (title: string, status: string, date: string, rank = "") =>
  [
    "---\ntype: crm-action",
    `statut: ${status}`,
    `date: '${date}'`,
    ...(rank ? [`rang: ${rank}`] : []),
    `---\n# ${title}\n`,
  ].join("\n");
const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
  "clients.md": { content: "---\ntype: crm\n---\n# Clients\n", modified: 10 },
  "clients/personnes/marie-durand.md": {
    content: "---\ntype: crm-personne\n---\n# Marie Durand\n",
    modified: 5,
  },
  "clients/actions/2026-11-20-devis.md": {
    content: action("Devis", "TODO", "2026-11-20"),
    modified: 1,
  },
  "clients/actions/2026-11-24-appel.md": {
    content: action("Appel", "TODO", "2026-11-24"),
    modified: 2,
  },
  "clients/actions/2026-11-25-email.md": {
    content: action("Email", "Progress", "2026-11-25"),
    modified: 3,
  },
  "clients/actions/2026-11-18-contrat.md": {
    content: action("Contrat", "Done", "2026-11-18"),
    modified: 4,
  },
};

async function launch(page: Page, notes: Notes, width = 1700) {
  await page.setViewportSize({ width, height: 900 });
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
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/crm-${name}.png` });
};
const column = (page: Page, status: string) => page.locator(`.crm-column[data-status="${status}"]`);
const card = (page: Page, title: string) => page.locator(".crm-card", { hasText: title });
const titles = (scope: Locator) => scope.locator(".crm-card-title").allTextContents();

async function openClients(page: Page, width?: number) {
  await launch(page, NOTES, width);
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await expect(page.locator(".crm-card")).toHaveCount(4);
}

/** Glisse à la souris, par petites étapes : comme un utilisateur. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = await from.boundingBox();
  if (!box) throw new Error("source absente de l'écran");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
async function above(target: Locator, share = 0.1) {
  const box = await target.boundingBox();
  if (!box) throw new Error("cible absente de l'écran");
  return { x: box.x + box.width / 2, y: box.y + box.height * share };
}

test("un CRM se crée par le menu Fichier : un nom vide est refusé, Échap annule, il s'ouvre sur le Kanban", async ({
  page,
}) => {
  await launch(page, { "courses.md": NOTES["courses.md"] as Notes[string] });
  await choose(page, "new-crm");
  const ask = page.getByRole("dialog", { name: "Nom du nouveau CRM" });
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("textbox").fill("Prospects");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await savedContent(page, "prospects.md")).toBe("---\ntype: crm\n---\n# Prospects\n");
  await expect(page.locator(".crm-tab")).toHaveText([
    "Kanban",
    "Ma semaine",
    "Personnes",
    "Entreprises",
    "Projets",
  ]);
  await expect(page.locator(".crm-tab[aria-selected='true']")).toHaveText("Kanban");
  await expect(page.locator(".crm-column-name")).toHaveText([
    "TODO",
    "Progress",
    "WaitingFor",
    "Done",
    "Cancel",
  ]);
  await expect(page.locator(".crm-empty")).toHaveText("Ajoutez une première action.");
  await shot(page, "vide");
  await choose(page, "new-crm");
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  expect(await savedContent(page, "prospects-2.md")).toBeNull();
});

test("le clic droit sur un dossier ou sur la racine crée un CRM dedans", async ({ page }) => {
  await launch(page, { "courses.md": NOTES["courses.md"] as Notes[string] });
  await page.locator(".folder-item", { hasText: "Clients" }).click({ button: "right" });
  await page.locator(".context-menu button", { hasText: "Nouveau CRM" }).click();
  const ask = page.getByRole("dialog", { name: "Nom du nouveau CRM" });
  await ask.getByRole("textbox").fill("Dans le dossier");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await savedContent(page, "Clients/dans-le-dossier.md")).toBe(
    "---\ntype: crm\n---\n# Dans le dossier\n",
  );
  await expect(page.locator(".crm")).toBeVisible();
});

test("le Kanban montre une colonne par statut, ses cartes et ses compteurs", async ({ page }) => {
  await openClients(page);
  await expect(page.locator(".crm-tab[aria-selected='true']")).toHaveText("Kanban");
  expect(await titles(column(page, "TODO"))).toEqual(["Devis", "Appel"]);
  expect(await titles(column(page, "Progress"))).toEqual(["Email"]);
  await expect(column(page, "TODO").locator(".crm-count")).toHaveText("2");
  await expect(column(page, "TODO").locator(".crm-late-count")).toHaveText("2");
  await expect(card(page, "Devis").locator(".crm-card-when")).toHaveText("En retard de 5 jours");
  await expect(card(page, "Email").locator(".crm-card-when")).toHaveText("À faire aujourd'hui");
  await shot(page, "kanban");
  await page.getByRole("tab", { name: "Personnes" }).click();
  await expect(page.locator(".crm-people")).toBeVisible();
});

test("l'ajout rapide crée une action dans la colonne et reste ouvert pour la suivante", async ({
  page,
}) => {
  await openClients(page);
  await column(page, "Progress").getByRole("button", { name: "+ Ajouter une action" }).click();
  const field = page.getByRole("textbox", { name: "Titre de l'action" });
  await field.fill("Relancer Marie");
  await field.press("Enter");
  await expect(card(page, "Relancer Marie")).toBeVisible();
  expect(await titles(column(page, "Progress"))).toContain("Relancer Marie");
  expect(await savedContent(page, "clients/actions/2026-11-25-relancer-marie.md")).toContain(
    "statut: Progress",
  );
  await expect(field).toBeFocused();
  await field.press("Escape");
  await expect(field).toBeHidden();
});

test("glisser une carte dans une autre colonne change son statut et la place entre deux cartes", async ({
  page,
}) => {
  await openClients(page);
  await dragTo(page, card(page, "Appel"), await above(card(page, "Email")));
  await expect(column(page, "Progress").locator(".crm-card")).toHaveCount(2);
  expect(await titles(column(page, "Progress"))).toEqual(["Appel", "Email"]);
  expect(await savedContent(page, "clients/actions/2026-11-24-appel.md")).toContain(
    "statut: Progress",
  );
  await dragTo(
    page,
    card(page, "Devis"),
    await above(column(page, "Done").locator(".crm-cards"), 0.5),
  );
  await expect(column(page, "Done").locator(".crm-card")).toHaveCount(2);
  await shot(page, "apres-glisser");
});

test("les étapes s'ajoutent, se renomment, se retirent depuis le Kanban", async ({ page }) => {
  await openClients(page);
  await page.getByRole("button", { name: "+ Ajouter une étape" }).click();
  await page.getByRole("textbox", { name: "Nom de l'étape" }).fill("Devis");
  await page.keyboard.press("Enter");
  await expect(page.locator(".crm-column-name")).toHaveText([
    ...["TODO", "Progress", "WaitingFor", "Devis", "Done", "Cancel"],
  ]);
  await page.getByRole("button", { name: "Devis", exact: true }).click();
  await page.getByRole("textbox", { name: "Nom de l'étape" }).fill("Proposition");
  await page.keyboard.press("Enter");
  await expect(column(page, "Proposition")).toBeVisible();
  await page.getByRole("button", { name: "Retirer l'étape Proposition" }).click();
  await expect(column(page, "Proposition")).toHaveCount(0);
  await page.getByRole("button", { name: "Retirer l'étape Progress" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Retirer l'étape « Progress » ? Ses 1 action repartent en « TODO ».",
  );
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  await expect(column(page, "Progress")).toHaveCount(0);
  expect(await titles(column(page, "TODO"))).toContain("Email");
});

test("Ma semaine range les actions par jour ; glisser une carte sur un jour change sa date", async ({
  page,
}) => {
  // Huit colonnes de 272 points au moins : la fenêtre est assez large pour les voir toutes.
  await openClients(page, 3200);
  await page.getByRole("tab", { name: "Ma semaine" }).click();
  await expect(page.locator(".crm-week-title")).toHaveText("Semaine du 23 nov. au 29 nov.");
  await expect(page.locator(".crm-week .crm-column")).toHaveCount(8);
  await expect(page.locator(".crm-column.late .crm-card-title")).toHaveText(["Devis"]);
  await expect(page.locator('.crm-column[data-day="2026-11-25"]')).toHaveClass(/today/);
  await shot(page, "semaine");
  const friday = page.locator('.crm-column[data-day="2026-11-27"]');
  await dragTo(page, card(page, "Email"), await above(friday, 0.9));
  await expect(friday.locator(".crm-card-title")).toHaveText(["Email"]);
  expect(await savedContent(page, "clients/actions/2026-11-25-email.md")).toContain(
    "date: '2026-11-27'",
  );
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(page.locator(".crm-week-title")).toHaveText("Semaine du 30 nov. au 6 déc.");
  await page.getByRole("button", { name: "Aujourd'hui" }).click();
  await expect(page.locator(".crm-week-title")).toHaveText("Semaine du 23 nov. au 29 nov.");
});

test("l'onglet choisi est gardé pour ce CRM", async ({ page }) => {
  await openClients(page);
  await page.getByRole("tab", { name: "Ma semaine" }).click();
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await waitForNote(page, "Courses");
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await expect(page.locator(".crm-tab[aria-selected='true']")).toHaveText("Ma semaine");
});
