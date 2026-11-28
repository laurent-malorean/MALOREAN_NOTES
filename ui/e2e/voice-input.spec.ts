// Saisie vocale (fiche 0103), à la souris et au clavier : le micro de la bande du haut, le texte provisoire grisé,
// le texte fixé, l'annulation, l'arrêt, les erreurs, et l'onglet « Saisie vocale » des réglages. Le moteur est
// remplacé par le faux : les événements sont écrits d'avance (`window.backend.emitVoice`), aucun vrai micro.
import { expect, type Page, test } from "@playwright/test";
import { waitForNote } from "./journey";

type VoiceEvent = Parameters<Window["backend"]["emitVoice"]>[0];

const fiche = (type: string, title: string) => `---\ntype: ${type}\n---\n# ${title}\n`;
const NOTES = {
  "voyage.md": { content: "# Voyage\n\nUn beau départ.", modified: 40 },
  "courses.md": { content: "# Courses\n\npain", modified: 30 },
  "carnet.md": { content: fiche("cahier-de-recherche", "Levures"), modified: 20 },
  "plan.canvas": { content: '{"nodes":[],"edges":[]}', modified: 10 },
};

async function launch(page: Page, voice?: string) {
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

const mic = (page: Page) =>
  page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button", { name: "Saisie vocale", exact: true });
const say = (page: Page, event: VoiceEvent) =>
  page.evaluate((item) => window.backend.emitVoice(item), event);
const voice = (page: Page) => page.evaluate(() => ({ ...window.backend.voice }));
const grey = (page: Page) => page.locator(".cm-voice-provisional");
const lastLine = (page: Page) => page.locator(".cm-line").last();
const toast = (page: Page, text: string) => page.locator(".toast", { hasText: text });
const settings = (page: Page) => page.getByRole("dialog", { name: "Réglages" });

/** Le curseur à la fin de la note, comme quand on reprend l'écriture. */
async function cursorAtEnd(page: Page) {
  await lastLine(page).click();
  await page.keyboard.press("End");
}

/** Démarre l'écoute par un clic sur le micro, et attend que le moteur écoute. */
async function listen(page: Page) {
  await cursorAtEnd(page);
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await expect(mic(page)).toHaveAttribute("title", "Arrêter la saisie vocale");
}

test("le micro est dans la bande du haut, avant le sélecteur de date, avec son raccourci dans la bulle", async ({
  page,
}) => {
  await launch(page);
  await expect(mic(page)).toBeEnabled();
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale (Ctrl+Maj+D)");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
  expect(names.indexOf("Saisie vocale") + 1).toBe(names.indexOf("Insérer la date du jour"));
  const sizes = await page.evaluate(() => {
    const box = (label: string) =>
      document.querySelector(`[aria-label="${label}"]`)?.getBoundingClientRect().toJSON();
    return [box("Saisie vocale"), box("Insérer la date du jour")].map((b) => [b.width, b.height]);
  });
  expect(sizes[0]).toEqual(sizes[1]);
});

test("un clic démarre l'écoute au curseur, l'éditeur garde le focus ; un second clic l'arrête", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  expect((await voice(page)).starts).toBe(1);
  await expect(page.locator(".cm-content")).toBeFocused();
  await say(page, { kind: "level", value: 0.8 });
  await expect(mic(page).locator(".voice-level")).toBeVisible();
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale (Ctrl+Maj+D)");
  expect((await voice(page)).stops).toBe(1);
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("la préparation de la langue fait tourner l'icône, puis l'écoute commence", async ({
  page,
}) => {
  await launch(page);
  await cursorAtEnd(page);
  await page.evaluate(() => void (window.backend.voice.silentStart = true));
  await mic(page).click();
  await say(page, { kind: "preparing" });
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale : préparation de la langue…");
  await say(page, { kind: "listening" });
  await expect(mic(page)).toHaveAttribute("title", "Arrêter la saisie vocale");
});

test("le texte provisoire est grisé et remplacé, le texte fixé entre dans la note, une seule annulation", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "provisional", text: "bon" });
  await say(page, { kind: "provisional", text: "bonjour tout" });
  await expect(grey(page)).toHaveCount(1);
  await expect(grey(page)).toHaveText(" bonjour tout");
  await expect(lastLine(page)).toHaveText("Un beau départ. bonjour tout");
  await say(page, { kind: "fixed", text: "Bonjour tout le monde." });
  await expect(grey(page)).toHaveCount(0);
  await say(page, { kind: "provisional", text: "comment" });
  await say(page, { kind: "fixed", text: "Comment allez-vous ?" });
  await say(page, { kind: "provisional", text: "très bien" });
  await expect(lastLine(page)).toHaveText(
    "Un beau départ. Bonjour tout le monde. Comment allez-vous ? très bien",
  );
  // Le provisoire n'est pas dans la note enregistrée.
  await expect
    .poll(() => page.evaluate(() => window.backend.notes["voyage.md"]?.content))
    .toBe("# Voyage\n\nUn beau départ. Bonjour tout le monde. Comment allez-vous ?");
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect(lastLine(page)).toHaveText(
    "Un beau départ. Bonjour tout le monde. Comment allez-vous ? très bien",
  );
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(lastLine(page)).toHaveText("Un beau départ.");
});

