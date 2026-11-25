import { expect, type Page, test } from "@playwright/test";
import { openNote, waitForNote } from "./journey";

// Le champ d'étiquettes, à la souris : sous les onglets de chaque contenu, les étiquettes en pastilles avec
// « × », un champ « Ajouter une étiquette » qui propose celles de l'espace de travail et un « + ».

type Notes = Record<string, { content: string; modified: number }>;

const NOTEBOOK = "---\ntype: cahier-de-recherche\ntags: [labo]\n---\n# Levures\n";
const MAP =
  "---\ntype: carte-mentale\ntags: [projet]\n---\n# Lancement\n\n- Clients\n- Calendrier\n";
const CANVAS = JSON.stringify({ nodes: [], edges: [], tags: ["idées"] });
const FICHE = (type: string, title: string, header = "") =>
  `---\ntype: ${type}\n${header}---\n# ${title}\n`;

const NOTES: Notes = {
  "courses.md": { content: "---\ntags: [perso, maison]\n---\n# Courses\npain", modified: 90 },
  "budget.md": { content: "---\ntags: [travail]\n---\n# Budget", modified: 80 },
  "idee.md": { content: "# Idée", modified: 70 },
  "levures.md": { content: NOTEBOOK, modified: 60 },
  "lancement.md": { content: MAP, modified: 50 },
  "tableau.canvas": { content: CANVAS, modified: 40 },
  "clients.md": { content: FICHE("crm", "Clients"), modified: 30 },
  "clients/entreprises/acme.md": {
    content: FICHE("crm-entreprise", "Acme", "tags: [grand compte]\n"),
    modified: 20,
  },
  "clients/personnes/jean.md": {
    content: FICHE("crm-personne", "Jean Dupont", "entreprise: '[[acme]]'\n"),
    modified: 10,
  },
};

async function launch(page: Page, notes: Notes = NOTES) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "---");
  await expect(page.locator(".cm-line", { hasText: "Courses" })).toBeVisible();
}

const bar = (page: Page) => page.locator(".column .tag-bar");
const chips = (page: Page) => bar(page).locator(".tag-chip");
const field = (page: Page) => bar(page).getByLabel("Ajouter une étiquette");
const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

test("une note montre ses étiquettes sous les onglets ; Entrée en ajoute une, écrite dans l'en-tête", async ({
  page,
}) => {
  await launch(page);
  await expect(bar(page)).toBeVisible();
  await expect(chips(page)).toHaveText(["perso×", "maison×"]);
  await expect(field(page)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Ajouter l'étiquette" })).toHaveText("+");

  await field(page).fill("vacances");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["perso×", "maison×", "vacances×"]);
  expect(await saved(page, "courses.md")).toContain("tags: [perso, maison, vacances]");
  // L'éditeur montre le texte réécrit, la liste des notes et celle des étiquettes suivent.
  await expect(page.locator(".cm-content")).toContainText("tags: [perso, maison, vacances]");
  await expect(page.locator(".note-item", { hasText: "Courses" }).locator(".note-tag")).toHaveText([
    "#perso",
    "#maison",
    "#vacances",
  ]);
  await expect(page.getByRole("navigation", { name: "Étiquettes" })).toContainText("vacances");
  await expect(field(page)).toBeFocused();
});

test("le « + » ajoute le texte tapé, et sans texte donne le curseur au champ", async ({ page }) => {
  await launch(page);
  await bar(page).getByRole("button", { name: "Ajouter l'étiquette" }).click();
  await expect(field(page)).toBeFocused();
  await expect(chips(page)).toHaveCount(2);
  await field(page).fill("  vip ");
  await bar(page).getByRole("button", { name: "Ajouter l'étiquette" }).click();
  await expect(chips(page)).toHaveText(["perso×", "maison×", "vip×"]);
  expect(await saved(page, "courses.md")).toContain("tags: [perso, maison, vip]");
});

test("la croix retire une étiquette ; la dernière retirée enlève la propriété de l'en-tête", async ({
  page,
}) => {
  await launch(page);
  await bar(page).getByRole("button", { name: "Retirer l'étiquette perso" }).click();
  await expect(chips(page)).toHaveText(["maison×"]);
  expect(await saved(page, "courses.md")).toContain("tags: [maison]");
  await bar(page).getByRole("button", { name: "Retirer l'étiquette maison" }).click();
  await expect(chips(page)).toHaveCount(0);
  expect(await saved(page, "courses.md")).toBe("# Courses\npain");
  await expect(page.getByRole("navigation", { name: "Étiquettes" })).not.toContainText("maison");
});

