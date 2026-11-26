import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// La fenêtre d'une action (fiche 0062), à la souris : ouverture par un clic sur une carte, champs
// visibles et pointables, gestes enregistrés dans le fichier, création depuis Ma semaine et depuis
// « Plus de détails », suppression, mise à jour en direct.

type Notes = Record<string, { content: string; modified: number }>;

const note = (content: string, modified: number) => ({ content, modified });
const NOTES: Notes = {
  "courses.md": note("# Courses\n- lait", 20),
  "clients.md": note("---\ntype: crm\n---\n# Clients\n", 10),
  "clients/entreprises/acme.md": note("---\ntype: crm-entreprise\n---\n# Acme\n", 1),
  "clients/personnes/jean-dupont.md": note(
    "---\ntype: crm-personne\nentreprise: '[[acme]]'\nemail: jean@acme.fr\n---\n# Jean Dupont\n",
    2,
  ),
  "clients/personnes/marie-durand.md": note("---\ntype: crm-personne\n---\n# Marie Durand\n", 3),
  "clients/projets/refonte.md": note("---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n", 4),
  "clients/actions/2026-11-20-devis.md": note(
    [
      "---\ntype: crm-action\nstatut: TODO\ndate: '2026-11-20'\ncanal: appel\ncouleur: violet",
      "personnes: ['[[jean-dupont]] · [[acme]]']\ntags: [urgent]\n---\n# Devis\n\nPour 3 postes\n",
      "#### Liste à cocher : Préparation\n- [x] Relire\n- [ ] Chiffrer\n",
      "#### Commentaires\n- 2026-11-24 10:32 · Voir https://acme.fr/devis\n",
    ].join("\n"),
    5,
  ),
  "clients/actions/2026-11-25-email.md": note(
    "---\ntype: crm-action\nstatut: Progress\ndate: '2026-11-25'\n---\n# Email\n",
    6,
  ),
};

