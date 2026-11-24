import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Canvas, à la souris, dans le vrai écran : création par le menu et le clic droit, affichage de chaque sorte de
// carte et de flèche (rectangles réels mesurés), thèmes clair et sombre, déplacement, double-clic, couleurs, image.
// Les captures vont dans le dossier nommé par `CAPTURES` quand il est défini.

const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .CAPTURES;
const card = (id: string, type: string, extra: Record<string, unknown>) => ({ id, type, ...extra });
const CANVAS = JSON.stringify({
  nodes: [
    card("a1a1a1a1a1a1a1a1", "group", {
      x: 0,
      y: 0,
      width: 760,
      height: 420,
      color: "4",
      label: "Phase 1",
    }),
    card("b2b2b2b2b2b2b2b2", "text", {
      text: "# Idées\n\nun **texte** avec [[Autre note]]",
      x: 30,
      y: 40,
      width: 280,
      height: 150,
    }),
    card("c3c3c3c3c3c3c3c3", "text", {
      text: "Priorité haute",
      x: 400,
      y: 40,
      width: 220,
      height: 80,
      color: "1",
    }),
    card("d4d4d4d4d4d4d4d4", "file", { file: "Projet.md", x: 30, y: 250, width: 280, height: 100 }),
    card("e5e5e5e5e5e5e5e5", "file", {
      file: "img/dessin.png",
      x: 400,
      y: 220,
      width: 220,
      height: 140,
    }),
    card("f6f6f6f6f6f6f6f6", "link", {
      url: "https://jsoncanvas.org",
      x: 860,
      y: 40,
      width: 300,
      height: 120,
      color: "#2563eb",
    }),
    card("a7a7a7a7a7a7a7a7", "text", {
      text: "Orange",
      x: 860,
      y: 240,
      width: 160,
      height: 60,
      color: "2",
    }),
    card("a8a8a8a8a8a8a8a8", "text", {
      text: "Jaune",
      x: 1060,
      y: 240,
      width: 160,
      height: 60,
      color: "3",
    }),
    card("a9a9a9a9a9a9a9a9", "text", {
      text: "Violet",
      x: 860,
      y: 340,
      width: 160,
      height: 60,
      color: "6",
    }),
  ],
  edges: [
    {
      id: "0101010101010101",
      fromNode: "b2b2b2b2b2b2b2b2",
      fromSide: "right",
      toNode: "c3c3c3c3c3c3c3c3",
      toSide: "left",
      label: "détaille",
    },
    {
      id: "0202020202020202",
      fromNode: "c3c3c3c3c3c3c3c3",
      fromSide: "bottom",
      toNode: "e5e5e5e5e5e5e5e5",
      toSide: "top",
      fromEnd: "arrow",
      color: "5",
    },
    {
      id: "0303030303030303",
      fromNode: "d4d4d4d4d4d4d4d4",
      fromSide: "right",
      toNode: "e5e5e5e5e5e5e5e5",
      toSide: "left",
      toEnd: "none",
    },
    {
      id: "0404040404040404",
      fromNode: "c3c3c3c3c3c3c3c3",
      fromSide: "right",
      toNode: "f6f6f6f6f6f6f6f6",
      toSide: "left",
      color: "#ec6aa8",
    },
  ],
});
const NOTES = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
  "plan.canvas": { content: CANVAS, modified: 10 },
};

async function launch(page: Page, notes: Record<string, { content: string; modified: number }>) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(["Plans"]),
    remembered: "1",
  });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const saved = (page: Page, path: string) =>
  page.evaluate((p) => window.backend.notes[p]?.content ?? null, path);
/** Le rectangle réel d'un élément à l'écran. */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} n'est pas affiché`);
  return box;
}

/** `inner` tient dans `outer` (à un point près) et n'est pas écrasé. */
function expectInside(inner: Box, outer: Box) {
  expect(inner.width).toBeGreaterThan(30);
  expect(inner.height).toBeGreaterThan(20);
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

type Box = { x: number; y: number; width: number; height: number };
const idOf = (id: string) => `.canvas-card[data-id="${id}"]`;

for (const appearance of ["dark", "light"]) {
  test(`un canvas s'affiche : cartes, flèches, groupe, couleurs, rectangles réels (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page, NOTES);
    await page.evaluate(
      (value) => (document.documentElement.dataset.appearance = value),
      appearance,
    );
    await page.locator(".note-item", { hasText: "plan" }).click();
    const view = page.locator(".canvas-view");
    await expect(view).toBeVisible();
    await expect(page.locator(".cm-editor")).toBeHidden();
    await expect(page.locator(`${idOf("b2b2b2b2b2b2b2b2")} strong`)).toHaveText("texte");
    const area = await boxOf(page, ".canvas-surface");
    expect(area.height).toBeGreaterThan(400);
    // Tout le contenu est dans la vue, à sa taille réelle (pas écrasé).
    for (const id of [
      "a1a1a1a1a1a1a1a1",
      "b2b2b2b2b2b2b2b2",
      "c3c3c3c3c3c3c3c3",
      "d4d4d4d4d4d4d4d4",
      "f6f6f6f6f6f6f6f6",
      "a9a9a9a9a9a9a9a9",
    ])
      expectInside(await boxOf(page, idOf(id)), area);
    await expect(page.locator(`${idOf("d4d4d4d4d4d4d4d4")} a.canvas-card-note`)).toHaveText(
      "Projet",
    );
    await expect(page.locator(`${idOf("a1a1a1a1a1a1a1a1")} .canvas-group-label`)).toHaveText(
      "Phase 1",
    );
    await expect(page.locator(".canvas-arrow-head")).toHaveCount(4);
    await expect(page.locator(".canvas-arrow-label")).toHaveText("détaille");
    // Les couleurs viennent de la palette : le bord de la carte rouge est rouge dans les deux thèmes.
    const red = await page
      .locator(idOf("c3c3c3c3c3c3c3c3"))
      .evaluate((e) => getComputedStyle(e).borderTopColor);
    expect(red).toBe("rgb(220, 38, 38)");
    const blue = await page
      .locator(idOf("f6f6f6f6f6f6f6f6"))
      .evaluate((e) => getComputedStyle(e).borderTopColor);
    expect(blue).toBe("rgb(37, 99, 235)");
    const target = await boxOf(page, idOf("b2b2b2b2b2b2b2b2"));
    await page.mouse.click(target.x + 20, target.y + 120);
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/canvas-${appearance === "dark" ? "sombre" : "clair"}.png`,
      });
  });
}

