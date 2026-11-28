// Aides communes des parcours de la saisie vocale (fiche 0103) : le lancement avec le faux moteur, le micro, les événements du moteur.
import { expect, type Page } from "@playwright/test";
import { waitForNote } from "./journey";

export type VoiceEvent = Parameters<Window["backend"]["emitVoice"]>[0];

const fiche = (type: string, title: string) => `---\ntype: ${type}\n---\n# ${title}\n`;
export const NOTES = {
  "voyage.md": { content: "# Voyage\n\nUn beau départ.", modified: 40 },
  "courses.md": { content: "# Courses\n\npain", modified: 30 },
  "carnet.md": { content: fiche("cahier-de-recherche", "Levures"), modified: 20 },
  "plan.canvas": { content: '{"nodes":[],"edges":[]}', modified: 10 },
};

export async function launch(page: Page, voice?: string) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const params = new URLSearchParams({
    notes: JSON.stringify(NOTES),
    folders: "[]",
    remembered: "1",
    ...(voice ? { voice } : {}),
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

export const mic = (page: Page) =>
  page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button", { name: "Saisie vocale", exact: true });
export const say = (page: Page, event: VoiceEvent) =>
  page.evaluate((item) => window.backend.emitVoice(item), event);
export const voice = (page: Page) => page.evaluate(() => ({ ...window.backend.voice }));
export const grey = (page: Page) => page.locator(".cm-voice-provisional");
export const lastLine = (page: Page) => page.locator(".cm-line").last();
export const toast = (page: Page, text: string) => page.locator(".toast", { hasText: text });
export const settings = (page: Page) => page.getByRole("dialog", { name: "Réglages" });

/** Le curseur à la fin de la note, comme quand on reprend l'écriture. */
export async function cursorAtEnd(page: Page) {
  await lastLine(page).click();
  await page.keyboard.press("End");
}

/** Démarre l'écoute par un clic sur le micro, et attend que le moteur écoute. */
export async function listen(page: Page) {
  await cursorAtEnd(page);
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await expect(mic(page)).toHaveAttribute("title", "Arrêter la saisie vocale");
}
