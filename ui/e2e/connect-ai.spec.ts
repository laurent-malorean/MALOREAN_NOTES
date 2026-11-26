// Parcours « Brancher une IA » : l'onglet des réglages crée la clé de branchement, la montre avec
// ses deux blocs à copier, la copie, puis la révoque après confirmation. Rust est remplacé par le faux.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

const NOTES = { "courses.md": { content: "# Courses\n\npain", modified: 30 } };

async function launch(page: Page, connection = "none", theme?: string) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1", connection });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
  if (theme) await page.evaluate((t) => (document.documentElement.dataset.appearance = t), theme);
  await page.getByRole("button", { name: "Réglages" }).click();
  const settings = page.getByRole("dialog", { name: "Réglages" });
  await settings.getByRole("tab", { name: "Brancher une IA" }).click();
  return settings;
}

test("sans clé : une phrase et un seul bouton, qui crée la clé et montre les blocs à copier", async ({
  page,
}) => {
  const settings = await launch(page);
  const panel = settings.locator(".connection-settings");
  await expect(panel).toContainText("Donne les outils de MALOREAN Notes à une IA extérieure");
  await expect(panel.getByRole("button")).toHaveText(["Créer une clé de branchement"]);

  await panel.getByRole("button", { name: "Créer une clé de branchement" }).click();

  await expect(panel).toContainText("Clé de branchement créée le 25 novembre 2026.");
  await expect(panel.locator(".connection-text").first()).toHaveText("cle-de-branchement-1");
  await expect(panel.getByRole("button", { name: "Créer une clé de branchement" })).toBeHidden();
  const blocks = panel.locator("pre.connection-text");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toContainText('"mcpServers"');
  await expect(blocks.nth(0)).toContainText('"--brancher", "cle-de-branchement-1"');
  await expect(blocks.nth(1)).toContainText("[mcp_servers.malorean_notes]");
  await expect(blocks.nth(1)).toContainText('args = ["--brancher", "cle-de-branchement-1"]');
});

