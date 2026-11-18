import { expect, type Page, test } from "@playwright/test";
import { openNote, waitForNote } from "./journey";

const WORKSPACE = {
  "courses.md": { content: "# Courses\n- pain", modified: 20 },
  "idee.md": { content: "# Idée\ntexte", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Courses");
}

const lines = (page: Page) => page.locator(".cm-line");
const history = (page: Page) => page.getByRole("dialog", { name: "Historique" });
const versionsOf = (page: Page, path: string) =>
  page.evaluate((p) => (window.backend.versions[p] ?? []).map((v) => v.content), path);
const content = (page: Page, path: string) =>
  page.evaluate((p) => window.backend.notes[p]?.content ?? null, path);
const changeOutside = (page: Page, path: string, text: string) =>
  page.evaluate(([p, t]) => window.backend.changeOutside(p ?? "", t ?? ""), [path, text]);

/** Tape `text` à la fin de la dernière ligne de la note montrée. */
async function typeAtEnd(page: Page, text: string) {
  await lines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("après 5 minutes de frappe, une version de la note est gardée", async ({ page }) => {
  await page.clock.install();
  await launch(page);
  await typeAtEnd(page, " frais");
  await expect.poll(() => content(page, "courses.md")).toBe("# Courses\n- pain frais");
  expect(await versionsOf(page, "courses.md")).toEqual([]);
  await page.clock.fastForward("05:00");
  await expect.poll(() => versionsOf(page, "courses.md")).toEqual(["# Courses\n- pain frais"]);
});

test("passer à une autre note garde une version de celle qu'on a tapée", async ({ page }) => {
  await launch(page);
  await typeAtEnd(page, " frais");
  await openNote(page, "Idée");
  await expect.poll(() => versionsOf(page, "courses.md")).toEqual(["# Courses\n- pain frais"]);
  expect(await versionsOf(page, "idee.md")).toEqual([]);
});

test("un changement fait hors de l'application garde d'abord le texte d'avant", async ({
  page,
}) => {
  await launch(page);
  await changeOutside(page, "courses.md", "# Courses\n- lait");
  await expect(lines(page)).toHaveText(["Courses", "•lait"]);
  await page.keyboard.press("Meta+y");
  await expect(history(page)).toBeVisible();
  await expect(history(page).locator(".history-version")).toHaveText(["16 novembre 2026 à 18:30"]);
  await expect(history(page).locator(".history-line.added")).toHaveText(["- pain"]);
  await expect(history(page).locator(".history-line.removed")).toHaveText(["- lait"]);
});

test("restaurer une version la remet dans la note, la version actuelle gardée d'abord", async ({
  page,
}) => {
  await launch(page);
  await changeOutside(page, "courses.md", "# Courses\n- lait");
  await expect(lines(page)).toHaveText(["Courses", "•lait"]);
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.locator(".context-menu button", { hasText: "Historique…" }).click();
  await history(page).getByRole("button", { name: "Restaurer" }).click();
  await expect(history(page)).toBeHidden();
  await expect(lines(page)).toHaveText(["Courses", "•pain"]);
  await expect(page.locator(".status")).toContainText("Version restaurée");
  expect(await content(page, "courses.md")).toBe("# Courses\n- pain");
  expect(await versionsOf(page, "courses.md")).toEqual(["# Courses\n- pain", "# Courses\n- lait"]);
  await typeAtEnd(page, " complet");
  await expect.poll(() => content(page, "courses.md")).toBe("# Courses\n- pain complet");
});

test("une note renommée par son titre garde son historique", async ({ page }) => {
  await launch(page);
  await changeOutside(page, "courses.md", "# Courses\n- lait");
  await expect(lines(page)).toHaveText(["Courses", "•lait"]);
  await lines(page).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await expect.poll(() => content(page, "courses-bio.md")).toBe("# Courses bio\n- lait");
  expect(await versionsOf(page, "courses-bio.md")).toEqual(["# Courses\n- pain"]);
  await page.getByRole("tab", { name: /Courses bio/ }).click({ button: "right" });
  await page.locator(".context-menu button", { hasText: "Historique…" }).click();
  await expect(history(page).locator(".history-title")).toHaveText("Historique de « Courses bio »");
  await expect(history(page).locator(".history-version")).toHaveCount(1);
});

test("l'historique est dans la palette et la barre des menus", async ({ page }) => {
  await launch(page);
  await page.evaluate(() => window.backend.chooseMenu("note-history"));
  await expect(history(page)).toBeVisible();
  await expect(history(page).locator(".history-empty")).toContainText("Aucune version");
  await history(page).getByRole("button", { name: "Fermer" }).click();
  await page.keyboard.press("Meta+Shift+p");
  await page.keyboard.type("Historique");
  await page.keyboard.press("Enter");
  await expect(history(page)).toBeVisible();
});
