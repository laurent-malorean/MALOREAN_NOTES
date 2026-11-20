import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

const WORKSPACE = {
  "a.md": { content: "# Alpha\nPremière note.", modified: 20 },
  "Projets/plan.md": { content: "# Plan\nLe plan.", modified: 10 },
};

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(["Projets"]),
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const input = (page: Page) => column(page).getByRole("textbox", { name: "Message à Claude" });
const settings = (page: Page) => column(page).locator(".claude-settings-chip");
const attached = (page: Page) => column(page).locator(".claude-attached-title");
const sent = (page: Page) => page.evaluate(() => window.backend.claudeMessages);

/** Ouvre la colonne à la souris, par le bouton Claude des outils de l'éditeur. */
async function openColumn(page: Page) {
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await expect(column(page)).toBeVisible();
}

test("à la souris : choisir le modèle et l'effort, joindre la note ouverte, envoyer ; le choix reste au lancement suivant", async ({
  page,
}) => {
  await launch(page);
  await openColumn(page);
  await expect(settings(page)).toHaveText("Modèle par défaut");
  await expect(attached(page)).toHaveText(["Alpha"]);
  await settings(page).click();
  const menu = column(page).getByRole("menu");
  await menu
    .getByRole("group", { name: "Modèle" })
    .getByRole("menuitemradio", { name: "Sonnet" })
    .click();
  await menu
    .getByRole("group", { name: "Effort" })
    .getByRole("menuitemradio", { name: "High", exact: true })
    .click();
  await expect(settings(page)).toHaveText("Sonnet · High");
  await input(page).click();
  await expect(menu).toBeHidden();
  await input(page).fill("Résume");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(column(page).locator(".claude-summary")).toHaveText("4,2 s · 1 234 jetons");
  expect(await sent(page)).toEqual([
    "Résume\n\nNotes jointes (chemins depuis l'espace de travail) :\n- a.md",
  ]);
  expect(await page.evaluate(() => window.backend.claudeSettings)).toEqual([
    { model: "sonnet", effort: "high" },
  ]);
  await expect(column(page).locator(".claude-user-notes")).toHaveText("Notes jointes : Alpha");
  await page.reload();
  await waitForNote(page, "Alpha");
  await openColumn(page);
  await expect(settings(page)).toHaveText("Sonnet · High");
});

test("« + » joint une autre note, la croix retire la note ouverte", async ({ page }) => {
  await launch(page);
  await openColumn(page);
  await column(page).getByRole("button", { name: "Joindre une note" }).click();
  const picker = page.getByRole("dialog", { name: "Joindre une note" });
  await picker.getByRole("option", { name: /Plan/ }).click();
  await expect(attached(page)).toHaveText(["Alpha", "Plan"]);
  await column(page).getByRole("button", { name: "Retirer « Alpha » du message" }).click();
  await expect(attached(page)).toHaveText(["Plan"]);
  await input(page).fill("Lis");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(column(page).locator(".claude-summary")).toBeVisible();
  expect(await sent(page)).toEqual([
    "Lis\n\nNotes jointes (chemins depuis l'espace de travail) :\n- Projets/plan.md",
  ]);
  await expect(attached(page)).toHaveCount(0);
});

test("pendant la réponse : la durée avance et Envoyer devient un carré d'arrêt", async ({
  page,
}) => {
  await launch(page, { claudeTurn: "hanging" });
  await openColumn(page);
  await input(page).fill("Écris un plan");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  const elapsed = column(page).locator(".claude-elapsed");
  await expect(elapsed).toHaveText(/^\d+ s$/);
  await expect(elapsed).not.toHaveText("0 s");
  const stop = column(page).getByRole("button", { name: "Arrêter" });
  await expect(stop.locator(".claude-stop-square")).toBeVisible();
  await stop.click();
  await expect(column(page).locator(".claude-summary")).toHaveText("Réponse arrêtée");
  await expect(elapsed).toBeHidden();
});

test("la pastille des sous-agents en cours déplie la carte des agents", async ({ page }) => {
  await launch(page, { claudeTurn: "hanging", claudeAgents: "1" });
  await openColumn(page);
  await input(page).fill("Compte les articles");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  const agents = column(page).locator(".claude-agents-chip");
  await expect(agents).toHaveText("● 2 agents");
  await expect(column(page).locator(".claude-agent-tree").first()).toBeHidden();
  await agents.click();
  await expect(column(page).locator(".claude-agent-tree").first()).toBeVisible();
  await column(page).getByRole("button", { name: "Arrêter" }).click();
  await expect(agents).toHaveText("● 0 agent");
});

test("sans sous-agent, la pastille « ● 0 agent » reste et déplie une carte qui le dit", async ({
  page,
}) => {
  await launch(page);
  await openColumn(page);
  const agents = column(page).locator(".claude-agents-chip");
  await expect(agents).toHaveText("● 0 agent");
  await agents.click();
  await expect(column(page).locator(".claude-agents-empty")).toHaveText(
    "Aucun sous-agent lancé dans cette conversation.",
  );
  await column(page).locator(".claude-agents-summary").click();
  await expect(column(page).locator(".claude-agents")).toBeHidden();
});

test("après une réponse : version du modèle, limite d'utilisation et contexte, détaillés au survol", async ({
  page,
}) => {
  await launch(page);
  await openColumn(page);
  const limit = column(page).locator(".claude-limit");
  const context = column(page).locator(".claude-context");
  await expect(limit).toBeHidden();
  await expect(context).toBeHidden();
  await input(page).fill("Écris un plan");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(column(page).locator(".claude-summary")).toBeVisible();
  await expect(settings(page)).toHaveText("Opus 5.5");
  await expect(limit).toHaveText("Session 16 % · 59 min");
  await expect(limit).toHaveAttribute("data-level", "normal");
  await expect(limit).toHaveAttribute("title", /Semaine \(7 jours\) : 12 % utilisés/);
  await expect(context).toHaveText("Contexte 42 %");
  await column(page).getByRole("button", { name: "Nouvelle conversation" }).click();
  await expect(context).toBeHidden();
  await expect(settings(page)).toHaveText("Modèle par défaut");
  await expect(limit).toHaveText("Session 16 % · 59 min");
});

test("près de la limite d'utilisation, sa pastille prend la couleur d'alerte ; atteinte, elle le dit", async ({
  page,
}) => {
  await launch(page, { claudeLimit: "85" });
  await openColumn(page);
  await input(page).fill("Écris un plan");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  const limit = column(page).locator(".claude-limit");
  await expect(limit).toHaveText("Session 85 % · 59 min");
  await expect(limit).toHaveAttribute("data-level", "close");
  await launch(page, { claudeLimit: "100" });
  await openColumn(page);
  await input(page).fill("Écris un plan");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(limit).toHaveText("Limite atteinte · 59 min");
  await expect(limit).toHaveAttribute("data-level", "reached");
});
