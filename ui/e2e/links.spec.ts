// Parcours des liens d'une note : un simple clic les ouvre, un clic qui glisse sélectionne.
import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote, waitForNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

async function launch(page: Page, notes: Notes) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, notes);
}

const opened = (page: Page) => page.evaluate(() => window.backend.opened);

test("un simple clic sur un lien entre notes ouvre la note visée", async ({ page }) => {
  await launch(page, {
    "courses.md": { content: "# Courses\npain", modified: 1 },
    "lundi.md": { content: "# Lundi\nPenser aux [[courses]] demain", modified: 2 },
  });
  await page.locator(".cm-note-link", { hasText: "courses" }).click();
  await waitForNote(page, "Courses");
});

test("un simple clic sur un lien Markdown ouvre sa pièce jointe ou son adresse web", async ({
  page,
}) => {
  await launch(page, {
    "voyage.md": {
      content:
        "# Voyage\n[Billet](voyage.assets/Billet.pdf) et [la carte](https://example.com/carte)",
      modified: 1,
    },
  });
  await page.getByText("Billet", { exact: true }).click();
  await page.getByText("la carte", { exact: true }).click();
  await expect
    .poll(() => opened(page))
    .toEqual(["voyage.assets/Billet.pdf", "https://example.com/carte"]);
});

test("un clic qui glisse sur un lien sélectionne du texte sans l'ouvrir", async ({ page }) => {
  await launch(page, {
    "courses.md": { content: "# Courses\npain", modified: 1 },
    "lundi.md": { content: "# Lundi\nPenser aux [[courses]] demain", modified: 2 },
  });
  const link = await page.locator(".cm-note-link").boundingBox();
  if (!link) throw new Error("lien absent de l'écran");
  const y = link.y + link.height / 2;
  await page.mouse.move(link.x + link.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(link.x + link.width + 60, y, { steps: 5 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  await expect(page.locator(".cm-line").first()).toHaveText("Lundi");
});
