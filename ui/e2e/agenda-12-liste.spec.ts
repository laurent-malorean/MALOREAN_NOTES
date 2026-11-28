import { expect, type Locator, type Page, test } from "@playwright/test";
import { event, launch, NOTES, type Notes, SHOTS } from "./agenda-12-common";

// Agenda 12 (fiche 0104), vue liste du 28/11 : basculer de la grille à la liste, voir les groupes par mois, ouvrir un
// événement, revenir, le choix gardé ; puis l'aspect de la liste (colonnes alignées, rien ne déborde) en clair et en
// sombre, large et étroit. Les captures vont dans le dossier des maquettes quand `MAQUETTES` le nomme.

const WEBSUBMIT = event("WebSubmit", [
  ...["mois: 10", "jour: 5", "annee: 2026", "jour-fin: 11", "pays: PT", "ville: Lisbonne"],
  "tags: [salon]",
]);
const MORE: Notes = {
  "Pro/salons/websubmit.md": { content: WEBSUBMIT, modified: 60 },
  "Pro/salons/devcon.md": {
    content: event("DevCon", [
      ...["mois: 10", "jour: 22", "annee: 2026", "pays: FR"],
      "ville: Lyon",
    ]),
    modified: 61,
  },
  "Pro/salons/sans-lieu.md": {
    content: event("Séminaire interne qui a un titre assez long pour passer sur deux lignes", [
      ...["mois: 10", "jour: 30", "annee: 2026"],
    ]),
    modified: 62,
  },
  "Pro/salons/fin-de-mois.md": {
    content: event("Conférence de fin de mois", [
      ...["mois: 1", "jour: 30", "annee: 2027", "jour-fin: 2", "mois-fin: 2", "pays: DE"],
      "ville: Berlin",
    ]),
    modified: 63,
  },
};
const RICH: Notes = { ...NOTES, ...MORE };

