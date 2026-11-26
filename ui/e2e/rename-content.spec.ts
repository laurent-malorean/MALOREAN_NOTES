import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Renommer un contenu par le clic droit (fiche 0090), dans la liste et sur un onglet : une note, un
// canvas, une carte mentale, un cahier de recherche, un CRM (qui emmène ses fiches). Une fiche n'a pas ce choix.

type Notes = Record<string, { content: string; modified: number }>;

const action = (title: string) =>
  `---\ntype: crm-action\nstatut: TODO\ndate: '2026-11-20'\n---\n# ${title}\n`;
const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 90 },
  "idee.md": { content: "# Idée\ntexte", modified: 80 },
  "plan.canvas": { content: '{"nodes":[],"edges":[]}', modified: 70 },
  "projet.md": { content: "---\ntype: carte-mentale\n---\n# Projet\n\n- idée\n", modified: 60 },
  "levures.md": { content: "---\ntype: cahier-de-recherche\n---\n# Levures\n", modified: 50 },
  "clients.md": { content: "---\ntype: crm\n---\n# Clients\n", modified: 40 },
  "clients/personnes/marie-durand.md": {
    content: "---\ntype: crm-personne\n---\n# Marie Durand\n",
    modified: 5,
  },
  "clients/actions/2026-11-20-devis.md": { content: action("Devis"), modified: 4 },
  "clients/actions/2026-11-24-appel.md": { content: action("Appel"), modified: 3 },
};