for (const theme of ["light", "dark"]) {
  test(`pour chaque bloc, une phrase dit dans quel fichier le coller, sans déborder (thème ${theme})`, async ({
    page,
  }) => {
    const settings = await launch(page, "key", theme);
    const panel = settings.locator(".connection-settings");
    const where = panel.locator(".connection-where");
    await expect(where).toHaveCount(2);

    // Claude : `.mcp.json`, à la racine du dossier ouvert dans l'éditeur ; le fichier existant reçoit l'entrée.
    await expect(where.nth(0)).toHaveText(
      "Collez ce bloc tel quel dans le fichier .mcp.json, à la racine du dossier ouvert dans l'éditeur. Si le fichier existe déjà, ajoutez l'entrée du bloc dans « mcpServers ».",
    );
    await expect(where.nth(0).locator("code")).toHaveText([".mcp.json"]);
    // Codex : `~/.codex/config.toml`.
    await expect(where.nth(1)).toHaveText(
      "Collez ce bloc tel quel à la fin du fichier ~/.codex/config.toml.",
    );
    await expect(where.nth(1).locator("code")).toHaveText(["~/.codex/config.toml"]);

    // Chaque phrase se trouve sous le titre de son bloc, au-dessus du bloc lui-même.
    const claude = panel.locator(".connection-copyable").nth(1);
    await expect(claude.locator("p").first()).toContainText("Configuration pour Claude");
    await expect(claude.locator("p").nth(1)).toContainText(".mcp.json");
    await expect(claude.locator("p").nth(1).locator("xpath=following-sibling::*[1]")).toHaveClass(
      /connection-text/,
    );

    // Lisible dans les deux thèmes : le texte de la phrase n'a pas la couleur du fond.
    const colors = await where.nth(0).evaluate((line) => ({
      text: getComputedStyle(line).color,
      background: getComputedStyle(line.closest(".settings") ?? document.body).backgroundColor,
      file: getComputedStyle(line.querySelector("code") as Element).color,
    }));
    expect(colors.text).not.toBe(colors.background);
    expect(colors.file).not.toBe(colors.background);

    // Rien ne déborde de la fenêtre des Réglages : ni la zone de contenu, ni les phrases, ni les blocs.
    const window = await settings.boundingBox();
    if (!window) throw new Error("fenêtre des Réglages absente");
    const items = panel.locator(".connection-where, .connection-text");
    const count = await items.count();
    for (let i = 0; i < count; i += 1) {
      const box = await items.nth(i).boundingBox();
      if (!box) throw new Error("élément absent de l'écran");
      expect(box.x).toBeGreaterThanOrEqual(window.x);
      expect(box.x + box.width).toBeLessThanOrEqual(window.x + window.width);
    }
    const overflow = await panel.evaluate((frame) => {
      const scroller = frame.closest(".settings-panels") ?? frame.parentElement;
      return (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0);
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("copie la clé et chaque bloc dans le presse-papiers", async ({ page }) => {
  const settings = await launch(page, "key");
  const panel = settings.locator(".connection-settings");
  const copied = () => page.evaluate(() => window.backend.copiedMarkdown);

  await panel.getByRole("button", { name: /^Copier : Clé de branchement$/ }).click();
  // Le bouton lui-même confirme (pas de message passager), puis redevient « Copier ».
  const keyButton = panel.getByRole("button", { name: /^Copié : Clé de branchement$/ });
  await expect(keyButton).toHaveText("✓ Copié");
  await expect(page.locator(".status")).not.toContainText("copié");
  await expect(panel.getByRole("button", { name: /^Copier : Clé de branchement$/ })).toHaveText(
    "Copier",
    { timeout: 5000 },
  );
  await panel.getByRole("button", { name: /^Copier : Configuration pour Claude/ }).click();
  await panel.getByRole("button", { name: "Copier : Configuration pour Codex" }).click();

  await expect.poll(copied).toHaveLength(3);
  const [key, claude, codex] = await copied();
  expect(key).toBe("cle-de-branchement-1");
  expect(claude).toContain('"args": ["--brancher", "cle-de-branchement-1"]');
  expect(codex).toContain("[mcp_servers.malorean_notes]");
});

test("la révocation demande confirmation, puis redonne le bouton de création d'une clé autre", async ({
  page,
}) => {
  const settings = await launch(page, "key");
  const panel = settings.locator(".connection-settings");

  // Annuler ne révoque rien.
  await panel.getByRole("button", { name: "Révoquer la clé" }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmation" });
  await expect(confirmation).toContainText("Les IA branchées sont coupées tout de suite");
  await confirmation.getByRole("button", { name: "Annuler" }).click();
  await expect(panel.locator(".connection-text").first()).toHaveText("cle-de-branchement-1");
  expect(await page.evaluate(() => window.backend.connection.revoked)).toBe(0);

  // Confirmer efface la clé.
  await panel.getByRole("button", { name: "Révoquer la clé" }).click();
  await confirmation.getByRole("button", { name: "Révoquer la clé" }).click();
  await expect(panel.getByRole("button")).toHaveText(["Créer une clé de branchement"]);
  expect(await page.evaluate(() => window.backend.connection.revoked)).toBe(1);

  // Une nouvelle clé n'a rien à voir avec l'ancienne.
  await panel.getByRole("button", { name: "Créer une clé de branchement" }).click();
  await expect(panel.locator(".connection-text").first()).toHaveText("cle-de-branchement-2");
});

test("les espaces de travail : une case chacun, décochée au départ, avec ou sans clé, qui se garde", async ({
  page,
}) => {
  const settings = await launch(page);
  const panel = settings.locator(".connection-settings");
  const boxes = panel.locator(".allowed-workspace input");

  await expect(panel).toContainText("Espaces de travail ouverts aux IA");
  await expect(panel.locator(".allowed-workspace")).toHaveText(["Notes"]);
  await expect(boxes.first()).not.toBeChecked();

  await boxes.first().check();
  await expect(boxes.first()).toBeChecked();
  // La clé créée ensuite ne change pas la case.
  await panel.getByRole("button", { name: "Créer une clé de branchement" }).click();
  await expect(panel.locator(".connection-text").first()).toHaveText("cle-de-branchement-1");
  await expect(boxes.first()).toBeChecked();

  // La case est gardée d'un lancement à l'autre.
  await page.reload();
  await page.getByRole("button", { name: "Réglages" }).click();
  await page
    .getByRole("dialog", { name: "Réglages" })
    .getByRole("tab", { name: "Brancher une IA" })
    .click();
  await expect(panel.locator(".allowed-workspace input").first()).toBeChecked();
  await panel.locator(".allowed-workspace input").first().uncheck();
  await expect(panel.locator(".allowed-workspace input").first()).not.toBeChecked();
});
