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

const caret = (page: Page) =>
  page.getByRole("textbox", { name: "Texte du nœud" }).evaluate((area: HTMLTextAreaElement) => ({
    start: area.selectionStart,
    end: area.selectionEnd,
    length: area.value.length,
  }));

test("la saisie d'un nœud existant place le curseur à la fin, sans sélection, au double-clic comme à F2", async ({
  page,
}) => {
  await open(page);
  await own(page, "Japon").dblclick();
  await expect(page.getByRole("textbox", { name: "Texte du nœud" })).toBeFocused();
  expect(await caret(page)).toEqual({ start: 5, end: 5, length: 5 });
  await page.keyboard.type(" (Asie)");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("  - Japon (Asie)\n");

  await own(page, "Inde").click();
  await page.keyboard.press("F2");
  expect(await caret(page)).toEqual({ start: 4, end: 4, length: 4 });
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect.poll(() => saved(page)).toContain("  - Inde!\n");
});

test("un nœud neuf s'ouvre en saisie sur un champ vide", async ({ page }) => {
  await open(page);
  await own(page, "Chine").click();
  await page.keyboard.press("Tab");
  expect(await caret(page)).toEqual({ start: 0, end: 0, length: 0 });
  await page.keyboard.press("Escape");
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
  const path = "/Users/moi/Notes/Soft Power.png";
  await expect
    .poll(() => page.evaluate((p) => window.backend.exportedImages[p]?.length ?? 0, path))
    .toBeGreaterThan(1000);
  const signature = await page.evaluate(
    (p) => [...(window.backend.exportedImages[p] ?? []).slice(0, 8)],
    path,
  );
  expect(signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(await page.evaluate(() => window.backend.saveDialogs)).toEqual([
    { name: "Soft Power.png", folder: "/Users/moi/Notes" },
  ]);
  await expect(page.locator(".toast, .message").first()).toContainText("exportée dans");
  // L'image n'est ni vide ni blanche : elle se relit en PNG et montre autre chose que son fond.
  const drawn = await page.evaluate(async (p) => {
    const bytes = window.backend.exportedImages[p] ?? new Uint8Array();
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context?.drawImage(bitmap, 0, 0);
    const data = context?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? [];
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return { width: bitmap.width, colors: colors.size };
  }, path);
  expect(drawn.width).toBeGreaterThan(100);
  expect(drawn.colors).toBeGreaterThan(3);
});
