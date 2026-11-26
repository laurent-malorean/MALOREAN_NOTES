import { expect, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

// La fenêtre de recherche range ses résultats en sections de résultats (fiche 0093) : Canvas, Cartes mentales,
// Cahiers de recherche, CRM, puis Notes en dernier. Un canvas, une carte mentale (avec son nœud), une fiche
// de CRM et deux notes trouvés par le même mot.
const NOTES = {
  "Notes de labo.md": { content: "# Notes de labo\n\nLa levure monte vite.", modified: 90 },
  "Idées.md": { content: "# Idées\n\nUne levure sauvage.", modified: 80 },
  "Plan.md": { content: "# Plan\n\nrien", modified: 100 },
  "Labo/schéma.canvas": { content: '{"nodes":[{"text":"levure"}],"edges":[]}', modified: 70 },
  "Labo/carte.md": {
    content:
      "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}]\n---\n# Carte\n\n- Racine\n  - Levure mère\n",
    modified: 60,
  },
  "crm-fake/actions/devis.md": {
    content: "---\ntype: crm-action\nstatut: TODO\n---\n# Devis levure\n",
    modified: 50,
  },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: JSON.stringify(["Labo", "crm-fake", "crm-fake/actions"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
}

test("une recherche qui trouve un canvas, une carte mentale et son nœud, une fiche de CRM et deux notes les range en sections, Notes en dernier", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("levure");

  const column = page.locator(".match-results");
  await expect(column.locator(".search-result")).toHaveCount(6);
  await expect(column.locator(".search-section-title")).toHaveText([
    "Canvas (1)",
    "Cartes mentales (2)",
    "CRM (1)",
    "Notes (2)",
  ]);
  await expect(column.getByRole("group", { name: "Notes (2)" }).locator(".note-title")).toHaveText([
    "Notes de labo",
    "Idées",
  ]);
  // Le type reste écrit à droite de chaque résultat, dans l'ordre des sections.
  await expect(column.locator(".search-type")).toHaveText([
    "Canvas",
    "Carte mentale",
    "Nœud · Carte",
    "Action",
    "Note",
    "Note",
  ]);
  // La dernière section est celle des notes : la plus nombreuse ne repousse pas les autres.
  const last = column.locator(".search-section").last();
  await expect(last.locator(".search-section-title")).toHaveText("Notes (2)");
});

test("ouvrir un résultat d'une section l'ouvre, et le titre d'une section n'ouvre rien", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("levure");
  const column = page.locator(".match-results");
  await column.locator(".search-section-title").first().click({ force: true });
  await expect(page.locator(".search-window")).toBeVisible();
  await column.getByRole("button", { name: /Devis levure/ }).click();
  await expect(page.locator(".search-window")).toBeHidden();
});