async function launch(page: Page) {
  await page.setViewportSize({ width: 1700, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["clients"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const item = (page: Page, title: string) => page.locator(".note-item", { hasText: title });
const tabs = (page: Page) => page.locator(".tab");
const ask = (page: Page) => page.getByRole("dialog", { name: "Nouveau titre" });
const paths = (page: Page) => page.evaluate(() => Object.keys(window.backend.notes).sort());
const content = (page: Page, path: string) =>
  page.evaluate((p) => window.backend.notes[p]?.content ?? null, path);
const menuChoices = (page: Page) => page.locator(".context-menu button");

/** Clic droit sur la note de la liste, « Renommer… », puis le titre tapé et validé par Entrée. */
async function renameFromList(page: Page, title: string, typed: string) {
  await item(page, title).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  await ask(page).getByRole("textbox").fill(typed);
  await page.keyboard.press("Enter");
}

test("« Renommer… » est dans le menu d'une note de la liste, juste après « Fermer », avec son icône", async ({
  page,
}) => {
  await launch(page);
  await item(page, "Idée").click({ button: "right" });
  await expect(menuChoices(page).nth(4)).toHaveText("Renommer…");
  await expect(menuChoices(page).nth(3)).toHaveText("Fermer");
  await expect(menuChoices(page).nth(4).locator(".context-menu-icon svg")).toBeVisible();
});

test("la fenêtre est préremplie avec le titre ; Entrée renomme : titre, fichier, onglet, liste et éditeur suivent", async ({
  page,
}) => {
  await launch(page);
  await item(page, "Courses").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  await expect(ask(page).getByRole("textbox")).toHaveValue("Courses");
  await ask(page).getByRole("textbox").fill("Mon marché du samedi");
  await page.keyboard.press("Enter");
  await expect(ask(page)).toBeHidden();
  await expect(tabs(page)).toHaveText(["Mon marché du samedi×"]);
  await expect(item(page, "Mon marché du samedi")).toBeVisible();
  await waitForNote(page, "Mon marché du samedi");
  expect(await content(page, "mon-marche-du-samedi.md")).toBe("# Mon marché du samedi\n- pain");
  expect(await content(page, "courses.md")).toBeNull();
});

test("Échap ne change rien", async ({ page }) => {
  await launch(page);
  await item(page, "Courses").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  await ask(page).getByRole("textbox").fill("Autre");
  await page.keyboard.press("Escape");
  await expect(ask(page)).toBeHidden();
  expect(await content(page, "courses.md")).toBe("# Courses\n- pain");
  await expect(tabs(page)).toHaveText(["Courses×"]);
});

test("un titre vide ou déjà pris est dit dans la fenêtre, qui reste ouverte, et rien ne change", async ({
  page,
}) => {
  await launch(page);
  await item(page, "Courses").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  const field = ask(page).getByRole("textbox");
  await field.fill("   ");
  await page.keyboard.press("Enter");
  await expect(ask(page).getByRole("alert")).toHaveText("Le titre est vide.");
  await field.fill("Idée");
  await page.keyboard.press("Enter");
  await expect(ask(page).getByRole("alert")).toHaveText(
    "Une note de ce dossier porte déjà ce titre.",
  );
  await expect(ask(page)).toBeVisible();
  expect(await paths(page)).toContain("courses.md");
  expect(await content(page, "idee.md")).toBe("# Idée\ntexte");
  // Corriger le titre suffit : le message part à la frappe et la fenêtre accepte.
  await field.fill("Marché");
  await expect(ask(page).locator(".name-prompt-error")).toBeEmpty();
  await page.keyboard.press("Enter");
  await expect(ask(page)).toBeHidden();
  expect(await content(page, "marche.md")).toBe("# Marché\n- pain");
});

test("le menu d'un onglet renomme aussi, et tous les onglets de la note suivent, même cachés", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Diviser la colonne").first().click();
  await item(page, "Idée").click();
  await expect(page.getByRole("region", { name: "Colonne" }).nth(1).getByRole("tab")).toHaveText([
    "Courses×",
    "Idée×",
  ]);
  await page.getByRole("region", { name: "Colonne" }).nth(0).getByRole("tab").click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  await expect(ask(page).getByRole("textbox")).toHaveValue("Courses");
  await ask(page).getByRole("textbox").fill("Marché");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Colonne" }).nth(0).getByRole("tab")).toHaveText([
    "Marché×",
  ]);
  await expect(page.getByRole("region", { name: "Colonne" }).nth(1).getByRole("tab")).toHaveText([
    "Marché×",
    "Idée×",
  ]);
  await expect(page.locator(".cm-line").first()).toHaveText("Marché");
  // Revenir à l'onglet caché : il montre la note, sans erreur.
  await page.getByRole("region", { name: "Colonne" }).nth(1).getByRole("tab").first().click();
  await expect(
    page.getByRole("region", { name: "Colonne" }).nth(1).locator(".cm-line").first(),
  ).toHaveText("Marché");
  await expect(page.locator(".toast-error")).toHaveCount(0);
});

test("l'historique garde la version d'avant, les récentes suivent, l'épingle reste", async ({
  page,
}) => {
  await launch(page);
  await item(page, "Courses").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Épingler" }).click();
  await renameFromList(page, "Courses", "Marché");
  await expect(tabs(page)).toHaveText(["Marché×"]);
  expect(await content(page, "marche.md")).toContain("# Marché\n- pain");
  expect(await content(page, "marche.md")).toMatch(/^---\npinned: true/);
  const versions = await page.evaluate(() =>
    (window.backend.versions["marche.md"] ?? []).map((v) => v.content),
  );
  expect(versions.at(-1)).toContain("# Courses");
  await page.getByRole("button", { name: "Récentes" }).click();
  await expect(page.locator(".note-title")).toContainText(["Marché"]);
});

test("un canvas se renomme : son fichier prend le nom du titre", async ({ page }) => {
  await launch(page);
  await item(page, "plan").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renommer…" }).click();
  await expect(ask(page).getByRole("textbox")).toHaveValue("plan");
  await ask(page).getByRole("textbox").fill("Mon plan de table");
  await page.keyboard.press("Enter");
  await expect(ask(page)).toBeHidden();
  expect(await content(page, "mon-plan-de-table.canvas")).toBe('{"nodes":[],"edges":[]}');
  expect(await content(page, "plan.canvas")).toBeNull();
  await expect(item(page, "mon-plan-de-table")).toBeVisible();
});

test("une carte mentale et un cahier de recherche se renomment comme une note, en-tête gardé", async ({
  page,
}) => {
  await launch(page);
  await renameFromList(page, "Projet", "Grand projet");
  expect(await content(page, "grand-projet.md")).toBe(
    "---\ntype: carte-mentale\n---\n# Grand projet\n\n- idée\n",
  );
  await renameFromList(page, "Levures", "Levures de bière");
  expect(await content(page, "levures-de-biere.md")).toBe(
    "---\ntype: cahier-de-recherche\n---\n# Levures de bière\n",
  );
});

test("un CRM se renomme avec ses fiches : le Kanban montre les mêmes actions", async ({ page }) => {
  await launch(page);
  await item(page, "Clients").click();
  await expect(page.locator(".crm-card")).toHaveCount(2);
  await renameFromList(page, "Clients", "Prospects");
  await expect(ask(page)).toBeHidden();
  const all = await paths(page);
  expect(all).toContain("prospects.md");
  expect(all).toContain("prospects/actions/2026-11-20-devis.md");
  expect(all).toContain("prospects/personnes/marie-durand.md");
  expect(all.some((path) => path.startsWith("clients/"))).toBe(false);
  await expect(tabs(page)).toHaveText(["Courses×", "Prospects×"]);
  await expect(page.locator(".crm-card")).toHaveCount(2);
  await expect(page.locator(".crm-card-title")).toHaveText(["Devis", "Appel"]);
});

test("une fiche de CRM n'a pas « Renommer… » : son écran a son champ de nom", async ({ page }) => {
  await launch(page);
  await tabs(page).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Renommer…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await item(page, "Clients").click();
  await expect(page.locator(".crm-card")).toHaveCount(2);
  await page.locator(".crm-tab", { hasText: "Personnes" }).click();
  await page.locator(".crm-row .crm-name", { hasText: "Marie Durand" }).click();
  const fiche = tabs(page).filter({ hasText: "Marie Durand" });
  await expect(fiche).toBeVisible();
  await fiche.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Historique…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Renommer…" })).toHaveCount(0);
});
