// Saisie vocale dans la zone de saisie d'un cahier de recherche (fiche 0111) : le micro est actif, la dictée écrit dans le champ,
// le texte provisoire est remplacé, rien n'est ajouté au cahier avant « Ajouter l'entrée ». Le moteur est le faux.
import { expect, type Page, test } from "@playwright/test";
import { launch, mic, say, toast, voice } from "./voice-journey";

const entryField = (page: Page) => page.locator(".notebook-entry-text");

/** Ouvre le cahier « Levures », le curseur dans sa zone de saisie, et démarre l'écoute par le micro. */
async function listenInNotebook(page: Page) {
  await page.locator(".note-item", { hasText: "Levures" }).click();
  await expect(entryField(page)).toBeVisible();
  await entryField(page).click();
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await expect(entryField(page)).toBeFocused();
}

test("cahier de recherche : la dictée écrit dans la zone de saisie, le texte provisoire se remplace, rien n'est ajouté au cahier", async ({
  page,
}) => {
  await launch(page);
  await listenInNotebook(page);
  await expect(entryField(page)).toHaveClass(/dictating/);
  await say(page, { kind: "listening" });
  await say(page, { kind: "provisional", text: "la levure" });
  await expect(entryField(page)).toHaveValue("la levure");
  await say(page, { kind: "provisional", text: "la levure a lev" });
  await expect(entryField(page)).toHaveValue("la levure a lev");
  await say(page, { kind: "fixed", text: "La levure a levé." });
  await say(page, { kind: "provisional", text: "Après" });
  await expect(entryField(page)).toHaveValue("La levure a levé. Après");
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await say(page, { kind: "fixed", text: "Après" });
  await say(page, { kind: "ended" });
  await expect(entryField(page)).toHaveValue("La levure a levé. Après");
  await expect(entryField(page)).not.toHaveClass(/dictating/);
  expect((await voice(page)).stops).toBe(1);
  // Le cahier n'a reçu aucune entrée : seul « Ajouter l'entrée » en ajoute.
  await expect(toast(page, "Entrée ajoutée")).toHaveCount(0);
  await expect(page.locator(".cm-content")).not.toContainText("La levure a levé.");
  await page.getByRole("button", { name: "Ajouter l'entrée" }).click();
  await expect(toast(page, "Entrée ajoutée")).toBeVisible();
  await expect(entryField(page)).toHaveValue("");
});

test("cahier de recherche : le raccourci démarre et arrête la dictée, Échap l'arrête, changer de contenu fixe le texte", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Levures" }).click();
  await entryField(page).click();
  await page.keyboard.press("Control+Shift+D");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await say(page, { kind: "provisional", text: "un test" });
  await page.keyboard.press("Escape");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await say(page, { kind: "fixed", text: "un test" });
  await say(page, { kind: "ended" });
  await expect(entryField(page)).toHaveValue("un test");
  await page.keyboard.press("Control+Shift+D");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await say(page, { kind: "provisional", text: "et la suite" });
  await expect(entryField(page)).toHaveValue("un test et la suite");
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await say(page, { kind: "ended" });
  await page.locator(".note-item", { hasText: "Levures" }).click();
  await expect(entryField(page)).toBeVisible();
});

test("cahier de recherche : taper dans la zone de saisie pendant l'écoute fixe le texte provisoire, l'écoute continue ; une erreur est dite comme ailleurs", async ({
  page,
}) => {
  await launch(page);
  await listenInNotebook(page);
  await say(page, { kind: "provisional", text: "bonjour" });
  await page.keyboard.type("!");
  await expect(entryField(page)).toHaveValue("bonjour!");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await say(page, { kind: "provisional", text: "bonjour tout" });
  await expect(entryField(page)).toHaveValue("bonjour! tout");
  await say(page, {
    kind: "failed",
    reason: "stopped",
    message: "La saisie vocale s'est arrêtée.",
  });
  await say(page, { kind: "fixed", text: "bonjour tout" });
  await say(page, { kind: "ended" });
  await expect(toast(page, "La saisie vocale s'est arrêtée.")).toBeVisible();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect(entryField(page)).toHaveValue("bonjour! tout");
});