test("le curseur reste visible et la note longue défile avec le texte fixé", async ({ page }) => {
  await launch(page);
  await listen(page);
  for (let n = 0; n < 40; n++) await say(page, { kind: "fixed", text: `Phrase numéro ${n}.` });
  const visible = await page.evaluate(() => {
    const caret = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    const view = document.querySelector(".cm-scroller")?.getBoundingClientRect();
    return !!caret && !!view && caret.bottom <= view.bottom + 1 && caret.top >= view.top - 1;
  });
  expect(visible).toBe(true);
});

test("taper pendant l'écoute fixe le texte provisoire tel quel, et l'écoute continue", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "provisional", text: "alors" });
  await page.keyboard.type("!");
  await expect(grey(page)).toHaveCount(0);
  await expect(lastLine(page)).toHaveText("Un beau départ.! alors");
  await say(page, { kind: "provisional", text: "alors voilà" });
  await expect(grey(page)).toHaveText(" voilà");
  await say(page, { kind: "fixed", text: "alors voilà." });
  await expect(lastLine(page)).toHaveText("Un beau départ.! alors voilà.");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
});

test("déplacer le curseur fixe le texte provisoire, et l'écoute continue à la nouvelle place", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "provisional", text: "alors" });
  await page.keyboard.press("ArrowLeft");
  await expect(grey(page)).toHaveCount(0);
  await expect(lastLine(page)).toHaveText("Un beau départ. alors");
  await say(page, { kind: "fixed", text: "oui" });
  await expect(lastLine(page)).toHaveText("Un beau départ oui. alors");
});

test("Ctrl+Maj+D démarre et arrête l'écoute ; Cmd+Maj+D reste la date du jour", async ({
  page,
}) => {
  await launch(page);
  await cursorAtEnd(page);
  await page.keyboard.press("Control+Shift+D");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("Control+Shift+D");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  expect((await voice(page)).starts).toBe(1);
  expect((await voice(page)).stops).toBe(1);
});

test("Échap arrête l'écoute et fixe le texte provisoire", async ({ page }) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "provisional", text: "à bientôt" });
  await page.keyboard.press("Escape");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect(grey(page)).toHaveCount(0);
  await expect(lastLine(page)).toHaveText("Un beau départ. à bientôt");
  expect((await voice(page)).stops).toBe(1);
});

test("changer de note arrête l'écoute et garde le texte provisoire dans la note quittée", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "provisional", text: "dernier mot" });
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await waitForNote(page, "Courses");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  expect((await voice(page)).stops).toBe(1);
  await expect(grey(page)).toHaveCount(0);
  await expect(lastLine(page)).toHaveText("pain");
  await expect
    .poll(() => page.evaluate(() => window.backend.notes["voyage.md"]?.content))
    .toBe("# Voyage\n\nUn beau départ. dernier mot");
  expect(await page.evaluate(() => window.backend.notes["courses.md"]?.content)).toBe(
    "# Courses\n\npain",
  );
});

test("le silence est dit par un bref message, puis le micro revient au repos", async ({ page }) => {
  await launch(page);
  await listen(page);
  await say(page, { kind: "silence", message: "Saisie vocale arrêtée : silence" });
  await say(page, { kind: "ended" });
  await expect(toast(page, "Saisie vocale arrêtée : silence")).toBeVisible();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
});

