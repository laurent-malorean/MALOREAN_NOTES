import { expect, type Locator, type Page, test } from "@playwright/test";
import { band, event, field, launch, NOTES, type Notes, SHOTS } from "./agenda-12-common";

// Agenda 12 (fiche 0104), les champs de la date de la bande (spécification §§ 4.3 et 4.4) : le sélecteur de jour en
// grille, la liste des années, la cohérence de la fin avec le début. Les captures vont dans le dossier des maquettes
// quand `MAQUETTES` le nomme.

const YEAR = new Date().getFullYear();
const WEBSUBMIT = event("WebSubmit", [
  ...["mois: 10", "jour: 5", `annee: ${String(YEAR + 1)}`, "jour-fin: 11", "pays: PT"],
  ...["ville: Lisbonne", "tags: [salon]"],
]);
const NOTES_WITH_DATES: Notes = {
  ...NOTES,
  "Pro/salons/websubmit.md": { content: WEBSUBMIT, modified: 60 },
  "Pro/salons/ancien.md": {
    content: event("Salon ancien", ["mois: 3", "jour: 4", "annee: 2019"]),
    modified: 59,
  },
  "Pro/salons/lointain.md": {
    content: event("Salon lointain", ["mois: 3", "annee: 2051"]),
    modified: 58,
  },
  // Une fin avant le début, écrite à la main : le faux moteur la rend telle quelle, l'écran la montre en erreur.
  "Pro/salons/erreur.md": {
    content: event("Salon à la main", ["mois: 6", "jour: 20", "jour-fin: 3"]),
    modified: 57,
  },
  "Pro/salons/scolaire.md": {
    content: event("Année scolaire", [
      "mois: 9",
      "jour: 13",
      `annee: ${String(YEAR)}`,
      "jour-fin: 23",
      "mois-fin: 6",
    ]),
    modified: 56,
  },
};

