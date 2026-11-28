import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  band,
  chooseYear,
  dayCell,
  event,
  field,
  launch,
  monthCell,
  NOTES,
  type Notes,
  period,
  periodPopup,
  SHOTS,
  yearBar,
} from "./agenda-12-common";

// Agenda 12 (fiche 0104), la ligne « Quand » de la bande (spécification §§ 4.3 et 4.4) : le sélecteur de période,
// sa fenêtre (année, mois, calendrier, plage), la cohérence de la fin avec le début, la mise en page « Quand » et
// « Où ». Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

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
  // Une fin avant le début, écrite à la main : le faux moteur la rend telle quelle, l'écran la montre en erreur.
  "Pro/salons/erreur.md": {
    content: event("Salon à la main", ["mois: 6", "jour: 20", "jour-fin: 3"]),
    modified: 57,
  },
  "Pro/salons/scolaire.md": {
    content: event("Année scolaire", [
      ...["mois: 9", "jour: 13", `annee: ${String(YEAR)}`, "jour-fin: 23", "mois-fin: 6"],
    ]),
    modified: 56,
  },
  "Pro/salons/nu.md": { content: event("Salon sans date", ["mois: 9"]), modified: 55 },
};

const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? "", path);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-12-${name}.png` });
};
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

test("le champ de période dit la date en toutes lettres ; un clic ouvre la fenêtre : année, 12 mois, calendrier", async ({
  page,
}) => {
  await openEvent(page, "WebSubmit");
  await expect(period(page)).toHaveText(`5 – 11 octobre ${String(YEAR + 1)}`);
  await expect(page.locator(".agenda-summary")).toHaveText(
    `5 – 11 octobre ${String(YEAR + 1)} · Lisbonne, Portugal`,
  );
  await period(page).click();
  await expect(periodPopup(page)).toBeVisible();
  await expect(yearBar(page)).toHaveText(String(YEAR + 1));
  const months = await Promise.all(
    Array.from({ length: 12 }, (_, i) => box(monthCell(page, i + 1))),
  );
  expect(new Set(months.map((m) => Math.round(m.y))).size).toBe(4);
  expect(new Set(months.map((m) => Math.round(m.x))).size).toBe(3);
  await expect(monthCell(page, 10)).toHaveAttribute("aria-pressed", "true");
  await expect(monthCell(page, 1)).toHaveText("janv.");
  await expect(page.locator(".agenda-period-weekday")).toHaveText([
    "l",
    "m",
    "m",
    "j",
    "v",
    "s",
    "d",
  ]);
  await expect(dayCell(page, 5)).toHaveAttribute("data-mark", "start");
  await expect(dayCell(page, 8)).toHaveAttribute("data-mark", "between");
  await expect(dayCell(page, 11)).toHaveAttribute("data-mark", "end");
  await shot(page, "periode-ouverte-clair");
});

test("choisir 2028, septembre, puis le 13 et le 23 : la fenêtre se ferme, le fichier porte la date", async ({
  page,
}) => {
  await openEvent(page, "Salon sans date");
  await period(page).click();
  await chooseYear(page, 2028);
  await expect(yearBar(page)).toHaveText("2028");
  await expect.poll(() => saved(page, "Pro/salons/nu.md")).toContain("annee: 2028");
  await monthCell(page, 9).click();
  await dayCell(page, 20).click();
  await expect(page.locator(".agenda-period-hint")).toHaveText(
    "Choisissez le dernier jour, ou le même jour pour un seul jour.",
  );
  await shot(page, "periode-debut-clair");
  // Avant le début : la plage recommence (la fin avant le début ne se choisit pas).
  await dayCell(page, 13).click();
  await expect(dayCell(page, 13)).toHaveAttribute("data-mark", "start");
  await expect(dayCell(page, 20)).toHaveAttribute("data-mark", "plain");
  await dayCell(page, 23).click();
  await expect(periodPopup(page)).toBeHidden();
  await expect(period(page)).toHaveText("13 – 23 septembre 2028");
  await idle(page);
  const content = await saved(page, "Pro/salons/nu.md");
  for (const key of ["mois: 9", "jour: 13", "annee: 2028", "jour-fin: 23"])
    expect(content).toContain(key);
  expect(content).not.toContain("mois-fin");
});

test("le même jour deux fois fait un seul jour ; le calendrier suivant termine une plage sur le mois suivant", async ({
  page,
}) => {
  await openEvent(page, "Salon sans date");
  await period(page).click();
  await dayCell(page, 30).click();
  await dayCell(page, 30).click();
  await expect(periodPopup(page)).toBeHidden();
  await expect(period(page)).toHaveText("30 septembre");
  await idle(page);
  expect(await saved(page, "Pro/salons/nu.md")).not.toContain("jour-fin");
  await period(page).click();
  await page.getByRole("button", { name: "Mois suivant" }).click();
  await expect(page.locator(".agenda-period-view")).toHaveText("octobre");
  await dayCell(page, 2).click();
  await expect(periodPopup(page)).toBeHidden();
  await expect(period(page)).toHaveText("30 septembre – 2 octobre");
  await idle(page);
  const content = await saved(page, "Pro/salons/nu.md");
  expect(content).toContain("jour-fin: 2");
  expect(content).toContain("mois-fin: 10");
  expect(content).not.toContain("annee");
});

test("« Effacer la fin » du champ et de la fenêtre, « Mois entier » : la fin puis le jour s'effacent", async ({
  page,
}) => {
  await openEvent(page, "WebSubmit");
  await page.locator(".agenda-period-clear").click();
  await expect(period(page)).toHaveText(`5 octobre ${String(YEAR + 1)}`);
  await idle(page);
  expect(await saved(page, "Pro/salons/websubmit.md")).not.toContain("jour-fin");
  await period(page).click();
  await periodPopup(page).getByRole("button", { name: "Mois entier" }).click();
  await expect(period(page)).toHaveText(`octobre ${String(YEAR + 1)}`);
  await idle(page);
  expect(await saved(page, "Pro/salons/websubmit.md")).not.toContain("jour:");
});

test("le sélecteur de période se manie au clavier : Entrée, flèches, Entrée, Échap", async ({
  page,
}) => {
  await openEvent(page, "Salon sans date");
  await period(page).focus();
  await page.keyboard.press("Enter");
  await expect(monthCell(page, 9)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(monthCell(page, 12)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await expect(monthCell(page, 8)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(periodPopup(page)).toBeHidden();
  await expect(period(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(period(page)).toHaveText("octobre");
  await idle(page);
  expect(await saved(page, "Pro/salons/nu.md")).toContain("mois: 10");
  await expect(periodPopup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(period(page)).toBeFocused();
});

test("un clic à côté ferme la fenêtre, sans rien écrire", async ({ page }) => {
  await openEvent(page, "Salon sans date");
  await period(page).click();
  await field(page, "Titre").click();
  await expect(periodPopup(page)).toBeHidden();
  expect(await saved(page, "Pro/salons/nu.md")).toBe(event("Salon sans date", ["mois: 9"]));
});

test("une année hors plage reste choisie dans la liste", async ({ page }) => {
  await openEvent(page, "Salon ancien");
  await period(page).click();
  await expect(yearBar(page)).toHaveText("2019");
  await yearBar(page).click();
  await expect(
    periodPopup(page).getByRole("option", { name: "2019", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(periodPopup(page).getByRole("option")).toHaveCount(13);
});

test("changer le mois de début au-delà de la fin ramène la fin au début, avec un message", async ({
  page,
}) => {
  await openEvent(page, "WebSubmit");
  await period(page).click();
  await page.getByRole("button", { name: "Mois suivant" }).click();
  await dayCell(page, 2).click();
  await expect(period(page)).toHaveText(`5 octobre – 2 novembre ${String(YEAR + 1)}`);
  await idle(page);
  await period(page).click();
  await monthCell(page, 11).click();
  await expect(message(page)).toHaveText("La fin a été ramenée au début.");
  await expect(period(page)).toHaveText(`5 novembre ${String(YEAR + 1)}`);
  const content = await saved(page, "Pro/salons/websubmit.md");
  expect(content).toContain("mois: 11");
  expect(content).not.toContain("jour-fin");
  await shot(page, "fin-ramenee");
});

test("une fin avant le début écrite à la main est montrée en erreur, sans réécrire le fichier", async ({
  page,
}) => {
  await openEvent(page, "Salon à la main");
  await expect(period(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".agenda-end-note")).toHaveText("La fin est avant le début.");
  expect(await saved(page, "Pro/salons/erreur.md")).toBe(
    event("Salon à la main", ["mois: 6", "jour: 20", "jour-fin: 3"]),
  );
  await shot(page, "fin-erreur-clair");
});

test("une fin dans un mois antérieur passe à l'année suivante : signalée, pas refusée", async ({
  page,
}) => {
  await openEvent(page, "Année scolaire");
  await expect(page.locator(".agenda-end-note")).toHaveText("Fin l'année suivante.");
  await expect(period(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(period(page)).toHaveText(
    `13 septembre ${String(YEAR)} – 23 juin ${String(YEAR + 1)}`,
  );
  await shot(page, "fin-annee-suivante");
});

for (const appearance of ["light", "dark"]) {
  const name = appearance === "dark" ? "sombre" : "clair";

  test(`le champ fermé, la fenêtre ouverte et la plage surlignée, en large et en colonne étroite (thème ${appearance})`, async ({
    page,
  }) => {
    await openEvent(page, "WebSubmit", appearance);
    await shot(page, `periode-ferme-${name}`);
    // « Quand » et « Où » ont la même hauteur de champ et la même largeur.
    const when = await box(period(page));
    const city = await box(field(page, "Ville"));
    expect(when.height).toBe(city.height);
    await period(page).click();
    await shot(page, `periode-large-${name}`);
    const wide = await box(periodPopup(page));
    expect(wide.x + wide.width).toBeLessThanOrEqual(1500);
    expect(wide.y + wide.height).toBeLessThanOrEqual(900);
    const accent = await dayCell(page, 5).evaluate((e) => getComputedStyle(e).backgroundColor);
    const between = await dayCell(page, 8).evaluate((e) => getComputedStyle(e).backgroundColor);
    const plain = await dayCell(page, 15).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(accent).not.toBe(plain);
    expect(between).not.toBe(plain);
    expect(between).not.toBe(accent);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 920, height: 900 });
    const column = await box(page.locator(".column").first());
    expect(column.width).toBeGreaterThanOrEqual(420);
    await period(page).click();
    await shot(page, `periode-etroit-${name}`);
    const narrow = await box(periodPopup(page));
    expect(narrow.x).toBeGreaterThanOrEqual(column.x);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
    expect(narrow.y + narrow.height).toBeLessThanOrEqual(900);
    await page.keyboard.press("Escape");
    await shot(page, `quand-etroit-${name}`);
  });
}