test("une erreur du moteur est montrée telle quelle ; la saisie peut être relancée", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await say(page, {
    kind: "failed",
    reason: "stopped",
    message: "La saisie vocale s'est arrêtée.",
  });
  await say(page, { kind: "ended" });
  await expect(toast(page, "La saisie vocale s'est arrêtée.")).toHaveClass(/toast-error/);
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
});

test("accès refusé : le micro est grisé, un clic ouvre le message et son bouton ouvre les réglages de macOS", async ({
  page,
}) => {
  await launch(page, "denied");
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale : accès au micro refusé");
  await expect(mic(page)).toHaveClass(/voice-unavailable/);
  await mic(page).click();
  const message = toast(page, "La saisie vocale a besoin du micro et de la reconnaissance vocale.");
  await expect(message).toBeVisible();
  await message.getByRole("button", { name: "Ouvrir les réglages de macOS" }).click();
  expect((await voice(page)).privacyOpened).toBe(1);
  expect((await voice(page)).starts).toBe(0);
});

test("premier clic : l'accès est demandé par le moteur, puis l'écoute commence", async ({
  page,
}) => {
  await launch(page, "undecided");
  await cursorAtEnd(page);
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  expect((await voice(page)).access).toBe("allowed");
});

test("macOS trop ancien : le micro est grisé et la bulle dit pourquoi", async ({ page }) => {
  await launch(page, "old");
  await expect(mic(page)).toBeDisabled();
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale : macOS 26 minimum");
});

test("le micro est grisé hors d'un éditeur de texte : cahier en lecture seule, canvas, aucune note", async ({
  page,
}) => {
  await launch(page);
  await expect(mic(page)).toBeEnabled();
  await page.locator(".note-item", { hasText: "Levures" }).click();
  await expect(mic(page)).toBeDisabled();
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale : ouvrez une note");
  await page.locator(".note-item", { hasText: "plan" }).click();
  await expect(mic(page)).toBeDisabled();
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await expect(mic(page)).toBeEnabled();
});

test("Réglages, onglet « Saisie vocale » : la langue, le téléchargement, l'échec et « Réessayer »", async ({
  page,
}) => {
  await launch(page);
  await page.getByRole("button", { name: "Réglages" }).click();
  await settings(page).getByRole("tab", { name: "Saisie vocale" }).click();
  const panel = settings(page).getByRole("tabpanel");
  await expect(panel).toContainText("Le son reste sur le Mac");
  const language = panel.getByRole("combobox", { name: "Langue" });
  await expect(language).toHaveValue("");
  await expect(panel.locator(".voice-status")).toHaveText("français (France) : prête");
  await language.selectOption("en-US");
  await expect(panel.locator(".voice-status")).toHaveText("anglais (États-Unis) : à télécharger");
  expect(await page.evaluate(() => window.backend.voice.chosen)).toBe("en-US");

  await page.evaluate(() => {
    window.backend.voice.failNextPrepare =
      "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.";
    window.backend.voice.prepareDelay = 300;
  });
  await panel.getByRole("button", { name: "Télécharger le modèle de langue" }).click();
  await expect(panel.locator(".voice-status")).toHaveText("Préparation de la langue…");
  await expect(panel.getByRole("alert")).toHaveText(
    "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.",
  );
  await panel.getByRole("button", { name: "Réessayer" }).click();
  await expect(panel.locator(".voice-status")).toHaveText("anglais (États-Unis) : prête");
  expect(await page.evaluate(() => window.backend.voice.prepared)).toEqual(["en-US"]);
  await language.selectOption("");
  await expect(panel.locator(".voice-status")).toHaveText("français (France) : prête");
});

test("changer de langue pendant l'écoute est refusé, avec le message du moteur", async ({
  page,
}) => {
  await launch(page);
  await listen(page);
  await page.getByRole("button", { name: "Réglages" }).click();
  await settings(page).getByRole("tab", { name: "Saisie vocale" }).click();
  await settings(page).getByRole("combobox", { name: "Langue" }).selectOption("en-US");
  await expect(toast(page, "Arrêtez la saisie vocale avant de changer de langue.")).toBeVisible();
  await expect(settings(page).getByRole("combobox", { name: "Langue" })).toHaveValue("");
});

