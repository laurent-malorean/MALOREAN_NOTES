import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

const WORKSPACE = { "a.md": { content: "# Alpha\n- pain\n- lait", modified: 20 } };

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    claudeAgents: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const map = (page: Page) => column(page).locator(".claude-agents");
const details = (page: Page) => map(page).locator(".claude-agent-details");

async function send(page: Page, message: string) {
  const input = column(page).getByRole("textbox", { name: "Message à Claude" });
  await input.fill(message);
  await input.press("Enter");
}

test("la carte des agents suit les sous-agents de Claude, l'un sous l'autre, jusqu'à leur fin", async ({
  page,
}) => {
  await launch(page, { claudeTurn: "hanging" });
  await page.keyboard.press("Meta+Control+L");
  await expect(column(page)).toBeVisible();
  await expect(map(page)).toBeHidden();
  await send(page, "Compte les articles");
  await expect(map(page).locator(".claude-agents-headline")).toHaveText(
    "2 sous-agents · 2 en cours",
  );
  await expect(map(page).locator(".claude-agent-tree").first()).toBeHidden();
  await map(page).getByText("Carte des agents").click();
  const parent = map(page).locator(".claude-agent").filter({ hasText: "Compter les articles" });
  await expect(parent.locator(".claude-agent .claude-agent-description")).toHaveText("Lire a.md");
  await expect(details(page)).toHaveText(["en cours · 2 actions", "en cours · 1 action"]);
  await column(page).getByRole("button", { name: "Arrêter" }).click();
  await expect(details(page)).toHaveText(["interrompu · 2 actions", "interrompu · 1 action"]);
  await expect(map(page).locator(".claude-agents-headline")).toHaveText("2 sous-agents");
});

test("à leur fin, chaque sous-agent donne sa durée, ses jetons et ses actions", async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press("Meta+Control+L");
  await send(page, "Compte les articles");
  await map(page).getByText("Carte des agents").click();
  await expect(details(page)).toHaveText([
    "terminé · 3,3 s · 8 523 jetons · 2 actions",
    "terminé · 1,2 s · 3 000 jetons · 1 action",
  ]);
  await expect(column(page).locator(".claude-summary")).toBeVisible();
  await column(page).getByRole("button", { name: "Nouvelle conversation" }).click();
  await expect(map(page)).toBeHidden();
});
