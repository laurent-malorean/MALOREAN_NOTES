import { expect, type Page, test } from "@playwright/test";
import { openNote, waitForNote } from "./journey";

const WORKSPACE = {
  "voyage.md": { content: "# Voyage\nUn beau départ.\nvalise\nsac\ncarte", modified: 20 },
  "courses.md": { content: "# Courses\n- pain", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForNote(page, "Voyage");
}

const saved = (page: Page) =>
  page.evaluate(() => window.backend.notes["voyage.md"]?.content ?? null);
const bar = (page: Page) => page.getByRole("toolbar", { name: "Mise en forme" });
const button = (page: Page, name: string) => bar(page).getByRole("button", { name, exact: true });

/** Sélectionne un mot de la note par un double clic, à la souris seule. */
async function selectWord(page: Page, word: string) {
  const box = await page.evaluate((wanted) => {
    const content = document.querySelector(".cm-content") as HTMLElement;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }
    throw new Error(`mot introuvable : ${wanted}`);
  }, word);
  await page.mouse.dblclick(box.x, box.y);
}

/** L'éditeur garde le focus, et ce qui y est sélectionné. */
async function editorSelection(page: Page) {
  return page.evaluate(() => ({
    focused: document.activeElement?.closest(".cm-editor") !== null,
    selected: window.getSelection()?.toString() ?? "",
  }));
}

test("la barre est en haut, à gauche du bouton Focus, et ses bulles d'aide donnent les raccourcis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 700 });
  await launch(page);
  const barBox = await bar(page).boundingBox();
  const focusBox = await page.getByRole("button", { name: "Focus" }).boundingBox();
  const tabsBox = await page.getByRole("tab").first().boundingBox();
  if (!barBox || !focusBox || !tabsBox) throw new Error("barre, Focus ou onglet absent");
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(focusBox.x);
  expect(Math.abs(barBox.y - focusBox.y)).toBeLessThan(focusBox.height);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabsBox.y);
  await expect(button(page, "Gras")).toHaveAttribute("title", "Gras (Cmd+B)");
  await expect(button(page, "Copier en Markdown")).toHaveAttribute(
    "title",
    "Copier en Markdown (Ctrl+Cmd+C)",
  );
});

test("Gras, Italique et Lien posent leur syntaxe autour de la sélection, qui reste dans l'éditeur", async ({
  page,
}) => {
  await launch(page);
  await selectWord(page, "beau");
  await button(page, "Gras").click();
  await expect.poll(() => saved(page)).toContain("Un **beau** départ.");
  expect(await editorSelection(page)).toEqual({ focused: true, selected: "beau" });

  await button(page, "Italique").click();
  await expect.poll(() => saved(page)).toContain("Un ***beau*** départ.");
  expect(await editorSelection(page)).toEqual({ focused: true, selected: "beau" });

  await selectWord(page, "valise");
  await button(page, "Lien").click();
  await page.getByRole("option", { name: "Une page web" }).click();
  await expect.poll(() => saved(page)).toContain("[valise](");
  expect((await editorSelection(page)).focused).toBe(true);
});

test("Lien propose « Une note ou un contenu » et « Une page web » ; le texte sélectionné devient le lien", async ({
  page,
}) => {
  await launch(page);
  await selectWord(page, "sac");
  await button(page, "Lien").click();
  await expect(page.getByRole("dialog").getByRole("option")).toHaveText([
    "Une note ou un contenu",
    "Une page web",
  ]);
  await page.getByRole("option", { name: "Une note ou un contenu" }).click();
  await page.getByRole("option", { name: /Courses/ }).click();
  await expect.poll(() => saved(page)).toContain("[[Courses|sac]]");
  expect((await editorSelection(page)).focused).toBe(true);
});

test("Lien fonctionne aussi sans sélection : le lien est écrit au curseur", async ({ page }) => {
  await launch(page);
  await page.locator(".cm-content").click();
  await button(page, "Lien").click();
  await page.getByRole("option", { name: "Une note ou un contenu" }).click();
  await page.getByRole("option", { name: /Courses/ }).click();
  await expect.poll(() => saved(page)).toContain("[[Courses]]");
});

test("les titres, les listes et la date du jour visent la ligne du curseur, à la souris seule", async ({
  page,
}) => {
  await launch(page);
  const steps: [string, string, string][] = [
    ["valise", "Titre 1", "# valise"],
    ["valise", "Titre 2", "## valise"],
    ["valise", "Titre 3", "### valise"],
    ["sac", "Liste à puces", "- sac"],
    ["carte", "Liste numérotée", "1. carte"],
  ];
  for (const [word, name, line] of steps) {
    await selectWord(page, word);
    await button(page, name).click();
    await expect.poll(() => saved(page)).toContain(`\n${line}`);
    expect((await editorSelection(page)).focused).toBe(true);
  }
  await selectWord(page, "beau");
  await button(page, "Insérer la date du jour").click();
  await expect.poll(() => saved(page)).toMatch(/^# Voyage\nUn \d{1,2} \S+ \d{4} départ\./);
  expect((await editorSelection(page)).focused).toBe(true);
});

test("les deux boutons de copie copient la note de la colonne active", async ({ page }) => {
  await launch(page);
  await button(page, "Copier en Markdown").click();
  await expect
    .poll(() => page.evaluate(() => window.backend.copiedMarkdown))
    .toEqual([WORKSPACE["voyage.md"].content]);
  await button(page, "Copier en texte mis en forme").click();
  await expect
    .poll(() => page.evaluate(() => window.backend.copied.map((copy) => copy.text)))
    .toEqual(["Voyage\n\nUn beau départ.\nvalise\nsac\ncarte"]);
});

test("sans note montrée, tous les boutons sont grisés ; ils reviennent avec une note", async ({
  page,
}) => {
  await launch(page);
  const buttons = bar(page).getByRole("button");
  await expect(buttons).toHaveCount(11);
  await page.getByRole("button", { name: "Fermer l'onglet" }).click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  for (const each of await buttons.all()) await expect(each).toBeDisabled();

  await openNote(page, "Courses");
  for (const each of await buttons.all()) await expect(each).toBeEnabled();
});

test("dans une fenêtre étroite, la barre passe à la ligne sans cacher de bouton", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await launch(page);
  const tools = page.locator(".editor-tools");
  for (const each of await bar(page).getByRole("button").all()) await expect(each).toBeInViewport();
  const overflow = await tools.evaluate((row) => row.scrollWidth - row.clientWidth);
  expect(overflow).toBe(0);
  await button(page, "Copier en Markdown").click();
  await expect.poll(() => page.evaluate(() => window.backend.copiedMarkdown.length)).toBe(1);
});
