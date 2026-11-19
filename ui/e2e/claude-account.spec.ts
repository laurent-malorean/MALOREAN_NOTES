import { expect, type Page, test } from "@playwright/test";
import { CLAUDE_LOGIN_FAILED, CLAUDE_SIGN_IN_ADDRESS, CLAUDE_UNAVAILABLE } from "./fake-claude";
import { waitForNote } from "./journey";

const WORKSPACE = { "a.md": { content: "# Alpha\nPremière note.", modified: 20 } };

/** Lance l'application et ouvre la colonne Claude Code à la souris. */
async function open(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
  await page.getByRole("button", { name: "Claude", exact: true }).click();
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const account = (page: Page) => column(page).locator(".claude-account");
const headline = (page: Page) => account(page).locator(".claude-account-summary");
const progress = (page: Page) => account(page).getByRole("status");
const input = (page: Page) => column(page).getByRole("textbox", { name: "Message à Claude" });
const calls = (page: Page) => page.evaluate(() => window.backend.claudeAccountCalls);

test("le compte Claude se voit en haut de la colonne ; changer de compte se fait à la souris", async ({
  page,
}) => {
  await open(page);
  await expect(headline(page)).toHaveText("Compte Claude · moi@example.com · Moi");
  await headline(page).click();
  await expect(account(page)).toContainText("aussi pour Claude Code dans le Terminal et VS Code");
  await account(page).getByRole("button", { name: "Changer de compte" }).click();
  await expect(headline(page)).toHaveText("Compte Claude · autre@example.com · Autre");
  await expect(progress(page)).toHaveText(
    "Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code.",
  );
  expect(await calls(page)).toEqual(["logout", "login"]);
  await expect(input(page)).toBeEnabled();
});

test("se déconnecter puis se connecter : la colonne dit où en est la connexion", async ({
  page,
}) => {
  await open(page, { claudeLogin: "hanging" });
  await headline(page).click();
  await account(page).getByRole("button", { name: "Se déconnecter" }).click();
  await expect(headline(page)).toHaveText("Compte Claude · non connecté");
  await expect(column(page).getByRole("alert")).toHaveText(CLAUDE_UNAVAILABLE.loggedOut ?? "");
  await account(page).getByRole("button", { name: "Se connecter" }).click();
  await expect(progress(page)).toHaveText(
    "Connexion : terminez-la dans le navigateur qui vient de s'ouvrir…",
  );
  await expect(account(page).locator(".claude-account-link")).toHaveText(CLAUDE_SIGN_IN_ADDRESS);
  await expect(input(page)).toBeDisabled();
  await account(page).getByRole("button", { name: "Copier le lien" }).click();
  await expect
    .poll(() => page.evaluate(() => window.backend.copiedMarkdown))
    .toEqual([CLAUDE_SIGN_IN_ADDRESS]);
  await account(page).getByRole("button", { name: "Annuler la connexion" }).click();
  await expect(progress(page)).toHaveText("Connexion annulée.");
  await expect(headline(page)).toHaveText("Compte Claude · non connecté");
});

test("une connexion qui n'aboutit pas dit quoi faire", async ({ page }) => {
  await open(page, { claude: "loggedOut", claudeLogin: "failed" });
  await headline(page).click();
  await account(page).getByRole("button", { name: "Se connecter" }).click();
  await expect(progress(page)).toHaveText(
    CLAUDE_LOGIN_FAILED.charAt(0).toUpperCase() + CLAUDE_LOGIN_FAILED.slice(1),
  );
});

test("pendant que Claude répond, on ne peut pas changer de compte", async ({ page }) => {
  await open(page, { claudeTurn: "hanging" });
  await headline(page).click();
  await input(page).fill("Bonjour");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(account(page).getByRole("button", { name: "Changer de compte" })).toBeDisabled();
  await column(page).getByRole("button", { name: "Arrêter" }).click();
  await expect(account(page).getByRole("button", { name: "Changer de compte" })).toBeEnabled();
});
