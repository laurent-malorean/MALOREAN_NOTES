import { expect, type Locator, type Page, test } from "@playwright/test";
import { band, event, field, launch, NOTES, type Notes, SHOTS } from "./agenda-12-common";

// Agenda 12 (fiche 0104), refonte du design du 28/11 : la bande d'un événement en groupes « Quand » et « Où »,
// son en-tête technique replié, la grille et la fenêtre de clôture, en clair et en sombre, en largeur confortable
// et dans une colonne étroite. Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

const WEBSUBMIT = event("WebSubmit", [
  ...["mois: 10", "jour: 5", "annee: 2026", "jour-fin: 11", "pays: PT", "ville: Lisbonne"],
  "tags: [salon]",
]);
const NOTES_WITH_WEBSUBMIT: Notes = {
  ...NOTES,
  "Pro/salons/websubmit.md": { content: WEBSUBMIT, modified: 60 },
};

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-12-${name}.png` });
};
const confirmation = (page: Page) => page.getByRole("dialog", { name: "Confirmation" });

async function openWebSubmit(page: Page, appearance: string) {
  await launch(page, NOTES_WITH_WEBSUBMIT);
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
  await page.locator(".folder-item", { hasText: "Pro" }).click();
  await page.locator(".note-item", { hasText: "Salons" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
}

type Box = { x: number; y: number; width: number; height: number };

/** Le rectangle d'un élément visible. */
async function box(target: Locator): Promise<Box> {
  const rect = await target.boundingBox();
  if (rect === null) throw new Error("élément invisible");
  return rect;
}

/** Rien de la bande (ni de la grille) ne dépasse du bord droit de son conteneur. */
async function noOverflow(scope: Locator) {
  const overflow = await scope.evaluate((root) => {
    const edge = root.getBoundingClientRect().right;
    const outside = [...root.querySelectorAll("input, select, button, p, span")].filter(
      (element) => (element as HTMLElement).offsetParent !== null,
    );
    return {
      scroll: root.scrollWidth - root.clientWidth,
      beyond: outside.filter((e) => e.getBoundingClientRect().right > edge + 0.5).length,
    };
  });
  expect(overflow).toEqual({ scroll: 0, beyond: 0 });
}

for (const appearance of ["light", "dark"]) {
  const name = appearance === "dark" ? "sombre" : "clair";

  test(`la bande d'un événement : résumé, boutons, titre, groupes Quand et Où, en-tête replié (thème ${appearance})`, async ({
    page,
  }) => {
    await openWebSubmit(page, appearance);
    await page.locator(".agenda-line", { hasText: "WebSubmit" }).click();
    await expect(field(page, "Titre")).toHaveValue("WebSubmit");
    await expect(page.locator(".agenda-summary")).toHaveText(
      "5 – 11 octobre 2026 · Lisbonne, Portugal",
    );

    // Le titre se lit comme un titre : grand, sans cadre tant qu'on ne le survole ni ne le modifie.
    const title = field(page, "Titre");
    expect(await title.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(
      await title.evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThan(24);

    // Quand : jour, mois, année, puis « au », jour et mois de la fin ; Où : pays, ville.
    const when = band(page).getByRole("group", { name: "Quand" });
    const where = band(page).getByRole("group", { name: "Où" });
    await expect(when.locator(".agenda-period-trigger")).toHaveText("5 – 11 octobre 2026");
    await expect(when.getByRole("button", { name: "Effacer la fin" })).toBeVisible();
    for (const label of ["Pays", "Ville"])
      await expect(where.locator(`[aria-label="${label}"]`)).toBeVisible();

    // Les boutons sont des boutons : « Clore » plein, la corbeille en icône.
    const close = band(page).getByRole("button", { name: "Clore", exact: true });
    expect(await close.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      band(page).getByRole("button", { name: "Placer dans la corbeille" }),
    ).toBeVisible();

    // L'en-tête technique est replié sur une ligne ; le fichier le garde ; un clic le montre.
    const properties = page.locator(".agenda-properties");
    await expect(properties).toHaveText("▸ Propriétés");
    await expect(page.locator(".cm-content")).not.toContainText("agenda-12-evenement");
    await shot(page, `evenement-${name}`);
    await noOverflow(band(page));
    await properties.click();
    await expect(page.locator(".cm-content")).toContainText("type: agenda-12-evenement");
    await expect(properties).toHaveText("▾ Propriétés");
    expect(
      await page.evaluate(() => window.backend.notes["Pro/salons/websubmit.md"]?.content),
    ).toBe(WEBSUBMIT);
    await shot(page, `evenement-proprietes-${name}`);

    // Un champ de la bande réécrit la clé, et le résumé le suit.
    await field(page, "Ville").fill("Porto");
    await field(page, "Ville").press("Enter");
    await expect(page.locator(".agenda-summary")).toHaveText(
      "5 – 11 octobre 2026 · Porto, Portugal",
    );
  });

  test(`la bande tient dans une colonne étroite, sans champ seul sur sa ligne (thème ${appearance})`, async ({
    page,
  }) => {
    await openWebSubmit(page, appearance);
    await page.locator(".agenda-line", { hasText: "WebSubmit" }).click();
    await expect(field(page, "Titre")).toHaveValue("WebSubmit");
    await page.setViewportSize({ width: 920, height: 900 });
    const column = await box(page.locator(".column").first());
    expect(column.width).toBeGreaterThanOrEqual(420);
    expect(column.width).toBeLessThan(560);
    await expect(page.locator(".agenda-properties")).toBeVisible();
    await shot(page, `evenement-etroit-${name}`);
    await noOverflow(band(page));
    // Pays et Ville ne laissent pas un grand vide : côte à côte, ils remplissent la ligne ; sinon chacun la remplit.
    const [country, city] = [await box(field(page, "Pays")), await box(field(page, "Ville"))];
    const full = (await box(band(page).getByRole("group", { name: "Où" }))).width;
    const sameRow = Math.abs(country.y - city.y) < 1;
    expect(
      sameRow ? country.width + city.width : Math.min(country.width, city.width),
    ).toBeGreaterThan(full * 0.8);
  });

  test(`la grille et les archives : cases de même hauteur, lignes lisibles, une colonne étroite sans débordement (thème ${appearance})`, async ({
    page,
  }) => {
    await openWebSubmit(page, appearance);
    await shot(page, `grille-${name}`);
    const heights = await page
      .locator(".agenda-cell")
      .evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().height)));
    expect(new Set(heights.slice(0, 4)).size).toBe(1);
    // Chaque case vide a son « + », chaque case pleine le sien dans son en-tête.
    await expect(page.getByRole("button", { name: /^Ajouter un événement en / })).toHaveCount(12);
    await expect(page.locator(".agenda-add-empty")).toHaveCount(9);
    await page.setViewportSize({ width: 920, height: 900 });
    await page.getByRole("button", { name: "3 colonnes" }).click();
    await expect(page.locator(".agenda-grid")).toHaveCSS(
      "grid-template-columns",
      /^\S+px \S+px \S+px$/,
    );
    await shot(page, `grille-etroite-${name}`);
    await noOverflow(page.locator(".agenda-body"));
    // Dans une case étroite, rien d'une ligne ne dépasse de la case.
    for (const cell of await page.locator(".agenda-cell").all()) await noOverflow(cell);
    await page.getByRole("button", { name: "Archives" }).click();
    await expect(page.locator(".agenda-archives .agenda-event")).toHaveCount(1);
    await shot(page, `archives-${name}`);
    await noOverflow(page.locator(".agenda-body"));
  });

  test(`la fenêtre de clôture : trois choix l'un sous l'autre, l'action principale en haut (thème ${appearance})`, async ({
    page,
  }) => {
    await openWebSubmit(page, appearance);
    await page.locator(".agenda-line", { hasText: "WebSubmit" }).click();
    await band(page).getByRole("button", { name: "Clore", exact: true }).click();
    const dialog = confirmation(page);
    await expect(dialog).toContainText("Clore « WebSubmit » ? Il passe dans les archives.");
    const [successor, alone, cancel] = [
      await box(dialog.getByRole("button", { name: "Clore et préparer le suivant" })),
      await box(dialog.getByRole("button", { name: "Clore", exact: true })),
      await box(dialog.getByRole("button", { name: "Annuler" })),
    ];
    expect(successor.y).toBeLessThan(alone.y);
    expect(alone.y).toBeLessThan(cancel.y);
    const outer = await box(dialog);
    for (const inner of [successor, alone, cancel])
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    await shot(page, `clore-${name}`);
    await dialog.getByRole("button", { name: "Annuler" }).click();
  });
}

test("un événement clos montre son état en pastille et « Rouvrir » à la place de « Clore »", async ({
  page,
}) => {
  await openWebSubmit(page, "light");
  await page.getByRole("button", { name: "Archives" }).click();
  await page.locator(".agenda-archives .agenda-line").click();
  await expect(page.locator(".agenda-closed-on")).toHaveText("Clos le 01/06/2026");
  await expect(band(page).getByRole("button", { name: "Rouvrir" })).toBeVisible();
  await expect(band(page).getByRole("button", { name: "Clore", exact: true })).toBeHidden();
  await shot(page, "evenement-clos");
});
