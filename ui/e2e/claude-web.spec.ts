import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Colonne Claude Code : après une lecture du web, les modifications de Claude sont retenues, et
// l'utilisateur les autorise d'un clic, pour un seul tour (fiche 0032). Tout à la souris.

const WORKSPACE = { "a.md": { content: "# Alpha\nPremière note.", modified: 20 } };

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    claudeWeb: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const conversation = (page: Page) => column(page).getByRole("log");

test("une modification retenue après le web s'autorise d'un clic, pour cette réponse seulement", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await column(page).getByRole("textbox", { name: "Message à Claude" }).fill("Cherche et note");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(conversation(page).locator(".claude-action")).toHaveText([
    "Recherche sur le webcapitale de la Mongolie",
    "Modificationa.mdretenue",
  ]);
  const notice = conversation(page).getByRole("alert");
  await expect(notice).toContainText("Claude a lu le web pendant cette réponse");
  await notice.getByRole("button", { name: "Autoriser ses modifications" }).click();
  await expect(conversation(page).getByRole("button", { name: "plan.md" })).toBeVisible();
  await expect(conversation(page).getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => window.backend.claudeChangesAllowed)).toEqual([false, true]);
  await conversation(page).getByRole("button", { name: "plan.md" }).click();
  await waitForNote(page, "Plan");
});
