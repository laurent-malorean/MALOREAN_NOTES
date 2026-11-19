import { expect, type Page, test } from "@playwright/test";
import { UNAVAILABLE } from "./fake-writing";

const NOTE = "# Rangement\nLes notes sont enregistrer ici, sans fote.\nFin.";
const WORKSPACE = { "rangement.md": { content: NOTE, modified: 20 } };

async function launch(page: Page, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
    ...extra,
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").first()).toHaveText("Rangement");
}

/** Sélectionne au clavier la deuxième ligne de la note. */
async function selectSecondLine(page: Page) {
  await page.locator(".cm-line").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
}

const saved = (page: Page) =>
  page.evaluate(() => window.backend.notes["rangement.md"]?.content ?? null);
const proposal = (page: Page) => page.getByRole("dialog", { name: /la sélection/ });
const marked = (page: Page, kind: "added" | "removed") =>
  proposal(page).locator(`.proposal-part.${kind}`).allTextContents();

test("clic droit sur une sélection, Corriger : la proposition montre ses différences, « Remplacer » l'écrit dans la note", async ({
  page,
}) => {
  await launch(page);
  await selectSecondLine(page);
  await page.locator(".cm-line").nth(1).click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText(["Corriger", "Reformuler", "Résumer"]);
  await page.getByRole("menuitem", { name: "Corriger" }).click();
  await expect(
    proposal(page).getByRole("heading", { name: "Corriger la sélection" }),
  ).toBeVisible();
  await expect.poll(() => marked(page, "removed")).toEqual(["enregistrer", "fote."]);
  expect(await marked(page, "added")).toEqual(["enregistrées", "faute."]);
  expect(await saved(page)).toBe(NOTE);
  await proposal(page).getByRole("button", { name: "Remplacer" }).click();
  await expect(proposal(page)).toBeHidden();
  const corrected = "# Rangement\nLes notes sont enregistrées ici, sans faute.\nFin.";
  await expect.poll(() => saved(page)).toBe(corrected);
  expect(await page.evaluate(() => window.backend.rewritings)).toEqual([
    ["correct", "Les notes sont enregistrer ici, sans fote."],
  ]);
});

test("Ctrl+Cmd+U résume la sélection, « Insérer dessous » ajoute le résumé sous elle", async ({
  page,
}) => {
  await launch(page);
  await selectSecondLine(page);
  await page.keyboard.press("Meta+Control+U");
  await proposal(page).getByRole("button", { name: "Insérer dessous" }).click();
  await expect
    .poll(() => saved(page))
    .toBe("# Rangement\nLes notes sont enregistrer ici, sans fote.\n\nEn bref : rangé.\nFin.");
});

test("Reformuler depuis la barre des menus, puis « Annuler » : la note ne change pas", async ({
  page,
}) => {
  await launch(page);
  await expect
    .poll(() => page.evaluate(() => window.backend.greyed["rephrase-selection"]))
    .toBe(false);
  await selectSecondLine(page);
  await page.evaluate(() => window.backend.chooseMenu("rephrase-selection"));
  await expect(proposal(page).locator(".proposal-part.added")).toHaveText(
    "Autrement dit, tout est rangé.",
  );
  await proposal(page).getByRole("button", { name: "Annuler" }).click();
  await expect(proposal(page)).toBeHidden();
  await page.keyboard.type("!");
  await expect.poll(() => saved(page)).toBe("# Rangement\n!\nFin.");
});

test("sans sélection, le raccourci demande de sélectionner d'abord le texte", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-line").nth(1).click();
  await page.keyboard.press("Meta+Control+K");
  await expect(page.locator(".status")).toContainText("Sélectionnez d'abord le texte à corriger");
  await expect(proposal(page)).toBeHidden();
});

test("sur un Mac sans Apple Intelligence, les actions sont grisées et disent pourquoi", async ({
  page,
}) => {
  await launch(page, { assistant: "unavailable" });
  expect(await page.evaluate(() => window.backend.greyed["correct-selection"])).toBe(true);
  await selectSecondLine(page);
  await page.locator(".cm-line").nth(1).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Corriger" })).toBeDisabled();
  await expect(page.locator(".context-menu-note")).toContainText(UNAVAILABLE);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+Control+R");
  await expect(page.locator(".status")).toContainText(UNAVAILABLE);
  expect(await page.evaluate(() => window.backend.rewritings)).toEqual([]);
});
