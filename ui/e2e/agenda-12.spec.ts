import { expect, type Locator, type Page, test } from "@playwright/test";
import { band, event, field, launch, openSalons, SHOTS } from "./agenda-12-common";

// Agenda 12 (fiche 0104), à la souris : créer un agenda 12 et ses événements, la grille (ordre dans une
// case, colonnes, filtre par étiquette), les champs d'un événement et les refus du moteur, clore, archives,
// rouvrir, placer dans la corbeille. Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-12-${name}.png` });
};
const cell = (page: Page, month: number) => page.locator(`.agenda-cell[data-month="${month}"]`);
const lines = (scope: Locator) => scope.locator(".agenda-line").allTextContents();
const message = (page: Page) => page.locator(".agenda-band-message");
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const confirmation = (page: Page) => page.getByRole("dialog", { name: "Confirmation" });
const chevron = (page: Page) => page.getByRole("button", { name: "Nouveau contenu" });

/** Écrit une valeur dans un champ de la bande et la valide, comme un utilisateur. */
async function enter(page: Page, label: string, text: string) {
  await field(page, label).fill(text);
  await field(page, label).press("Enter");
  // Le geste fini : la bande a relu l'événement (les lectures peuvent être lentes).
  await expect(band(page)).not.toHaveAttribute("aria-busy", "true");
}

test("un agenda 12 se crée par le menu de création et par le clic droit sur un dossier", async ({
  page,
}) => {
  await launch(page);
  await chevron(page).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Agenda 12" }).click();
  const ask = page.getByRole("dialog", { name: "Titre du nouvel agenda 12" });
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("textbox").fill("Mes salons");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await saved(page, "mes-salons.md")).toBe("---\ntype: agenda-12\n---\n# Mes salons\n");
  await expect(page.locator(".agenda-title-bar")).toHaveText("Mes salons");
  await expect(page.locator(".agenda-month")).toHaveText([
    ...["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
    ...["Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  ]);
  await expect(page.locator(".agenda-columns-choice[aria-pressed='true']")).toHaveText("4");
  await expect(page.locator(".agenda-line")).toHaveCount(0);
  await expect(page.locator(".cm-editor")).toBeHidden();

  await page.locator(".folder-item", { hasText: "Pro" }).click({ button: "right" });
  await page.locator(".context-menu button", { hasText: "Nouvel agenda 12" }).click();
  await ask.getByRole("textbox").fill("Dans Pro");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await saved(page, "Pro/dans-pro.md")).toBe("---\ntype: agenda-12\n---\n# Dans Pro\n");
  await expect(page.locator(".agenda-title-bar")).toHaveText("Dans Pro");
});

test("la grille range les lignes dans l'ordre, règle ses colonnes et filtre par étiquette", async ({
  page,
}) => {
  await openSalons(page);
  expect(await lines(cell(page, 2))).toEqual([
    "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World",
    "2029 – Renouveler malorean.fr",
  ]);
  expect(await lines(cell(page, 1))).toEqual(["15/01 – Audit ISO"]);
  await shot(page, "grille");
  const years = cell(page, 2).locator(".agenda-year");
  const [next, later] = await years.evaluateAll((pills) =>
    pills.map((pill) => getComputedStyle(pill).backgroundColor),
  );
  expect(next).not.toBe(later);

  await click(page, "6 colonnes");
  expect(await saved(page, "Pro/salons.md")).toContain("colonnes: 6");
  await expect(page.locator(".agenda-columns-choice[aria-pressed='true']")).toHaveText("6");
  const tops = await page
    .locator(".agenda-cell")
    .evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(2);
  await click(page, "3 colonnes");
  await expect(page.locator(".agenda-grid")).toHaveCSS("grid-template-columns", /^(\S+ ){2}\S+$/);

  await page.locator(".agenda-filter").selectOption("salon");
  await expect(cell(page, 2).locator(".agenda-line")).toHaveCount(1);
  await expect(cell(page, 1).locator(".agenda-line")).toHaveCount(0);
  await shot(page, "filtre");
  await page.locator(".agenda-filter").selectOption("");
  await expect(cell(page, 1).locator(".agenda-line")).toHaveCount(1);
  await expect(cell(page, 2).locator(".agenda-line")).toHaveCount(2);
});

test("un « + » crée l'événement de la case, dont chaque champ se renseigne, avec les refus du moteur dits", async ({
  page,
}) => {
  await openSalons(page);
  await cell(page, 4).getByRole("button", { name: "Ajouter un événement en avril" }).click();
  expect(await saved(page, "Pro/salons/sans-titre.md")).toContain("mois: 4");
  await expect(band(page)).toBeVisible();
  await expect(field(page, "Titre")).toBeFocused();
  await expect(field(page, "Mois")).toHaveValue("4");
  await shot(page, "evenement");

  await page.keyboard.type("Salon Chimie");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page, "Pro/salons/sans-titre.md")).toContain("# Salon Chimie");
  await expect(page.locator(".cm-content")).toContainText("Salon Chimie");

  await enter(page, "Jour", "31");
  await expect(message(page)).toHaveText("Ce jour n'existe pas dans ce mois.");
  await expect(field(page, "Jour")).toHaveValue("");
  await enter(page, "Jour", "12");
  await expect(message(page)).toBeHidden();
  await enter(page, "Année", "2027");
  await enter(page, "Fin : jour", "5");
  await expect(message(page)).toHaveText("La fin est avant le début.");
  await enter(page, "Fin : jour", "14");
  await expect(message(page)).toBeHidden();
  await enter(page, "Jour", "");
  await expect(message(page)).toHaveText("La fin exige un jour de début.");
  await enter(page, "Jour", "x");
  await expect(message(page)).toHaveText("Un nombre entier est attendu.");

  await field(page, "Pays").click();
  await field(page, "Pays").pressSequentially("alle");
  await expect(page.locator(".agenda-country-option")).toHaveText(["🇩🇪 Allemagne"]);
  await page.locator(".agenda-country-option").click();
  await expect(field(page, "Pays")).toHaveValue("🇩🇪 Allemagne");
  await expect(band(page)).not.toHaveAttribute("aria-busy", "true");
  await enter(page, "Ville", "Hanovre");
  await field(page, "Mois").selectOption("5");
  await expect(band(page)).not.toHaveAttribute("aria-busy", "true");
  await page.getByLabel("Ajouter une étiquette").fill("salon");
  await page.getByLabel("Ajouter une étiquette").press("Enter");
  await expect(page.locator(".tag-chip")).toHaveText(["salon×"]);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("Budget 5000");
  await enter(page, "Ville", "Hanovre Messe");
  const content = (await saved(page, "Pro/salons/sans-titre.md")) ?? "";
  for (const key of ["mois: 5", "jour: 12", "annee: 2027", "jour-fin: 14", "pays: DE"])
    expect(content).toContain(key);
  expect(content).toContain("ville: Hanovre Messe");
  expect(content).toContain("tags: [salon]");
  expect(content).toContain("Budget 5000");

  await click(page, "← Salons");
  await expect(page.locator(".agenda-month")).toHaveCount(12);
  expect(await lines(cell(page, 5))).toContain("12–14/05 2027 – 🇩🇪 (Hanovre Messe) – Salon Chimie");
  expect(await lines(cell(page, 4))).toEqual([]);
});