const saved = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/agenda-12-liste-${name}.png` });
};
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const group = (page: Page, month: number) =>
  page.locator(`.agenda-month-group[data-month="${month}"]`);

async function openSalons(page: Page, notes: Notes, appearance = "light") {
  await launch(page, notes);
  await page.evaluate((value) => (document.documentElement.dataset.appearance = value), appearance);
  await page.locator(".folder-item", { hasText: "Pro" }).click();
  await page.locator(".note-item", { hasText: "Salons" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
}

type Box = { x: number; y: number; width: number; height: number };
async function box(target: Locator): Promise<Box> {
  const rect = await target.boundingBox();
  if (rect === null) throw new Error("élément invisible");
  return rect;
}

test("basculer en liste, voir les groupes par mois, ouvrir un événement, revenir ; le choix est gardé", async ({
  page,
}) => {
  await openSalons(page, NOTES);
  await expect(page.locator(".agenda-grid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vue grille" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await click(page, "Vue liste");
  await expect(page.locator(".agenda-list")).toBeVisible();
  await expect(page.locator(".agenda-grid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vue liste" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".agenda-columns")).toBeHidden();
  expect(await saved(page, "Pro/salons.md")).toContain("vue: liste");
  await expect(page.locator(".agenda-list .agenda-month")).toHaveText([
    ...["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
    ...["Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  ]);
  await expect(group(page, 1).locator(".agenda-line")).toHaveText(["15/01 – Audit ISO"]);
  await expect(group(page, 2).locator(".agenda-line")).toHaveText([
    "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World",
    "2029 – Renouveler malorean.fr",
  ]);
  await expect(page.locator(".agenda-list .agenda-line")).toHaveCount(3);

  // Le filtre vaut en liste ; « Archives » aussi, et ramène à la liste.
  await page.locator(".agenda-filter").selectOption("salon");
  await expect(page.locator(".agenda-list .agenda-line")).toHaveCount(1);
  await page.locator(".agenda-filter").selectOption("");
  await click(page, "Archives");
  await expect(page.locator(".agenda-archives .agenda-event")).toHaveCount(1);
  await click(page, "Liste");
  await expect(page.locator(".agenda-list")).toBeVisible();

  // Un mois sans événement a son « + », qui crée l'événement du mois.
  await group(page, 3).getByRole("button", { name: "Ajouter un événement en mars" }).click();
  expect(await saved(page, "Pro/salons/sans-titre.md")).toContain("mois: 3");
  await click(page, "← Salons");
  await expect(page.locator(".agenda-list")).toBeVisible();
  await expect(group(page, 3).locator(".agenda-line")).toHaveText(["Sans titre"]);

  // Un clic sur une ligne ouvre l'événement ; revenir à l'agenda 12 retrouve la liste.
  await group(page, 1).locator(".agenda-line").click();
  await expect(page.locator(".agenda-band")).toBeVisible();
  await click(page, "← Salons");
  await expect(page.locator(".agenda-list")).toBeVisible();

  await click(page, "Vue grille");
  await expect(page.locator(".agenda-grid")).toBeVisible();
  await expect(page.locator(".agenda-list")).toHaveCount(0);
  await expect(page.locator(".agenda-columns")).toBeVisible();
  expect(await saved(page, "Pro/salons.md")).toContain("vue: grille");
});

test("l'agenda 12 gardé en liste s'ouvre en liste", async ({ page }) => {
  await openSalons(page, {
    ...NOTES,
    "Pro/salons.md": { content: "---\ntype: agenda-12\nvue: liste\n---\n# Salons\n", modified: 40 },
  });
  await expect(page.locator(".agenda-list")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vue liste" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

for (const appearance of ["light", "dark"]) {
  const name = appearance === "dark" ? "sombre" : "clair";

  test(`la liste large : date, lieu et titre alignés en colonnes d'un mois à l'autre (thème ${appearance})`, async ({
    page,
  }) => {
    await openSalons(page, RICH, appearance);
    await click(page, "Vue liste");
    await expect(page.locator(".agenda-list")).toBeVisible();
    await shot(page, `large-${name}`);
    await group(page, 12).scrollIntoViewIfNeeded();
    await shot(page, `large-fin-${name}`);
    await group(page, 1).scrollIntoViewIfNeeded();
    const lines = page.locator(".agenda-list .agenda-line");
    const lefts = async (part: string) =>
      await lines
        .locator(`.agenda-${part}`)
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    // La pastille de l'année, le lieu et le titre ont chacun un seul bord gauche dans toute la liste.
    expect(new Set(await lefts("year")).size).toBe(1);
    expect(new Set(await lefts("place")).size).toBe(1);
    expect(new Set(await lefts("title")).size).toBe(1);
    // Chaque ligne tient sur un rang quand son titre est court : date, lieu et titre sur la même ligne.
    const line = group(page, 10).locator(".agenda-line", { hasText: "WebSubmit" });
    const date = await box(line.locator(".agenda-date"));
    const place = await box(line.locator(".agenda-place"));
    const title = await box(line.locator(".agenda-title"));
    expect(date.x + date.width).toBeLessThanOrEqual(place.x + 1);
    expect(place.x + place.width).toBeLessThanOrEqual(title.x + 1);
    expect(Math.abs(date.y - title.y)).toBeLessThan(title.height);
    // Rien ne déborde de la page.
    const body = page.locator(".agenda-body");
    expect(await body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    // Le titre d'un mois domine ses lignes ; un mois vide est en retrait.
    const sizes = await page.evaluate(() => {
      const size = (selector: string) =>
        Number.parseFloat(getComputedStyle(document.querySelector(selector) as Element).fontSize);
      return [
        size('.agenda-month-group[data-month="10"] .agenda-month'),
        size('.agenda-month-group[data-month="10"] .agenda-title'),
      ];
    });
    expect(sizes[0]).toBeGreaterThan(sizes[1] ?? 0);
    const empty = await group(page, 3).evaluate((e) => (e as HTMLElement).dataset.empty);
    expect(empty).toBe("true");
  });

  test(`la liste étroite : la ligne passe sur deux rangs sans rien déborder, un clic ouvre l'événement (thème ${appearance})`, async ({
    page,
  }) => {
    await openSalons(page, RICH, appearance);
    await click(page, "Vue liste");
    await page.setViewportSize({ width: 920, height: 900 });
    const column = await box(page.locator(".column").first());
    expect(column.width).toBeLessThan(560);
    await expect(page.locator(".agenda-list")).toBeVisible();
    await shot(page, `etroite-${name}`);
    await group(page, 10).scrollIntoViewIfNeeded();
    await shot(page, `etroite-octobre-${name}`);
    const body = page.locator(".agenda-body");
    const edge = await box(body);
    expect(await body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    for (const line of await page.locator(".agenda-list .agenda-line").all()) {
      const rect = await box(line);
      expect(rect.x + rect.width).toBeLessThanOrEqual(edge.x + edge.width + 0.5);
      const parts = await line.evaluate((row) => {
        const top = (selector: string) =>
          row.querySelector(selector)?.getBoundingClientRect() ?? null;
        const date = top(".agenda-date");
        const title = top(".agenda-title");
        return { dateBottom: date?.bottom ?? null, titleTop: title?.top ?? 0 };
      });
      if (parts.dateBottom !== null)
        expect(parts.titleTop).toBeGreaterThanOrEqual(parts.dateBottom - 1);
    }
    await group(page, 10).locator(".agenda-line", { hasText: "WebSubmit" }).click();
    await expect(page.locator(".agenda-band")).toBeVisible();
  });
}
