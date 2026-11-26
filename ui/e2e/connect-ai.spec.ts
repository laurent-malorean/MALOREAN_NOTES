// Parcours « Brancher une IA » : l'onglet des réglages crée la clé de branchement, la montre avec
// ses deux blocs à copier, la copie, puis la révoque après confirmation. Rust est remplacé par le faux.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

const NOTES = { "courses.md": { content: "# Courses\n\npain", modified: 30 } };

async function launch(page: Page, connection = "none") {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1", connection });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
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
  await expect(blocks.nth(1)).toContainText("[mcp_servers.malorean]");
  await expect(blocks.nth(1)).toContainText('args = ["--brancher", "cle-de-branchement-1"]');
});

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
  expect(codex).toContain("[mcp_servers.malorean]");
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
