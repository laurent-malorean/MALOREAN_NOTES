// Serveurs MCP extérieurs de la colonne Claude Code (fiche 0105), à la souris : la rubrique « Serveurs MCP » de
// l'onglet « Claude » des réglages. Rust et Claude Code sont remplacés par le faux ; rien n'est connecté.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

const NOTES = { "courses.md": { content: "# Courses\n\npain", modified: 30 } };

async function launch(page: Page, extra: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
}

const settings = (page: Page) => page.getByRole("dialog", { name: "Réglages" });
const section = (page: Page) => settings(page).locator(".mcp-servers-group");
const allowed = (page: Page) => page.evaluate(() => [...window.backend.mcpServers.allowed]);

async function openClaudeTab(page: Page) {
  await page.getByRole("button", { name: "Réglages" }).click();
  await settings(page).getByRole("tab", { name: "Claude" }).click();
}

test("la rubrique est sous le réglage des modifications après une lecture du web, avec la liste triée et les états", async ({
  page,
}) => {
  await launch(page);
  await openClaudeTab(page);
  const groups = settings(page).locator("[role=tabpanel]:not([hidden]) fieldset legend");
  await expect(groups).toHaveText(["Claude", "Serveurs MCP"]);
  await expect(section(page)).toContainText(
    "Les services que Claude peut utiliser dans la colonne Claude Code, en plus des outils de l'application. Seuls les serveurs cochés lui sont ouverts.",
  );
  await expect(section(page).getByRole("button", { name: "Actualiser" })).toBeEnabled();
  const rows = section(page).locator("li");
  await expect(rows.locator("label")).toHaveText([
    "Atlassian",
    "Figma",
    "mon-serveur",
    "Noota",
    "Notion",
    "serveur-en-panne",
    "Slack",
  ]);
  await expect(rows.locator(".mcp-server-state")).toHaveText([
    "Connecté",
    "À connecter",
    "À connecter",
    "Connecté",
    "Connecté",
    "En échec",
    "Connecté",
  ]);
  for (const box of await section(page).getByRole("checkbox").all())
    await expect(box).not.toBeChecked();
});

test("dit quoi faire sous un serveur « À connecter », différemment pour un connecteur et pour le Terminal", async ({
  page,
}) => {
  await launch(page);
  await openClaudeTab(page);
  const hints = section(page).locator(".mcp-server-hint");
  await expect(hints).toHaveText([
    "Connectez-le dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ».",
    "Connectez-le dans le Terminal : tapez claude, puis /mcp, puis cliquez sur « Actualiser ».",
  ]);
  await expect(section(page).getByRole("checkbox", { name: "Figma" })).toHaveAccessibleDescription(
    /À connecter.*Connectez-le dans les réglages des connecteurs/,
  );
});

test("cocher et décocher un serveur est gardé par le moteur, sans relire la liste", async ({
  page,
}) => {
  await launch(page);
  await openClaudeTab(page);
  await section(page).getByRole("checkbox", { name: "Noota" }).check();
  await section(page).getByRole("checkbox", { name: "Slack" }).check();
  expect(await allowed(page)).toEqual(["claude.ai Noota", "claude.ai Slack"]);
  await section(page).getByRole("checkbox", { name: "Noota" }).uncheck();
  expect(await allowed(page)).toEqual(["claude.ai Slack"]);
  await expect(section(page).getByRole("checkbox", { name: "Slack" })).toBeChecked();
  expect(await page.evaluate(() => window.backend.mcpServers.reads)).toBe(1);
});

