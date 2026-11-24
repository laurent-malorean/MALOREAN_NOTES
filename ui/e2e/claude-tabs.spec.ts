import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

const WORKSPACE = { "a.md": { content: "# Alpha\nPremière note.", modified: 20 } };
const TRAVAIL_FOLDER = "/Users/moi/Travail";
const TRAVAIL = { "b.md": { content: "# Budget\nchiffres", modified: 40 } };
const OTHER_TAB_RUNNING =
  "Claude répond dans un autre onglet de conversation : attendez la fin de sa réponse, ou arrêtez-la depuis cet onglet, pour envoyer un message ici.";

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    spaces: JSON.stringify({ [TRAVAIL_FOLDER]: TRAVAIL }),
    folders: "[]",
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
  await page.getByRole("button", { name: "Claude", exact: true }).click();
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const input = (page: Page) => column(page).getByRole("textbox", { name: "Message à Claude" });
const conversation = (page: Page) => column(page).getByRole("log");
const tabs = (page: Page) => column(page).getByRole("tab");
const tab = (page: Page, title: string) => tabs(page).filter({ hasText: title });
const sendButton = (page: Page) => column(page).getByRole("button", { name: "Envoyer" });
const newConversation = (page: Page) =>
  column(page).getByRole("button", { name: "Nouvelle conversation" }).click();

/** Écrit et envoie un message à la souris. */
async function send(page: Page, message: string) {
  await input(page).fill(message);
  await sendButton(page).click();
}

test("plusieurs conversations à la fois, chacune dans son onglet, à la souris", async ({
  page,
}) => {
  await launch(page);
  await expect(tabs(page)).toHaveText(["Nouvelle conversation×"]);
  await send(page, "Écris un plan pour la semaine prochaine");
  await expect(conversation(page).locator(".claude-summary")).toBeVisible();
  await expect(tabs(page)).toHaveText(["Écris un plan pour la semaine…×"]);
  await newConversation(page);
  await send(page, "Résume Alpha");
  await expect(conversation(page).locator(".claude-summary")).toBeVisible();
  await expect(conversation(page).locator(".claude-user")).toHaveText([/^Résume Alpha/]);
  await tab(page, "Écris un plan").click();
  await expect(tab(page, "Écris un plan")).toHaveAttribute("aria-selected", "true");
  await expect(conversation(page).locator(".claude-user")).toHaveText([/^Écris un plan/]);
  await send(page, "Ajoute un jour");
  await expect(conversation(page).locator(".claude-summary")).toHaveCount(2);
  expect(await page.evaluate(() => window.backend.claudeConversations)).toEqual([
    null,
    null,
    "conversation-1",
  ]);
});

test("un seul tour à la fois : l'onglet qui répond porte un témoin, les autres refusent d'envoyer", async ({
  page,
}) => {
  await launch(page, { claudeTurn: "hanging" });
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-reply")).toHaveText("Je regarde vos notes.");
  await newConversation(page);
  await expect(tab(page, "Écris un plan").locator(".claude-tab-running")).toBeVisible();
  await expect(conversation(page).locator(".claude-other-tab")).toHaveText(OTHER_TAB_RUNNING);
  await expect(sendButton(page)).toBeDisabled();
  await expect(column(page).getByRole("button", { name: "Arrêter" })).toBeHidden();
  await tab(page, "Écris un plan").click();
  await column(page).getByRole("button", { name: "Arrêter" }).click();
  await expect(conversation(page).locator(".claude-summary")).toHaveText("Réponse arrêtée");
  await expect(tab(page, "Écris un plan").locator(".claude-tab-running")).toHaveCount(0);
  await tab(page, "Nouvelle conversation").click();
  await expect(sendButton(page)).toBeEnabled();
  expect(await page.evaluate(() => window.backend.claudeMessages)).toHaveLength(1);
});

test("fermer l'onglet qui répond arrête sa réponse ; fermer le dernier laisse un onglet vide", async ({
  page,
}) => {
  await launch(page, { claudeTurn: "hanging" });
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-reply")).toHaveText("Je regarde vos notes.");
  await tab(page, "Écris un plan")
    .getByRole("button", { name: "Fermer l'onglet de conversation « Écris un plan »" })
    .click();
  await expect(tabs(page)).toHaveText(["Nouvelle conversation×"]);
  await expect(conversation(page).locator(".claude-empty")).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();
  expect(await page.evaluate(() => window.backend.calls)).toContain("stop_claude");
});

test("chaque espace de travail a ses onglets de conversation", async ({ page }) => {
  await launch(page);
  await send(page, "Écris un plan");
  await expect(conversation(page).locator(".claude-summary")).toBeVisible();
  await page.evaluate((folder) => (window.backend.nextFolder = folder), TRAVAIL_FOLDER);
  await page.locator(".workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Ajouter un espace de travail…" }).click();
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.locator(".workspace-switcher")).toHaveText("Travail");
  await expect(tabs(page)).toHaveText(["Nouvelle conversation×"]);
  await page.locator(".workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Notes", exact: true }).click();
  await expect(tabs(page)).toHaveText(["Écris un plan×"]);
  await expect(conversation(page).locator(".claude-user")).toContainText("Écris un plan");
});

for (const appearance of ["light", "dark"]) {
  test(`beaucoup d'onglets : largeur fixe, flèches, défilement (thème ${appearance})`, async ({
    page,
  }) => {
    await launch(page);
    await page.evaluate(
      (value) => (document.documentElement.dataset.appearance = value),
      appearance,
    );
    const arrows = column(page).locator("[data-tabs-scroll]:not([hidden])");
    await expect(arrows).toHaveCount(0);
    const alone = (await tabs(page).first().boundingBox())?.width;
    for (let count = 0; count < 12; count++) await newConversation(page);
    await expect(tabs(page)).toHaveCount(13);
    expect((await tabs(page).first().boundingBox())?.width).toBe(alone);
    await expect(arrows).toHaveCount(2);
    await expect(tabs(page).last()).toBeInViewport();
    const left = column(page).getByRole("button", {
      name: "Faire défiler les onglets vers la gauche",
    });
    const right = column(page).getByRole("button", {
      name: "Faire défiler les onglets vers la droite",
    });
    await expect(right).toBeDisabled();
    await left.click();
    await expect(right).toBeEnabled();
  });
}
