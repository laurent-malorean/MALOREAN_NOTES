import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

// Colonne Claude Code : Claude se sert des outils de l'application (fiche 0040). Il demande ce que
// l'utilisateur regarde (la note de la colonne active et le texte sélectionné), cherche avec
// l'index, puis montre une note, qui s'ouvre dans la colonne active. Chaque action est nommée en
// français.

const WORKSPACE = {
  "a.md": { content: "# Alpha\ndu pain frais", modified: 20 },
  "b.md": { content: "# Bêta\nla boulangerie", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    claudeTools: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Alpha");
}

const column = (page: Page) => page.getByRole("region", { name: "Claude Code" });
const conversation = (page: Page) => column(page).getByRole("log");

test("Claude sait quelle note et quel passage l'utilisateur regarde, et lui montre une note", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await column(page).getByRole("textbox", { name: "Message à Claude" }).fill("Où acheter ça ?");
  await column(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(conversation(page).locator(".claude-action")).toHaveText([
    "Note regardée",
    "Recherche dans l’indexpain",
    "Note montréeb.md",
  ]);
  await waitForNote(page, "Bêta");
  await expect(conversation(page)).toContainText("Voici la note.");
  expect(await page.evaluate(() => window.backend.claudeViews)).toEqual([
    { request: 1, note: "a.md", selection: "du pain frais" },
  ]);
});