test("le choix coché se retrouve à la réouverture des réglages", async ({ page }) => {
  await launch(page);
  await openClaudeTab(page);
  await section(page).getByRole("checkbox", { name: "Noota" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(section(page).getByRole("checkbox", { name: "Noota" })).toBeChecked();
  await expect(section(page).getByRole("checkbox", { name: "Slack" })).not.toBeChecked();
});

test("un serveur coché que Claude Code ne connaît plus reste coché, « Introuvable », jusqu'à ce qu'on le décoche", async ({
  page,
}) => {
  await launch(page, { mcpAllowed: JSON.stringify(["claude.ai Disparu"]) });
  await openClaudeTab(page);
  const line = section(page).locator("li", { hasText: "Disparu" });
  await expect(line.locator(".mcp-server-state")).toHaveText("Introuvable");
  await expect(line.getByRole("checkbox")).toBeChecked();
  // La ligne disparaît au clic : `uncheck` voudrait vérifier la case d'une ligne qui n'est plus là.
  await line.getByRole("checkbox").click();
  await expect(section(page).locator("li", { hasText: "Disparu" })).toHaveCount(0);
  expect(await allowed(page)).toEqual([]);
});

test("dit « Lecture des serveurs de Claude Code… » pendant la lecture, et le reste des réglages reste utilisable", async ({
  page,
}) => {
  await launch(page, { mcpDelay: "1500" });
  await openClaudeTab(page);
  await expect(section(page).locator(".mcp-status")).toHaveText(
    "Lecture des serveurs de Claude Code…",
  );
  await expect(section(page).getByRole("button", { name: "Actualiser" })).toBeDisabled();
  await settings(page).getByRole("tab", { name: "Affichage" }).click();
  await expect(settings(page).getByRole("combobox", { name: "Police" })).toBeVisible();
  await settings(page).getByRole("tab", { name: "Claude" }).click();
  await expect(section(page).locator("li").first()).toBeVisible();
  await expect(section(page).getByRole("button", { name: "Actualiser" })).toBeEnabled();
  expect(await page.evaluate(() => window.backend.mcpServers.reads)).toBe(1);
});

test("« Actualiser » relit la liste", async ({ page }) => {
  await launch(page);
  await openClaudeTab(page);
  await expect(section(page).locator("li").first()).toBeVisible();
  await page.evaluate(() => {
    window.backend.mcpServers.known = window.backend.mcpServers.known.map((line) =>
      line.name === "claude.ai Figma" ? { ...line, state: "connected" } : line,
    );
  });
  await section(page).getByRole("button", { name: "Actualiser" }).click();
  await expect(
    section(page).locator("li").filter({ hasText: "Figma" }).locator(".mcp-server-state"),
  ).toHaveText("Connecté");
  await expect(section(page).locator(".mcp-server-hint")).toHaveCount(1);
  expect(await page.evaluate(() => window.backend.mcpServers.reads)).toBe(2);
});

test("sans Claude Code, la rubrique le dit en une phrase et ne liste rien", async ({ page }) => {
  await launch(page, { mcp: "absent" });
  await openClaudeTab(page);
  await expect(section(page).locator(".mcp-status")).toHaveText(
    "Claude Code n'est pas installé sur ce Mac : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».",
  );
  await expect(section(page).locator("li")).toHaveCount(0);
  await expect(section(page).getByRole("button", { name: "Actualiser" })).toBeEnabled();
});

test("une lecture qui échoue dit l'erreur du moteur, et « Actualiser » réessaie", async ({
  page,
}) => {
  await launch(page, { mcp: "failing" });
  await openClaudeTab(page);
  await expect(section(page).locator(".mcp-status")).toHaveText(
    "stockage indisponible : préférences",
  );
  await page.evaluate(() => {
    window.backend.mcpServers.mode = null;
  });
  await section(page).getByRole("button", { name: "Actualiser" }).click();
  await expect(section(page).locator("li")).toHaveCount(7);
});

test("aucun serveur connu : la rubrique le dit", async ({ page }) => {
  await launch(page, { mcp: "empty" });
  await openClaudeTab(page);
  await expect(section(page).locator(".mcp-status")).toHaveText(
    "Claude Code ne connaît aucun serveur MCP extérieur.",
  );
});

test("la liste n'est lue qu'à l'ouverture de l'onglet « Claude »", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "Réglages" }).click();
  await settings(page).getByRole("tab", { name: "Affichage" }).click();
  expect(await page.evaluate(() => window.backend.mcpServers.reads)).toBe(0);
  await settings(page).getByRole("tab", { name: "Claude" }).click();
  await expect(section(page).locator("li").first()).toBeVisible();
  expect(await page.evaluate(() => window.backend.mcpServers.reads)).toBe(1);
});
