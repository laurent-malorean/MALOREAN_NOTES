import { expect, type Page } from "@playwright/test";
import { waitForNote } from "./journey";

// Ce que partagent les parcours de l'agenda 12 : l'espace de travail d'essai, son ouverture, les noms des champs.

export const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process?.env.MAQUETTES;
export type Notes = Record<string, { content: string; modified: number }>;

export const event = (title: string, header: string[]) =>
  `---\ntype: agenda-12-evenement\n${header.map((l) => `${l}\n`).join("")}---\n# ${title}\n\nNotes de ${title}\n`;

export const NOTES: Notes = {
  "courses.md": { content: "# Courses\n- lait", modified: 50 },
  "Pro/salons.md": { content: "---\ntype: agenda-12\n---\n# Salons\n", modified: 40 },
  "Pro/salons/embedded.md": {
    content: event("Salon Embedded World", [
      ...["mois: 2", "jour: 10", "annee: 2027", "jour-fin: 13", "pays: DE"],
      ...["ville: Nuremberg", "tags: [salon]"],
    ]),
    modified: 30,
  },
  "Pro/salons/domaines.md": {
    content: event("Renouveler malorean.fr", ["mois: 2", "annee: 2029", "tags: [domaine]"]),
    modified: 20,
  },
  "Pro/salons/audit.md": {
    content: event("Audit ISO", ["mois: 1", "jour: 15"]),
    modified: 10,
  },
  "Pro/salons/archives/rotterdam.md": {
    content: event("Salon de Rotterdam", ["mois: 5", "clos-le: 2026-06-01"]),
    modified: 5,
  },
};

export async function launch(page: Page, notes: Notes = NOTES) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(notes),
    folders: JSON.stringify(["Pro"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

export async function openSalons(page: Page) {
  await launch(page);
  await page.locator(".folder-item", { hasText: "Pro" }).click();
  await page.locator(".note-item", { hasText: "Salons" }).click();
  await expect(page.locator(".agenda-month")).toHaveCount(12);
}

export const field = (page: Page, label: string) =>
  page.locator(`.agenda-band [aria-label="${label}"]`);
export const band = (page: Page) => page.locator(".agenda-band");
