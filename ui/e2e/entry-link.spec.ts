import { expect, type Page, test } from "@playwright/test";
import { openNote, waitForNote } from "./journey";

// Lien vers une entrée d'un cahier de recherche (fiche 0107) : copier la référence depuis le
// cahier, la coller dans une note, cliquer : le cahier s'ouvre sur l'entrée, mise en évidence.

const ENTRIES = Array.from(
  { length: 30 },
  (_, n) => `- 09:${String(n).padStart(2, "0")} - Observation ${n + 1}`,
).join("\n");
const NOTEBOOK = `---\ntype: cahier-de-recherche\n---\n# Levures\n\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n${ENTRIES}\n`;
const NOTES = {
  "labo/levures.md": { content: NOTEBOOK, modified: 10 },
  "journal.md": { content: "# Journal\n", modified: 20 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["labo"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Journal");
}

/** Copie la référence de l'entrée numéro `number` du cahier ouvert, et rend ce qui a été copié. */
async function copyReference(page: Page, number: string) {
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("Observation");
  await page.locator(".match-results .search-result").first().click();
  await page.getByRole("button", { name: `Copier la référence de l'entrée ${number}` }).click();
  await expect(page.locator(".status")).toContainText("Référence copiée");
  const copied = await page.evaluate(() => window.backend.copiedMarkdown);
  return copied.at(-1) ?? "";
}

/** Écrit `text` à la fin de la note Journal, comme un collage. */
async function pasteInJournal(page: Page, text: string) {
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("");
  await openNote(page, "Journal");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText(`Voir ${text} puis la suite.`);
  await page.keyboard.press("Meta+ArrowUp");
}

test("la référence copiée depuis un cahier, collée dans une note, ouvre le cahier sur l'entrée", async ({
  page,
}) => {
  await launch(page);
  const reference = await copyReference(page, "0003");
  expect(reference).toBe("[[Levures#0003]]");
  await pasteInJournal(page, reference);
  await expect(page.locator(".cm-note-link")).toHaveText("Levures#0003");

  await page.locator(".cm-note-link").click();
  await expect(page.locator(".notebook-entry")).toBeVisible();
  const entry = page.locator(".cm-line.entry-flash");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Observation 3");
  await expect(entry).toBeInViewport();
  await expect(page.locator(".status")).not.toContainText("introuvable");
});

test("un lien vers une entrée lointaine fait défiler le cahier jusqu'à elle", async ({ page }) => {
  await launch(page);
  await pasteInJournal(page, "[[Levures#0027]]");
  await page.locator(".cm-note-link").click();
  await expect(page.locator(".notebook-entry")).toBeVisible();
  const entry = page.locator(".cm-line.entry-flash");
  await expect(entry).toContainText("Observation 27");
  await expect(entry).toBeInViewport();
  await expect
    .poll(() =>
      page
        .locator(".cm-scroller")
        .first()
        .evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(0);
});

test("un numéro d'entrée qui n'existe pas ouvre le cahier sans défiler et le dit", async ({
  page,
}) => {
  await launch(page);
  await pasteInJournal(page, "[[Levures#0099]]");
  await page.locator(".cm-note-link").click();
  await expect(page.locator(".notebook-entry")).toBeVisible();
  await expect(page.locator(".status")).toContainText("Entrée 0099 introuvable dans ce cahier");
  await expect(page.locator(".cm-line.entry-flash")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".cm-scroller")
        .first()
        .evaluate((el) => el.scrollTop),
    )
    .toBe(0);
});
