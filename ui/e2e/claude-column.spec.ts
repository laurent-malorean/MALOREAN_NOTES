import { expect, type Page, test } from "@playwright/test";
import { CLAUDE_BUSY, CLAUDE_UNAVAILABLE } from "./fake-claude";
import { waitForNote } from "./journey";

const WORKSPACE = { "a.md": { content: "# Alpha\nPremière note.", modified: 20 } };

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const input = (page: Page) => column(page).getByRole("textbox", { name: "Message à Claude" });
const conversation = (page: Page) => column(page).getByRole("log");

async function send(page: Page, message: string) {
  await input(page).fill(message);
  await input(page).press("Enter");
}

test("Ctrl+Cmd+L ouvre la colonne : Claude répond au fil de l'eau, la note qu'il a écrite s'ouvre d'un clic", async ({
  page,
}) => {
  await launch(page);
  await expect(column(page)).toBeHidden();
  await page.keyboard.press("Meta+Control+L");
  await expect(column(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect(column(page).locator(".claude-permissions")).toHaveCount(0);
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-user")).toContainText("Écris un plan");
  await expect(conversation(page).locator(".claude-reply").first()).toHaveText(
    "Je regarde vos notes.",
  );
  await expect(conversation(page).locator(".claude-summary")).toHaveText("4,2 s · 1 234 jetons");
  await expect(conversation(page).locator(".claude-reply strong")).toHaveText("le plan");
  await expect(conversation(page).locator(".claude-action")).toHaveText([
    "Lecturea.md",
    "Lecture/etc/hostsrefusée",
    "Écritureplan.md",
  ]);
  await expect(column(page).getByRole("button", { name: "Envoyer" })).toBeVisible();
  expect(await page.evaluate(() => window.backend.claudeMessages)).toEqual([
    "Écris un plan\n\nNotes jointes (chemins depuis l'espace de travail) :\n- a.md",
  ]);
  await conversation(page).getByRole("button", { name: "plan.md" }).click();
  await waitForNote(page, "Plan");
  await expect(page.locator(".note-title", { hasText: "Plan" })).toBeVisible();
});

test("le bouton Claude et la barre des menus affichent et masquent la colonne ; Maj+Entrée va à la ligne", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await expect(column(page)).toBeVisible();
  await input(page).fill("Une ligne");
  await input(page).press("Shift+Enter");
  await input(page).pressSequentially("Deux");
  await expect(input(page)).toHaveValue("Une ligne\nDeux");
  expect(await page.evaluate(() => window.backend.claudeMessages)).toEqual([]);
  await page.evaluate(() => window.backend.chooseMenu("toggle-claude-column"));
  await expect(column(page)).toBeHidden();
  await page.evaluate(() => window.backend.chooseMenu("toggle-claude-column"));
  await expect(column(page)).toBeVisible();
  await column(page).getByRole("button", { name: "Masquer la colonne Claude Code" }).click();
  await expect(column(page)).toBeHidden();
});

test("Arrêter interrompt la réponse de Claude ; la conversation peut continuer", async ({
  page,
}) => {
  await launch(page, { claudeTurn: "hanging" });
  await page.keyboard.press("Meta+Control+L");
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-reply")).toHaveText("Je regarde vos notes.");
  await expect(column(page).getByRole("button", { name: "Envoyer" })).toBeHidden();
  await column(page).getByRole("button", { name: "Arrêter" }).click();
  await expect(conversation(page).locator(".claude-summary")).toHaveText("Réponse arrêtée");
  await expect(column(page).getByRole("button", { name: "Envoyer" })).toBeVisible();
  await expect(input(page)).toBeEnabled();
});

test("Nouvelle conversation ouvre un onglet vide ; la conversation d'avant reste dans le sien", async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press("Meta+Control+L");
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-summary")).toBeVisible();
  await column(page).getByRole("button", { name: "Nouvelle conversation" }).click();
  await expect(conversation(page).locator(".claude-empty")).toBeVisible();
  await expect(conversation(page).locator(".claude-user")).toHaveCount(0);
  await expect(column(page).getByRole("tab")).toHaveText([
    "Écris un plan×",
    "Nouvelle conversation×",
  ]);
  await send(page, "Autre chose");
  await expect(conversation(page).locator(".claude-summary")).toBeVisible();
  expect(await page.evaluate(() => window.backend.claudeConversations)).toEqual([null, null]);
});

test("Claude qui répond déjà : l'erreur est dite en clair", async ({ page }) => {
  await launch(page, { claudeTurn: "busy" });
  await page.keyboard.press("Meta+Control+L");
  await send(page, "Bonjour");
  await expect(conversation(page).locator(".claude-error")).toHaveText(CLAUDE_BUSY);
});

for (const [state, reason] of Object.entries(CLAUDE_UNAVAILABLE)) {
  test(`Claude Code indisponible (${state}) : la colonne dit quoi faire et n'envoie rien`, async ({
    page,
  }) => {
    await launch(page, { claude: state });
    await page.keyboard.press("Meta+Control+L");
    await expect(column(page).getByRole("alert")).toHaveText(reason);
    await expect(input(page)).toBeDisabled();
    await expect(column(page).getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });
}
