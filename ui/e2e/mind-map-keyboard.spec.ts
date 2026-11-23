import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Carte mentale existante de plusieurs niveaux, avec détails : le clic, le double-clic sur un nœud
// existant, les touches (Entrée, Tab, Suppr, flèches, Échap) comme dans la carte de référence.

const COUNTRIES = ["France", "Chine", "Japon", "Inde", "Brésil"];
const MAP = [
  "---",
  "type: carte-mentale",
  "racines: [{x: 0, y: 0}]",
  "---",
  "# Soft Power",
  "",
  "- Soft Power",
  ...COUNTRIES.flatMap((country) => [
    `  - ${country}`,
    "    - Pays hôte",
    "      > - **Atout** : la culture",
    "      > - **Limite** : la langue",
    "    - Levier",
    "      > - **Moyen** : le cinéma",
  ]),
  "",
].join("\n");

async function open(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify({
      "courses.md": { content: "# Courses\n- lait", modified: 20 },
      "soft-power.md": { content: MAP, modified: 10 },
    }),
    remembered: "1",
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
  await page.locator(".note-item", { hasText: "Soft Power" }).click();
  await expect(node(page, "Japon")).toBeVisible();
}

const node = (page: Page, title: string) =>
  page.locator(".mind-map-node:not(.mind-map-probe)", { hasText: title }).first();
const own = (page: Page, title: string) =>
  page
    .locator(".mind-map-node:not(.mind-map-probe)")
    .filter({ hasText: new RegExp(`^${title}`) })
    .first();
const saved = (page: Page) =>
  page.evaluate(() => window.backend.notes["soft-power.md"]?.content ?? "");

test("le double-clic sur un nœud existant le met en saisie, sans créer de nœud", async ({
  page,
}) => {
  await open(page);
  const before = await page.locator(".mind-map-node:not(.mind-map-probe)").count();
  await own(page, "Japon").click();
  await own(page, "Japon").dblclick();
  const input = page.getByRole("textbox", { name: "Texte du nœud" });
  await expect(input).toHaveValue("Japon");
  await input.fill("Japon (Asie)");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("  - Japon (Asie)\n");
  expect(await page.locator(".mind-map-node:not(.mind-map-probe)").count()).toBe(before);
});

test("le double-clic sur un nœud sans clic préalable le modifie aussi", async ({ page }) => {
  await open(page);
  await own(page, "Inde").dblclick();
  await expect(page.getByRole("textbox", { name: "Texte du nœud" })).toHaveValue("Inde");
});

test("Entrée ajoute un frère, Tab un enfant, flèches, Échap et Suppr", async ({ page }) => {
  await open(page);
  await own(page, "Chine").click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Corée");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toMatch(/- Chine\n(?:.*\n)*? {2}- Corée\n {2}- Japon\n/);

  await own(page, "Inde").click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Bollywood");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("  - Inde\n    - Pays hôte");
  await expect.poll(() => saved(page)).toContain("    - Bollywood\n");

  // flèches : du pays vers son premier enfant, puis le frère du dessous, puis le parent
  await own(page, "Japon").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".mind-map-node.selected")).toContainText("Pays hôte");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".mind-map-node.selected")).toContainText("Levier");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".mind-map-node.selected")).toHaveText(/^Japon/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mind-map-node.selected")).toHaveCount(0);

  await own(page, "Brésil").click();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect.poll(() => saved(page)).not.toContain("Brésil");
});

test("Entrée sur un nœud profond (Levier) ajoute un frère juste en dessous", async ({ page }) => {
  await open(page);
  await own(page, "Levier").click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Autre");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => saved(page))
    .toContain("    - Levier\n      > - **Moyen** : le cinéma\n    - Autre\n");
});

test("l'image de toute la carte s'enregistre par la fenêtre d'enregistrement", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Agrandir" }).click();
  await page.getByRole("button", { name: "Exporter en image" }).click();
  const path = "/Users/moi/Documents/Soft Power.png";
  await expect
    .poll(() => page.evaluate((p) => window.backend.exportedImages[p]?.length ?? 0, path))
    .toBeGreaterThan(1000);
  const signature = await page.evaluate(
    (p) => [...(window.backend.exportedImages[p] ?? []).slice(0, 8)],
    path,
  );
  expect(signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(await page.evaluate(() => window.backend.saveDialogs)).toEqual([
    { name: "Soft Power.png", folder: null },
  ]);
  await expect(page.locator(".toast, .message").first()).toContainText("exportée dans");
});