const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? "", path);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-12-${name}.png` });
};
const popup = (page: Page) => page.locator(".agenda-day-popup");
const day = (page: Page, n: number) =>
  popup(page).getByRole("button", { name: String(n), exact: true });
const idle = (page: Page) => expect(band(page)).not.toHaveAttribute("aria-busy", "true");
const message = (page: Page) => page.locator(".agenda-band-message");

async function openEvent(page: Page, title: string, appearance = "light") {
  await launch(page, NOTES_WITH_DATES);
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
  await page.locator(".folder-item", { hasText: "Pro" }).click();
  await page.locator(".note-item", { hasText: "Salons" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
  await page.locator(".agenda-line", { hasText: title }).click();
  await expect(field(page, "Titre")).toHaveValue(title);
}

type Box = { x: number; y: number; width: number; height: number };
async function box(target: Locator): Promise<Box> {
  const rect = await target.boundingBox();
  if (rect === null) throw new Error("élément invisible");
  return rect;
}

test("le jour se choisit dans une grille : 4 lignes dont 3 de 10 cases, cases carrées alignées, jours impossibles grisés", async ({
  page,
}) => {
  await openEvent(page, "Salon Embedded World");
  await field(page, "Jour").click();
  await expect(popup(page)).toBeVisible();
  const cells = await Promise.all(Array.from({ length: 31 }, (_, i) => box(day(page, i + 1))));
  const tops = [...new Set(cells.map((c) => Math.round(c.y)))];
  expect(tops).toHaveLength(4);
  const perRow = tops.map((top) => cells.filter((c) => Math.round(c.y) === top).length);
  expect(perRow).toEqual([10, 10, 10, 1]);
  const [first] = cells;
  for (const c of cells) {
    expect(Math.abs(c.width - c.height)).toBeLessThan(1);
    expect(Math.abs(c.width - (first?.width ?? 0))).toBeLessThan(1);
  }
  for (const [a, b] of [
    [1, 11],
    [11, 21],
    [21, 31],
    [5, 25],
  ] as const)
    expect(Math.abs((cells[a - 1]?.x ?? 0) - (cells[b - 1]?.x ?? 1))).toBeLessThan(1);
  // Février 2027 : pas de 29, 30 ni 31.
  for (const n of [29, 30, 31]) await expect(day(page, n)).toBeDisabled();
  await expect(day(page, 28)).toBeEnabled();
  await expect(day(page, 10)).toHaveAttribute("aria-pressed", "true");
  await shot(page, "jour-ouvert-clair");
  await day(page, 12).click();
  await expect(field(page, "Jour")).toHaveText("12");
  await expect(popup(page)).toBeHidden();
  await expect(field(page, "Jour")).toBeFocused();
  await expect.poll(() => saved(page, "Pro/salons/embedded.md")).toContain("jour: 12");
});

test("le sélecteur de jour se manie au clavier : Entrée, flèches, Entrée, Échap, Tab", async ({
  page,
}) => {
  await openEvent(page, "Salon Embedded World");
  await field(page, "Jour").focus();
  await page.keyboard.press("Enter");
  await expect(day(page, 10)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(day(page, 21)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(popup(page)).toBeHidden();
  await expect(field(page, "Jour")).toBeFocused();
  await expect.poll(() => saved(page, "Pro/salons/embedded.md")).toContain("jour: 20");
  await idle(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toBeHidden();
  await expect(field(page, "Jour")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await expect(day(page, 28)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Aucun jour" })).toBeFocused();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(popup(page)).toBeHidden();
});

test("un clic à côté ferme la fenêtre des jours", async ({ page }) => {
  await openEvent(page, "Salon Embedded World");
  await field(page, "Fin : jour").click();
  await expect(popup(page)).toHaveAttribute("aria-label", "Choisir le jour de fin");
  await field(page, "Titre").click();
  await expect(popup(page)).toBeHidden();
});

test("l'année est une liste : l'année en cours et les dix suivantes, et « — » ; une année hors plage reste choisie", async ({
  page,
}) => {
  await openEvent(page, "Salon Embedded World");
  const year = field(page, "Année");
  const options = await year.locator("option").allTextContents();
  expect(options).toEqual(["—", ...Array.from({ length: 11 }, (_, i) => String(YEAR + i))]);
  await year.selectOption(String(YEAR + 3));
  await expect
    .poll(() => saved(page, "Pro/salons/embedded.md"))
    .toContain(`annee: ${String(YEAR + 3)}`);
  await idle(page);
  await year.selectOption("");
  await expect.poll(() => saved(page, "Pro/salons/embedded.md")).not.toContain("annee:");
  await idle(page);

  await page.getByRole("button", { name: "← Salons" }).click();
  await page.locator(".agenda-line", { hasText: "Salon ancien" }).click();
  await expect(field(page, "Année")).toHaveValue("2019");
  await expect(field(page, "Année").locator("option")).toHaveCount(13);
  await page.getByRole("button", { name: "← Salons" }).click();
  await page.locator(".agenda-line", { hasText: "Salon lointain" }).click();
  await expect(field(page, "Année")).toHaveValue("2051");
  expect((await saved(page, "Pro/salons/lointain.md")).includes("annee: 2051")).toBe(true);
});

test("changer le début au-delà de la fin ramène la fin au début, avec un message", async ({
  page,
}) => {
  await openEvent(page, "Salon Embedded World");
  await field(page, "Fin : jour").click();
  for (const n of [1, 9]) await expect(day(page, n)).toBeDisabled();
  await expect(day(page, 10)).toBeEnabled();
  await page.keyboard.press("Escape");
  await field(page, "Jour").click();
  await day(page, 14).click();
  await expect(message(page)).toHaveText("La fin a été ramenée au début.");
  await expect(field(page, "Jour")).toHaveText("14");
  await expect(field(page, "Fin : jour")).toHaveText("—");
  const content = await saved(page, "Pro/salons/embedded.md");
  expect(content).toContain("jour: 14");
  expect(content).not.toContain("jour-fin");
  await shot(page, "fin-ramenee");
  // Un début qui ne dépasse pas la fin ne dit rien.
  await field(page, "Fin : jour").click();
  await day(page, 20).click();
  await expect(field(page, "Fin : jour")).toHaveText("20");
  await expect(message(page)).toBeHidden();
  await idle(page);
  await field(page, "Jour").click();
  await day(page, 18).click();
  await expect(field(page, "Jour")).toHaveText("18");
  await expect(message(page)).toBeHidden();
});

test("une fin avant le début écrite à la main est montrée en erreur, sans réécrire le fichier", async ({
  page,
}) => {
  await openEvent(page, "Salon à la main");
  await expect(field(page, "Fin : jour")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".agenda-end-note")).toHaveText("La fin est avant le début.");
  await expect(field(page, "Fin : jour")).toHaveText("3");
  expect(await saved(page, "Pro/salons/erreur.md")).toBe(
    event("Salon à la main", ["mois: 6", "jour: 20", "jour-fin: 3"]),
  );
  await shot(page, "fin-erreur-clair");
});

test("une fin dans un mois antérieur passe à l'année suivante : elle est signalée, pas refusée", async ({
  page,
}) => {
  await openEvent(page, "Année scolaire");
  await expect(page.locator(".agenda-end-note")).toHaveText("Fin l'année suivante.");
  await expect(field(page, "Fin : jour")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".agenda-summary")).toHaveText(
    `13 septembre ${String(YEAR)} – 23 juin ${String(YEAR + 1)}`,
  );
  await shot(page, "fin-annee-suivante");
});

for (const appearance of ["light", "dark"]) {
  const name = appearance === "dark" ? "sombre" : "clair";

  test(`la fenêtre des jours : grille et couleurs du thème, dans la fenêtre et dans une colonne étroite (thème ${appearance})`, async ({
    page,
  }) => {
    await openEvent(page, "WebSubmit", appearance);
    await field(page, "Jour").click();
    await shot(page, `jour-large-${name}`);
    const wide = await box(popup(page));
    expect(wide.x + wide.width).toBeLessThanOrEqual(1500);
    expect(wide.y + wide.height).toBeLessThanOrEqual(900);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 920, height: 900 });
    const column = await box(page.locator(".column").first());
    expect(column.width).toBeGreaterThanOrEqual(420);
    await field(page, "Fin : jour").click();
    await shot(page, `jour-etroit-${name}`);
    const narrow = await box(popup(page));
    expect(narrow.x).toBeGreaterThanOrEqual(column.x);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(920);
    // Le jour choisi est à la couleur d'accent, un jour impossible est grisé.
    const accent = await day(page, 11).evaluate((e) => getComputedStyle(e).backgroundColor);
    const plain = await day(page, 12).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(accent).not.toBe(plain);
    await expect(day(page, 4)).toBeDisabled();
    await page.keyboard.press("Escape");
    await shot(page, `quand-etroit-${name}`);
  });
}
