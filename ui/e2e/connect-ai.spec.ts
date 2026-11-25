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
  await expect(page.locator(".status")).toContainText("Clé de branchement copiée");
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