/** Les réglages, onglet « Saisie vocale » ouvert. */
async function openVoiceSettings(page: Page) {
  await page.getByRole("button", { name: "Réglages" }).click();
  await settings(page).getByRole("tab", { name: "Saisie vocale" }).click();
  return settings(page).getByRole("tabpanel");
}

test("Réglages : choisir le raccourci de la saisie vocale ; la bulle, le clavier et le rétablissement le suivent", async ({
  page,
}) => {
  await launch(page);
  const panel = await openVoiceSettings(page);
  const key = panel.locator(".shortcut-key");
  await expect(key).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Rétablir le raccourci par défaut" }),
  ).toBeHidden();
  await key.click();
  await expect(key).toHaveText("Appuyez sur la combinaison…");
  await page.keyboard.press("Control+Shift+E");
  await expect(panel.getByRole("button", { name: "Raccourci : ⌃⇧E" })).toBeVisible();
  expect(await page.evaluate(() => window.backend.voice.shortcut)).toBe("Ctrl+Maj+E");
  await page.keyboard.press("Escape");
  await expect(settings(page)).toBeHidden();
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale (Ctrl+Maj+E)");

  await cursorAtEnd(page);
  await page.keyboard.press("Control+Shift+D");
  expect((await voice(page)).starts).toBe(0);
  await page.keyboard.press("Control+Shift+E");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+Shift+E");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");

  const again = await openVoiceSettings(page);
  await again.getByRole("button", { name: "Rétablir le raccourci par défaut" }).click();
  await expect(again.getByRole("button", { name: "Raccourci : ⌃⇧D" })).toBeVisible();
  expect(await page.evaluate(() => window.backend.voice.shortcut)).toBeNull();
  await page.keyboard.press("Escape");
  await expect(mic(page)).toHaveAttribute("title", "Saisie vocale (Ctrl+Maj+D)");
});

test("Réglages : un raccourci déjà pris est refusé en nommant la commande ; Échap annule la saisie sans fermer les réglages", async ({
  page,
}) => {
  await launch(page);
  const panel = await openVoiceSettings(page);
  const key = panel.locator(".shortcut-key");
  await key.click();
  await page.keyboard.press("Meta+B");
  await expect(panel.getByRole("alert").filter({ hasText: "Gras" })).toHaveText(
    "Ce raccourci est déjà pris par « Gras ».",
  );
  expect(await page.evaluate(() => window.backend.voice.shortcut)).toBeNull();
  await key.click();
  await page.keyboard.press("Escape");
  await expect(settings(page)).toBeVisible();
  await expect(key).toHaveText("⌃⇧D");
  await key.click();
  await page.keyboard.press("Shift+D");
  await expect(panel.getByRole("alert").filter({ hasText: "Ctrl ou Cmd" })).toBeVisible();
  expect(await page.evaluate(() => window.backend.voice.shortcut)).toBeNull();
});

test("Réglages : les bips sont décochés par défaut ; cochés, un bip joue au début et un à la fin, y compris au silence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const notes: number[] = [];
    (window as unknown as { notes: number[] }).notes = notes;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this);
      notes.push(0);
      return oscillator;
    };
  });
  const notes = (page: Page) =>
    page.evaluate(() => (window as unknown as { notes: number[] }).notes.length);
  await launch(page);
  await listen(page);
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  expect(await notes(page)).toBe(0);

  const panel = await openVoiceSettings(page);
  const box = panel.getByRole("checkbox", { name: "Bip au début et à la fin de la dictée" });
  await expect(box).not.toBeChecked();
  await box.check();
  expect(await page.evaluate(() => window.backend.voice.beeps)).toBe(true);
  await page.keyboard.press("Escape");
  await listen(page);
  await expect.poll(() => notes(page)).toBe(2);
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => notes(page)).toBe(4);

  await listen(page);
  await expect.poll(() => notes(page)).toBe(6);
  await say(page, { kind: "silence", message: "Saisie vocale arrêtée : silence" });
  await say(page, { kind: "ended" });
  await expect.poll(() => notes(page)).toBe(8);
});
