import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Carte mentale, à la souris : création par le menu Fichier et par le clic droit sur un dossier,
// ajout d'idées, couleur, pliage. Les captures de chaque écran vont dans le dossier des maquettes
// quand `MAQUETTES` le nomme.

const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .MAQUETTES;
const MAP = [
  "---",
  "type: carte-mentale",
  "tags: [projet]",
  "racines: [{x: 0, y: 0}, {x: 0, y: 320}]",
  "---",
  "# Lancement du produit",
  "",
  "- Clients <!-- couleur: bleu -->",
  "  - Artisans",
  "    > Premiers essais en janvier.",
  "    >",
  "    > - appeler **Martin**",
  "    - Plombiers",
  "    - Électriciens <!-- couleur: vert -->",
  "  - [[Grands comptes]]",
  "- Calendrier <!-- couleur: orange -->",
  "  - Bêta *fermée*",
  "  - Lancement public",
  "",
].join("\n");
const NOTES = {
  "courses.md": { content: "# Courses\n- lait", modified: 20 },
  "Idées/lancement.md": { content: MAP, modified: 10 },
};

async function launch(page: Page, notes: Record<string, { content: string; modified: number }>) {
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(["Idées"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const choose = (page: Page, id: string) => page.evaluate((id) => window.backend.chooseMenu(id), id);
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const node = (page: Page, title: string) =>
  page.locator(".mind-map-node:not(.mind-map-probe)", { hasText: title }).first();
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/carte-mentale-${name}.png` });
};

test("une carte mentale se crée par le menu Fichier, reçoit une idée par double-clic, puis un enfant et un frère", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 760 });
  await launch(page, { "courses.md": NOTES["courses.md"] });
  await choose(page, "new-mind-map");
  const ask = page.getByRole("dialog", { name: "Nom de la nouvelle carte mentale" });
  await shot(page, "nom");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("textbox").fill("Projet");
  await ask.getByRole("button", { name: "Créer" }).click();
  expect(await savedContent(page, "projet.md")).toBe("---\ntype: carte-mentale\n---\n# Projet\n");
  const map = page.locator(".mind-map");
  await expect(map).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeHidden();
  await expect(map.locator(".mind-map-empty")).toHaveText("Double-cliquez pour ajouter une idée.");
  await shot(page, "vide");

  await map.dblclick({ position: { x: 300, y: 200 } });
  await page.keyboard.type("Clients");
  await page.keyboard.press("Enter");
  await expect(node(page, "Clients")).toBeVisible();
  await expect
    .poll(() => savedContent(page, "projet.md"))
    .toMatch(
      /^---\ntype: carte-mentale\nracines: \[\{x: -?[\d.]+, y: -?[\d.]+\}\]\n---\n# Projet\n\n- Clients\n$/,
    );

  await page.keyboard.press("Tab");
  await page.keyboard.type("Artisans");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Grands comptes");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => savedContent(page, "projet.md"))
    .toContain("- Clients\n  - Artisans\n  - Grands comptes\n");
  await shot(page, "idees");
});

test("une carte existante se montre, se colore par le clic droit, se plie, se zoome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 760 });
  await launch(page, NOTES);
  await page.locator(".folder-item", { hasText: "Idées" }).click();
  await page.locator(".note-item", { hasText: "Lancement du produit" }).click();
  await expect(node(page, "Clients")).toBeVisible();
  await expect(node(page, "Plombiers")).toBeVisible();
  await expect(node(page, "Artisans").locator(".mind-map-detail")).toContainText("Premiers essais");
  await shot(page, "carte");

  await node(page, "Calendrier").click({ button: "right" });
  await expect(page.locator(".context-menu button")).toHaveCount(15);
  await shot(page, "menu");
  await page.locator(".context-menu button", { hasText: "violet" }).click();
  await expect
    .poll(() => savedContent(page, "Idées/lancement.md"))
    .toContain("- Calendrier <!-- couleur: violet -->\n");

  await node(page, "Clients").locator(".mind-map-fold").click();
  await expect(node(page, "Plombiers")).toHaveCount(0);
  await expect(node(page, "Clients").locator(".mind-map-fold")).toHaveText("+4");
  await shot(page, "pliee");
  await node(page, "Clients").locator(".mind-map-fold").click();
  await expect(node(page, "Plombiers")).toBeVisible();

  const transform = () =>
    page.locator(".mind-map-world").evaluate((e) => (e as HTMLElement).style.transform);
  const fitted = await transform();
  await page.getByRole("button", { name: "Agrandir" }).click();
  expect(await transform()).not.toBe(fitted);
  await page.getByRole("button", { name: "Tout afficher" }).click();
  expect(await transform()).toBe(fitted);

  await node(page, "Calendrier").click();
  await page.keyboard.press("Delete");
  await expect(node(page, "Bêta")).toBeVisible();
  await expect(page.locator(".mind-map-confirm")).toContainText("2 descendants");
  await shot(page, "suppression");
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(node(page, "Calendrier")).toHaveCount(0);
});

test("le clic droit sur un dossier ou sur la racine crée une carte mentale dedans", async ({
  page,
}) => {
  await launch(page, NOTES);
  await page.locator(".folder-item", { hasText: "Idées" }).click({ button: "right" });
  await expect(page.locator(".context-menu button")).toHaveText([
    "Nouvelle note",
    "Nouvelle carte mentale",
    "Nouveau cahier de recherche",
    "Placer dans la corbeille",
  ]);
  await shot(page, "menu-dossier");
  await page.locator(".context-menu button", { hasText: "Nouvelle carte mentale" }).click();
  const ask = page.getByRole("dialog", { name: "Nom de la nouvelle carte mentale" });
  await ask.getByRole("textbox").fill("Dans le dossier");
  await ask.getByRole("button", { name: "Créer" }).click();
  await expect(page.locator(".mind-map")).toBeVisible();
  expect(await savedContent(page, "Idées/dans-le-dossier.md")).toBe(
    "---\ntype: carte-mentale\n---\n# Dans le dossier\n",
  );
});