test("créer un canvas par le menu Fichier, double-clic pour une carte texte, déplacer, colorer, annuler", async ({
  page,
}) => {
  await launch(page, { "courses.md": NOTES["courses.md"] });
  await page.evaluate(() => window.backend.chooseMenu("new-canvas"));
  const ask = page.getByRole("dialog", { name: "Nom du nouveau canvas" });
  await ask.getByRole("textbox").fill("Atelier");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(page.locator(".canvas-view")).toBeVisible();
  await expect.poll(() => saved(page, "atelier.canvas")).toContain('"nodes"');
  const surface = page.locator(".canvas-surface");
  await surface.dblclick({ position: { x: 400, y: 300 } });
  await page.keyboard.type("Première idée");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-text-body")).toHaveText("Première idée");
  await expect.poll(() => saved(page, "atelier.canvas")).toContain("Première idée");
  const cardBox = await boxOf(page, ".canvas-card");
  await page.mouse.move(cardBox.x + 40, cardBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 140, cardBox.y + 100, { steps: 5 });
  await page.mouse.up();
  const moved = await boxOf(page, ".canvas-card");
  expect(Math.round(moved.x - cardBox.x)).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Couleur" }).click();
  await page.locator('.canvas-swatch[data-color="bleu"]').click();
  await expect.poll(() => saved(page, "atelier.canvas")).toContain('"color": "#2563eb"');
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect.poll(() => saved(page, "atelier.canvas")).not.toContain("#2563eb");
});

test("le clic droit sur un dossier propose « Nouveau canvas » ; le canvas s'ouvre dans ce dossier", async ({
  page,
}) => {
  await launch(page, NOTES);
  await page.locator(".folder-item", { hasText: "Plans" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Nouveau canvas" }).click();
  const ask = page.getByRole("dialog", { name: "Nom du nouveau canvas" });
  await ask.getByRole("textbox").fill("Autre plan");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(page.locator(".canvas-view")).toBeVisible();
  await expect.poll(() => saved(page, "Plans/autre-plan.canvas")).not.toBeNull();
});

test("l'image PNG du canvas contient chaque carte dans un cadre à 40 points de marge", async ({
  page,
}) => {
  await launch(page, NOTES);
  await page.locator(".note-item", { hasText: "plan" }).click();
  await expect(page.locator(".canvas-view")).toBeVisible();
  await page.evaluate(() => window.backend.chooseMenu("canvas-export-image"));
  const path = "/Users/moi/Notes/plan.png";
  await expect
    .poll(() => page.evaluate((p) => window.backend.exportedImages[p]?.length ?? 0, path))
    .toBeGreaterThan(1000);
  const size = await page.evaluate(async (p) => {
    const bytes = window.backend.exportedImages[p] ?? new Uint8Array();
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    );
    return [bitmap.width, bitmap.height];
  }, path);
  // Cartes de 0,0 à 1220,420 : cadre de 1300 × 500 points, deux pixels par point.
  expect(size).toEqual([2600, 1000]);
});

test("choisir une image l'ajoute au canvas : la carte affiche l'image, on peut tracer une flèche vers une autre carte", async ({
  page,
}) => {
  const notes = {
    "dessins.canvas": {
      content: JSON.stringify({
        nodes: [],
        edges: [],
      }),
      modified: 10,
    },
  };
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: "[]",
    remembered: "1",
    servedImages: "1",
  });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await page.locator(".note-item", { hasText: "dessins" }).click();
  await expect(page.locator(".canvas-view")).toBeVisible();
  await page.evaluate(() => (document.documentElement.dataset.appearance = "dark"));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ajouter un média" }).click();
  await (await chooser).setFiles("e2e/served-image.png");
  const image = page.locator(".canvas-card img.canvas-card-image");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() => saved(page, "dessins.canvas"))
    .toContain('"file": "dessins.assets/served-image.png');
  // Pas d'erreur affichée.
  await expect(page.locator(".status")).not.toContainText("erreur");
  // Une autre carte, à gauche de l'image, puis une flèche de l'image vers elle.
  await page.locator(".canvas-surface").dblclick({ position: { x: 130, y: 560 } });
  await page.keyboard.type("Cible");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-text-body")).toHaveText("Cible");
  const from = page.locator(".canvas-card:has(img.canvas-card-image)");
  const fromBox = await boxOf(page, ".canvas-card:has(img.canvas-card-image)");
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  const dot = await from.locator(".canvas-link-dot-right").boundingBox();
  if (dot === null) throw new Error("le rond de la flèche n'est pas affiché");
  const target = await boxOf(page, ".canvas-card-text");
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".canvas-arrow-head")).toHaveCount(1);
  await expect.poll(() => saved(page, "dessins.canvas")).toContain('"toNode"');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/canvas-image-corrigee.png` });
});