test("le champ propose les étiquettes qui existent déjà, sans celles de la note", async ({
  page,
}) => {
  await launch(page);
  const options = bar(page).locator("datalist option");
  await expect(options).toHaveCount(4);
  const values = await options.evaluateAll((all) => all.map((o) => (o as HTMLOptionElement).value));
  expect(values.sort()).toEqual(["grand compte", "labo", "projet", "travail"]);
});

test("ce qui est tapé dans la note est gardé quand on change ses étiquettes", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(" et du lait");
  await field(page).fill("urgent");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["perso×", "maison×", "urgent×"]);
  const content = await saved(page, "courses.md");
  expect(content).toContain("pain et du lait");
  expect(content).toContain("tags: [perso, maison, urgent]");
  await expect(page.locator(".cm-content")).toContainText("pain et du lait");
});

test("une note sans étiquette montre le champ vide, et chaque note montre les siennes", async ({
  page,
}) => {
  await launch(page);
  await openNote(page, "Idée");
  await expect(bar(page)).toBeVisible();
  await expect(chips(page)).toHaveCount(0);
  await field(page).fill("neuf");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["neuf×"]);
  expect(await saved(page, "idee.md")).toBe("---\ntags: [neuf]\n---\n# Idée");
  await openNote(page, "Budget", { firstLine: "---" });
  await expect(chips(page)).toHaveText(["travail×"]);
});

test("le cahier de recherche : champ d'étiquettes sous les onglets, zone de saisie gardée", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Levures" }).click();
  await expect(page.locator(".notebook-entry")).toBeVisible();
  await expect(chips(page)).toHaveText(["labo×"]);
  await field(page).fill("levain");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["labo×", "levain×"]);
  expect(await saved(page, "levures.md")).toBe(
    "---\ntype: cahier-de-recherche\ntags: [labo, levain]\n---\n# Levures\n",
  );
  await expect(page.locator(".notebook-entry")).toBeVisible();
});

test("la carte mentale : champ d'étiquettes sous les onglets, la carte reste à l'écran", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Lancement" }).click();
  await expect(page.locator(".mind-map")).toBeVisible();
  await expect(chips(page)).toHaveText(["projet×"]);
  await bar(page).getByRole("button", { name: "Retirer l'étiquette projet" }).click();
  await expect(chips(page)).toHaveCount(0);
  await field(page).fill("2027");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["2027×"]);
  expect(await saved(page, "lancement.md")).toContain("tags: [2027]");
  await expect(page.locator(".mind-map")).toBeVisible();
});

test("le canvas : les étiquettes sont à la racine du fichier, les autres propriétés gardées", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "tableau" }).click();
  await expect(page.locator(".canvas-view")).toBeVisible();
  await expect(chips(page)).toHaveText(["idées×"]);
  await field(page).fill("projet");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["idées×", "projet×"]);
  const file = JSON.parse((await saved(page, "tableau.canvas")) as string) as {
    tags: string[];
    nodes: unknown[];
  };
  expect(file.tags).toEqual(["idées", "projet"]);
  expect(file.nodes).toEqual([]);
  await expect(page.locator(".canvas-view")).toBeVisible();
});

test("les fiches du CRM : une entreprise et une personne ont leur champ d'étiquettes", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await page.locator(".crm-tab", { hasText: "Entreprises" }).click();
  await page.locator(".crm-node-company .crm-name", { hasText: "Acme" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Acme");
  await expect(chips(page)).toHaveText(["grand compte×"]);
  await field(page).fill("industrie");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["grand compte×", "industrie×"]);
  expect(await saved(page, "clients/entreprises/acme.md")).toContain(
    "tags: [grand compte, industrie]",
  );
  await expect(page.locator(".crm-fiche-title")).toHaveText("Acme");
});

test("la fiche d'une personne a le sien, vide au départ", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Clients" }).click();
  await page.locator(".crm-tab", { hasText: "Personnes" }).click();
  await page.locator(".crm-row .crm-name", { hasText: "Jean Dupont" }).click();
  await expect(page.locator(".crm-fiche-title")).toHaveText("Jean Dupont");
  await expect(chips(page)).toHaveCount(0);
  await field(page).fill("décideur");
  await field(page).press("Enter");
  await expect(chips(page)).toHaveText(["décideur×"]);
  expect(await saved(page, "clients/personnes/jean.md")).toBe(
    "---\ntype: crm-personne\nentreprise: '[[acme]]'\ntags: [décideur]\n---\n# Jean Dupont\n",
  );
});
