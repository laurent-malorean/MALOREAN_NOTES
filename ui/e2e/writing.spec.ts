import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

async function launch(page: Page, notes: Notes) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

/** Place le curseur à la fin de la note ouverte. */
async function typeAtEnd(page: Page) {
  await page.locator(".cm-line").last().click();
  await page.keyboard.press("Meta+ArrowDown");
}

test("une liste continue à la ligne et s'arrête sur un élément vide", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\n- pain", modified: 1 } });
  await typeAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("lait");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("fin");
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- pain\n- lait\nfin");
});

test("Échap ferme la recherche dans la note sans quitter le plein écran", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain\npain", modified: 1 } });
  await page.getByRole("button", { name: "Plein écran" }).click();
  await typeAtEnd(page);
  await page.keyboard.press("Meta+F");
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  expect(await page.evaluate(() => window.backend.fullScreen)).toBe(true);
});

test("remplacer partout dans la note enregistre le résultat", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain\npain", modified: 1 } });
  await typeAtEnd(page);
  await page.keyboard.press("Meta+F");
  await page.keyboard.type("pain");
  await page.locator(".cm-search input[name=replace]").fill("brioche");
  await page.getByRole("button", { name: "tout remplacer" }).click();
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\nbrioche\nbrioche");
});

test("le mode machine à écrire se met en marche, est gardé, puis s'arrête", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain", modified: 1 } });
  const button = page.getByRole("button", { name: "Machine à écrire" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Meta+Shift+T");
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("le bandeau compte les mots, les caractères et les pages de la note", async ({ page }) => {
  await launch(page, { "courses.md": { content: "# Courses\npain lait", modified: 1 } });
  const bar = page.locator(".cm-status-bar");
  await expect(bar).toHaveText("3 mots · 16 caractères · 1 page");
  await typeAtEnd(page);
  await page.keyboard.type(" œufs");
  await expect(bar).toHaveText("4 mots · 21 caractères · 1 page");
});

test("le plan liste les titres, emmène au titre cliqué, et reste en plein écran", async ({
  page,
}) => {
  const body = Array.from({ length: 80 }, (_, i) => `ligne ${i}`).join("\n");
  await launch(page, { "guide.md": { content: `# Guide\n${body}\n## Annexe`, modified: 1 } });
  const outline = page.getByRole("navigation", { name: "Plan de la note" });
  await expect(outline).toBeHidden();
  await page.getByRole("button", { name: "Plan" }).click();
  await expect(outline.locator(".outline-item")).toHaveText(["Guide", "Annexe"]);
  await outline.getByRole("button", { name: "Annexe" }).click();
  // Le curseur est sur le titre, à l'écran : sa syntaxe se montre.
  await expect(page.locator(".cm-line", { hasText: "## Annexe" })).toBeInViewport();
  await page.getByRole("button", { name: "Plein écran" }).click();
  await expect(outline).toBeVisible();
  await page.keyboard.press("Meta+Shift+O");
  await expect(outline).toBeHidden();
});

test("le nombre de caractères par page se règle, est gardé, et Échap ferme les réglages", async ({
  page,
}) => {
  await launch(page, { "courses.md": { content: `# Courses\n${"a".repeat(2990)}`, modified: 1 } });
  const bar = page.locator(".cm-status-bar");
  await expect(bar).toContainText("2 pages");
  await page.getByRole("button", { name: "Plein écran" }).click();
  await page.keyboard.press("Meta+,");
  const dialog = page.getByRole("dialog", { name: "Réglages" });
  await dialog.getByLabel("Caractères par page").fill("1000");
  await expect(bar).toContainText("3 pages");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.backend.fullScreen)).toBe(true);
  await page.reload();
  await expect(bar).toContainText("3 pages");
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.getByLabel("Caractères par page")).toHaveValue("1000");
});

test("l'affichage se règle : police, taille, largeur et apparence, gardés au relancement", async ({
  page,
}) => {
  await launch(page, { "courses.md": { content: "# Courses\npain", modified: 1 } });
  await page.getByRole("button", { name: "Réglages" }).click();
  const dialog = page.getByRole("dialog", { name: "Réglages" });
  await dialog.getByLabel("Police").selectOption({ label: "Chasse fixe" });
  await dialog.getByLabel("Taille du texte").selectOption({ label: "Très grande" });
  await dialog.getByLabel("Largeur du texte").selectOption({ label: "Étroite" });
  await dialog.getByLabel("Apparence").selectOption({ label: "Sombre" });
  const scroller = page.locator(".cm-scroller");
  const shown = () =>
    scroller.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        style.fontFamily.includes("Menlo"),
        style.fontSize,
        document.documentElement.dataset.appearance,
      ];
    });
  await expect.poll(shown).toEqual([true, "24px", "dark"]);
  await page.reload();
  await expect.poll(shown).toEqual([true, "24px", "dark"]);
});

test("Cmd+clic sur un lien ouvre la note visée, qui liste ses liens entrants", async ({ page }) => {
  await launch(page, {
    "courses.md": { content: "# Courses\npain", modified: 1 },
    "Travail/lundi.md": { content: "# Lundi\nPenser aux [[courses]]", modified: 2 },
  });
  await page.getByRole("button", { name: "Travail" }).click();
  const link = page.locator(".cm-note-link", { hasText: "courses" });
  await link.click({ modifiers: ["Meta"] });
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  const backlinks = page.getByRole("navigation", { name: "Liens entrants" });
  await expect(backlinks).toContainText("Lundi");
  await backlinks.getByRole("button", { name: /Lundi/ }).click();
  await expect(page.locator(".cm-line").first()).toContainText("Lundi");
  await expect(backlinks).toBeHidden();
});

test("un lien vers un titre absent le signale", async ({ page }) => {
  await launch(page, { "a.md": { content: "# A\nvoir [[Nulle part]]", modified: 1 } });
  await page.locator(".cm-note-link").click({ modifiers: ["Meta"] });
  await expect(page.getByRole("status")).toContainText(
    "Aucune note ne porte le titre « Nulle part ».",
  );
});

test("Cmd+O ouvre une note de n'importe quel dossier par quelques lettres de son titre", async ({
  page,
}) => {
  await launch(page, {
    "courses.md": { content: "# Courses\npain", modified: 2 },
    "Cuisine/crepes.md": { content: "# Recette de crêpes\nfarine", modified: 1 },
  });
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  await page.keyboard.press("Meta+O");
  const picker = page.getByRole("dialog", { name: "Ouvrir une note" });
  await expect(picker.getByRole("option")).toHaveCount(2);
  await page.keyboard.type("crepe");
  await expect(picker.getByRole("option")).toHaveText(["Recette de crêpesCuisine"]);
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.locator(".cm-line").first()).toHaveText("Recette de crêpes");
});

test("la palette de commandes lance une action par son nom, raccourci affiché", async ({
  page,
}) => {
  await launch(page, { "courses.md": { content: "# Courses\npain", modified: 1 } });
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  await page.keyboard.press("Meta+Shift+P");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await page.keyboard.type("machine");
  await expect(palette.getByRole("option")).toHaveText(["Mode machine à écrireCmd+Maj+T"]);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByRole("button", { name: "Machine à écrire" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("dans la note");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-search")).toBeVisible();
});