test("clore, seul ou avec le suivant, puis les archives et rouvrir", async ({ page }) => {
  await openSalons(page);
  await cell(page, 1).locator(".agenda-line").click();
  await expect(field(page, "Titre")).toHaveValue("Audit ISO");
  await click(page, "Clore");
  await expect(confirmation(page)).toContainText(
    "Clore « Audit ISO » ? Il passe dans les archives.",
  );
  await shot(page, "clore");
  await confirmation(page).getByRole("button", { name: "Annuler" }).click();
  expect(await saved(page, "Pro/salons/audit.md")).not.toBeNull();
  await expect(band(page)).toBeVisible();

  await click(page, "Clore");
  await confirmation(page).getByRole("button", { name: "Clore et préparer le suivant" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
  expect(await saved(page, "Pro/salons/archives/audit.md")).toContain("clos-le: 2026-11-25");
  expect(await lines(cell(page, 1))).toEqual(["Audit ISO"]);

  await cell(page, 2).locator(".agenda-line", { hasText: "Renouveler" }).click();
  await click(page, "Clore");
  await confirmation(page).getByRole("button", { name: "Clore", exact: true }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
  expect(await lines(cell(page, 2))).toEqual([
    "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World",
  ]);

  await click(page, "Archives");
  await expect(page.locator(".agenda-archives .agenda-event")).toHaveCount(3);
  const rotterdam = page.locator(".agenda-archives .agenda-event", { hasText: "Rotterdam" });
  await expect(rotterdam).toContainText("clos le 01/06/2026");
  await shot(page, "archives");
  await rotterdam.getByRole("button", { name: "Rouvrir « Salon de Rotterdam »" }).click();
  await expect(page.locator(".agenda-archives .agenda-event")).toHaveCount(2);
  await click(page, "Grille");
  expect(await lines(cell(page, 5))).toEqual(["Salon de Rotterdam"]);

  await click(page, "Archives");
  await page.locator(".agenda-archives .agenda-line", { hasText: "Renouveler" }).click();
  await expect(page.locator(".agenda-closed-on")).toHaveText("Clos le 25/11/2026");
  await click(page, "Rouvrir");
  await expect(page.getByRole("button", { name: "Clore", exact: true })).toBeVisible();
  expect(await saved(page, "Pro/salons/domaines.md")).not.toContain("clos-le");
});

test("placer un événement dans la corbeille : la confirmation peut être refusée, puis la grille revient", async ({
  page,
}) => {
  await openSalons(page);
  await cell(page, 1).locator(".agenda-line").click();
  await click(page, "Placer dans la corbeille");
  await expect(confirmation(page)).toContainText("Placer « Audit ISO » dans la corbeille ?");
  await confirmation(page).getByRole("button", { name: "Annuler" }).click();
  expect(await saved(page, "Pro/salons/audit.md")).not.toBeNull();
  await click(page, "Placer dans la corbeille");
  await confirmation(page).getByRole("button", { name: "Placer dans la corbeille" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
  expect(await saved(page, "Pro/salons/audit.md")).toBeNull();
  expect(await lines(cell(page, 1))).toEqual([]);
  expect(await page.evaluate(() => "Pro/salons/audit.md" in window.backend.trash.notes)).toBe(true);
});

test("une modification venue du disque relit la grille", async ({ page }) => {
  await openSalons(page);
  await page.evaluate(
    (content) => window.backend.changeOutside("Pro/salons/neuf.md", content),
    event("Salon neuf", ["mois: 9"]),
  );
  await expect(cell(page, 9).locator(".agenda-line")).toHaveText(["Salon neuf"]);
});