async function launch(page: Page) {
  await page.setViewportSize({ width: 1700, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["Clients"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const card = (page: Page, title: string) => page.locator(".crm-card", { hasText: title });
const panel = (page: Page) => page.locator(".crm-aw-panel");
const DEVIS = "clients/actions/2026-11-20-devis.md";

async function openDevis(page: Page) {
  await launch(page);
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await card(page, "Devis").click();
  await expect(panel(page)).toBeVisible();
}

/** Un contrôle est à l'écran et reçoit le clic en son centre : rien ne le recouvre. */
async function pointable(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  if (!box) throw new Error("contrôle absent de l'écran");
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest(".crm-aw-panel") !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe(true);
}

test("un clic sur une carte ouvre la fenêtre de l'action, à droite, avec tous ses champs pointables", async ({
  page,
}) => {
  await openDevis(page);
  const box = await panel(page).boundingBox();
  expect(box?.width).toBeLessThanOrEqual(600);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(1700);
  expect(box?.height).toBe(900);
  await expect(panel(page).getByRole("textbox", { name: "Titre" })).toHaveValue("Devis");
  await expect(page.locator(".crm-aw-person")).toHaveText(["Jean Dupont · Acme×"]);
  const controls = [
    panel(page).getByLabel("Statut"),
    panel(page).getByLabel("Date"),
    panel(page).getByLabel("Canal"),
    panel(page).getByLabel("Projet"),
    panel(page).getByRole("button", { name: "violet" }),
    panel(page).getByRole("textbox", { name: "Titre" }),
    panel(page).getByRole("textbox", { name: "Description" }),
    panel(page).getByLabel("Ajouter une étiquette"),
    panel(page).getByRole("button", { name: "Lier une note" }),
    panel(page).getByRole("button", { name: "Ajouter une checklist" }),
    panel(page).getByRole("textbox", { name: "Ajouter un commentaire" }),
    panel(page).getByRole("button", { name: "Copier les e-mails" }),
    page.locator(".crm-aw-delete"),
  ];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await pointable(page, control);
  }
  await expect(page.locator(".crm-aw-progress")).toHaveText(["50 %"]);
});

test("Échap, « Fermer » et un clic à côté ferment la fenêtre", async ({ page }) => {
  await openDevis(page);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await card(page, "Devis").click();
  await panel(page).getByRole("button", { name: "Fermer" }).click();
  await expect(panel(page)).toHaveCount(0);
  await card(page, "Devis").click();
  await page.mouse.click(100, 300);
  await expect(panel(page)).toHaveCount(0);
});

test("chaque geste est enregistré dans le fichier, le Kanban derrière se met à jour", async ({
  page,
}) => {
  await openDevis(page);
  await panel(page).getByLabel("Statut").selectOption("Done");
  await expect.poll(() => saved(page, DEVIS)).toContain("statut: Done");
  await expect(
    page.locator('.crm-column[data-status="Done"] .crm-card', { hasText: "Devis" }),
  ).toHaveCount(1);
  const title = panel(page).getByRole("textbox", { name: "Titre" });
  await title.fill("Devis révisé");
  await title.press("Enter");
  await expect.poll(() => saved(page, DEVIS)).toContain("# Devis révisé");
  await panel(page).getByLabel("Projet").selectOption("refonte");
  await expect.poll(() => saved(page, DEVIS)).toContain("projet: '[[refonte]]'");
  await panel(page).getByRole("button", { name: "rouge" }).click();
  await expect.poll(() => saved(page, DEVIS)).toContain("couleur: rouge");
  const tag = panel(page).getByLabel("Ajouter une étiquette");
  await tag.fill("salon");
  await tag.press("Enter");
  await expect.poll(() => saved(page, DEVIS)).toContain("tags: [urgent, salon]");
  await panel(page).getByRole("button", { name: "Retirer Jean Dupont" }).click();
  await expect.poll(() => saved(page, DEVIS)).not.toContain("personnes:");
  await panel(page).getByLabel("+ Ajouter une personne").selectOption("marie-durand");
  await expect.poll(() => saved(page, DEVIS)).toContain("personnes: ['[[marie-durand]]']");
  const description = panel(page).getByRole("textbox", { name: "Description" });
  await description.fill("Pour 4 postes");
  await title.click();
  await expect.poll(() => saved(page, DEVIS)).toContain("Pour 4 postes");
});

test("les checklists et les commentaires s'ajoutent, se cochent, s'écrivent dans le fichier", async ({
  page,
}) => {
  await openDevis(page);
  await panel(page).getByRole("checkbox", { name: "Cocher Chiffrer" }).check();
  await expect.poll(() => saved(page, DEVIS)).toContain("- [x] Chiffrer");
  await expect(page.locator(".crm-aw-progress")).toHaveText(["100 %"]);
  await panel(page).getByRole("button", { name: "Ajouter une checklist" }).click();
  const newList = panel(page).getByRole("textbox", { name: "Ajouter une checklist" });
  await newList.fill("Envoi");
  await newList.press("Enter");
  await expect.poll(() => saved(page, DEVIS)).toContain("#### Liste à cocher : Envoi");
  await panel(page).getByRole("textbox", { name: "Ajouter un commentaire" }).fill("Rappeler jeudi");
  await panel(page).getByRole("button", { name: "Ajouter le commentaire" }).click();
  await expect.poll(() => saved(page, DEVIS)).toContain("· Rappeler jeudi");
  await expect(page.locator(".crm-aw-comment-text").first()).toHaveText("Rappeler jeudi");
  await page.locator(".crm-aw-comment-link").click();
  await expect
    .poll(() => page.evaluate(() => window.backend.opened))
    .toContain("https://acme.fr/devis");
});

test("« Copier les e-mails » copie ceux des personnes et le dit", async ({ page }) => {
  await openDevis(page);
  await panel(page).getByRole("button", { name: "Copier les e-mails" }).click();
  await expect
    .poll(() => page.evaluate(() => window.backend.copiedMarkdown))
    .toEqual(["jean@acme.fr"]);
  await expect(page.locator(".toast", { hasText: "E-mails copiés." })).toBeVisible();
});

test("une nouvelle action se crée depuis un jour de Ma semaine, avec « Enregistrer »", async ({
  page,
}) => {
  await openDevis(page);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Ma semaine" }).click();
  await page
    .locator('.crm-column[data-day="2026-11-27"]')
    .getByRole("button", { name: "+ Ajouter une action" })
    .click();
  await expect(page.locator(".crm-aw-heading")).toHaveText("Nouvelle action");
  await expect(panel(page).getByLabel("Date")).toHaveValue("2026-11-27");
  await panel(page).getByRole("textbox", { name: "Titre" }).fill("Relancer Marie");
  await panel(page).getByLabel("+ Ajouter une personne").selectOption("marie-durand");
  await panel(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(panel(page)).toHaveCount(0);
  const content = await saved(page, "clients/actions/2026-11-25-relancer-marie.md");
  expect(content).toContain("date: '2026-11-27'");
  expect(content).toContain("personnes: ['[[marie-durand]]']");
  await expect(
    page.locator('.crm-column[data-day="2026-11-27"] .crm-card', { hasText: "Relancer Marie" }),
  ).toBeVisible();
});

test("« Plus de détails » de l'ajout rapide ouvre la fenêtre avec le titre, la personne et la colonne", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await page
    .locator('.crm-column[data-status="Progress"]')
    .getByRole("button", { name: "+ Ajouter une action" })
    .click();
  await page.getByRole("textbox", { name: "Titre de l'action" }).fill("Idée");
  await page.getByLabel("Personne", { exact: true }).selectOption("jean-dupont");
  await page.getByRole("button", { name: "Plus de détails" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Titre" })).toHaveValue("Idée");
  await expect(panel(page).getByLabel("Statut")).toHaveValue("Progress");
  await expect(page.locator(".crm-aw-person")).toHaveText(["Jean Dupont · Acme×"]);
  await panel(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(await saved(page, "clients/actions/2026-11-25-idee.md")).toContain("statut: Progress");
});

test("supprimer demande confirmation, envoie l'action à la corbeille et ferme la fenêtre", async ({
  page,
}) => {
  await openDevis(page);
  await page.locator(".crm-aw-delete").click();
  await expect(page.getByRole("dialog", { name: "Confirmation" })).toContainText(
    "Placer « Devis » dans la corbeille ?",
  );
  await page.getByRole("button", { name: "Placer dans la corbeille" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(card(page, "Devis")).toHaveCount(0);
  expect(await saved(page, DEVIS)).toBeNull();
});

test("un changement venu d'ailleurs se voit dans la fenêtre ; une action supprimée ailleurs la ferme", async ({
  page,
}) => {
  await openDevis(page);
  const outside = (text: string | null) =>
    page.evaluate(
      ([t]) => window.backend.changeOutside("clients/actions/2026-11-20-devis.md", t ?? null),
      [text],
    );
  const content = (await saved(page, DEVIS)) ?? "";
  await outside(content.replace("# Devis", "# Devis d'ailleurs"));
  await expect(panel(page).getByRole("textbox", { name: "Titre" })).toHaveValue("Devis d'ailleurs");
  await outside(null);
  await expect(panel(page)).toHaveCount(0);
});
