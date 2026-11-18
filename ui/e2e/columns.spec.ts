import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const WORKSPACE: Notes = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\n## Détail\ntexte", modified: 20 },
  "vieille-note.md": { content: "# Vieille note\ntexte", modified: 10 },
};

async function launch(page: Page, notes: Notes = WORKSPACE) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const columns = (page: Page) => page.getByRole("region", { name: "Colonne" });
const firstLine = (page: Page, index: number) =>
  columns(page).nth(index).locator(".cm-line").first();
const split = (page: Page) => page.getByTitle("Diviser la colonne").first();
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

test("diviser ouvre la même note dans une colonne à droite, où s'ouvre la note choisie ensuite", async ({
  page,
}) => {
  await launch(page);
  await expect(columns(page)).toHaveCount(1);
  await split(page).click();
  await expect(columns(page)).toHaveCount(2);
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(firstLine(page, 1)).toHaveText("Courses");
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(firstLine(page, 1)).toHaveText("Idée");
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Idée");
});

test("on écrit dans chaque colonne, chacune enregistre sa note, la liste suit la colonne active", async ({
  page,
}) => {
  await launch(page);
  await split(page).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await columns(page).nth(1).locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" à droite");
  await columns(page).nth(0).locator(".cm-line").last().click();
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  await page.keyboard.press("End");
  await page.keyboard.type(" frais");
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- pain frais");
  await expect
    .poll(() => savedContent(page, "vieille-note.md"))
    .toBe("# Vieille note\ntexte à droite");
});

test("le plan et la recherche dans la note suivent la colonne active", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "Plan" }).click();
  const outline = page.getByRole("navigation", { name: "Plan de la note" });
  await expect(outline.locator(".outline-item")).toHaveText(["Courses"]);
  await split(page).click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(outline.locator(".outline-item")).toHaveText(["Idée", "Détail"]);
  await firstLine(page, 0).click();
  await expect(outline.locator(".outline-item")).toHaveText(["Courses"]);
  await page.keyboard.press("Meta+F");
  await expect(columns(page).nth(0).locator(".cm-search")).toBeVisible();
  await expect(columns(page).nth(1).locator(".cm-search")).toHaveCount(0);
});

test("pas plus de trois colonnes", async ({ page }) => {
  await launch(page);
  await split(page).click();
  await split(page).click();
  await expect(columns(page)).toHaveCount(3);
  await expect(page.getByTitle("Diviser la colonne")).toHaveCount(3);
  for (const button of await page.getByTitle("Diviser la colonne").all()) {
    await expect(button).toBeHidden();
  }
});

test("glisser le séparateur règle la largeur des deux colonnes voisines", async ({ page }) => {
  await launch(page);
  await split(page).click();
  const widthOf = async (index: number) =>
    (await columns(page).nth(index).boundingBox())?.width ?? 0;
  const before = await widthOf(0);
  expect(Math.abs(before - (await widthOf(1)))).toBeLessThan(2);
  const divider = (await page.getByRole("separator").boundingBox()) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2 + 120, divider.y + divider.height / 2);
  await page.mouse.up();
  await expect.poll(() => widthOf(0)).toBeGreaterThan(before + 100);
  expect(await widthOf(1)).toBeLessThan(before - 100);
});

const tabs = (page: Page, index: number) => columns(page).nth(index).getByRole("tab");

test("chaque colonne montre l'onglet de sa note, à son titre, qui suit le titre tapé", async ({
  page,
}) => {
  await launch(page);
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
  await expect(tabs(page, 0).first()).toHaveAttribute("aria-selected", "true");
  await split(page).click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Idée×"]);
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
  await firstLine(page, 1).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" neuve");
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Idée neuve×"]);
});

test("fermer l'onglet de la seule colonne enregistre ce qui est tapé et la laisse vide", async ({
  page,
}) => {
  await launch(page);
  await columns(page).nth(0).locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await tabs(page, 0).first().getByRole("button", { name: "Fermer l'onglet" }).click();
  await expect(tabs(page, 0)).toHaveCount(0);
  await expect(columns(page).nth(0).locator(".cm-line")).toHaveCount(1);
  await expect(columns(page).nth(0).locator(".cm-placeholder")).toBeVisible();
  expect(await savedContent(page, "courses.md")).toBe("# Courses\n- pain bio");
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 0)).toHaveText(["Idée×"]);
});

test("ouvrir ou créer une note ajoute un onglet dans la colonne où l'on a cliqué en dernier", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×"]);
  await expect(tabs(page, 0).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×"]);
  await expect(tabs(page, 0).first()).toHaveAttribute("aria-selected", "true");
  await split(page).click();
  await firstLine(page, 0).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Vieille note×", "Idée×"]);
  await expect(tabs(page, 1)).toHaveText(["Courses×"]);
  await firstLine(page, 1).click();
  await page.getByTitle("Nouvelle note").click();
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Sans titre×"]);
  await page.keyboard.type("# Liste");
  await expect(tabs(page, 1)).toHaveText(["Courses×", "Liste×"]);
  await expect(tabs(page, 0)).toHaveCount(3);
});

test("cliquer un onglet montre sa note, ce qui était tapé étant enregistré", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await columns(page).nth(0).locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await tabs(page, 0).first().click();
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  expect(await savedContent(page, "idee.md")).toBe("# Idée\n## Détail\ntexte!");
});

test("fermer le dernier onglet d'une colonne la ferme, enregistre ce qui est tapé et rend sa largeur", async ({
  page,
}) => {
  await launch(page);
  await split(page).click();
  await columns(page).nth(1).locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" complet");
  await tabs(page, 1).first().getByRole("button", { name: "Fermer l'onglet" }).click();
  await expect(columns(page)).toHaveCount(1);
  await expect(page.getByRole("separator")).toHaveCount(0);
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- pain complet");
  const area = (await page.locator(".columns").boundingBox())?.width ?? 0;
  expect((await columns(page).first().boundingBox())?.width).toBeCloseTo(area, 0);
  await expect(firstLine(page, 0)).toHaveText("Courses");
  await expect(page.getByTitle("Diviser la colonne")).toBeVisible();
});

const menuChoice = (page: Page, label: string) =>
  page.getByRole("menuitem", { name: label, exact: true }).click();

test("le menu d'une note de la liste l'ouvre à droite ou à gauche, en créant la colonne s'il le faut", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click({ button: "right" });
  await menuChoice(page, "Ouvrir à droite");
  await expect(columns(page)).toHaveCount(2);
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
  await expect(tabs(page, 1)).toHaveText(["Idée×"]);
  await expect(firstLine(page, 1)).toHaveText("Idée");
  await page.locator(".note-item", { hasText: "Vieille note" }).click({ button: "right" });
  await menuChoice(page, "Ouvrir à gauche");
  await expect(columns(page)).toHaveCount(2);
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Vieille note×"]);
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Vieille note");
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await menuChoice(page, "Ouvrir à gauche");
  await expect(columns(page)).toHaveCount(3);
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
});

test("le menu d'un onglet ouvre sa note dans un nouvel onglet ou à côté, et le ferme", async ({
  page,
}) => {
  await launch(page);
  await tabs(page, 0).first().click({ button: "right" });
  await menuChoice(page, "Ouvrir dans un nouvel onglet");
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×"]);
  await tabs(page, 0).first().click({ button: "right" });
  await menuChoice(page, "Ouvrir à droite");
  await expect(tabs(page, 1)).toHaveText(["Courses×"]);
  await tabs(page, 1).first().click({ button: "right" });
  await menuChoice(page, "Fermer");
  await expect(columns(page)).toHaveCount(1);
  await tabs(page, 0).first().click({ button: "right" });
  await menuChoice(page, "Fermer");
  await expect(tabs(page, 0)).toHaveText(["Courses×"]);
});

test("« Fermer » dans le menu d'une note de la liste ferme son onglet dans la colonne active", async ({
  page,
}) => {
  await launch(page);
  await split(page).click();
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await firstLine(page, 0).click();
  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await menuChoice(page, "Fermer");
  await expect(columns(page)).toHaveCount(1);
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×"]);
});

test("Cmd+clic sur une note, dans la liste ou la recherche, l'ouvre dans un nouvel onglet", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Courses" }).click({ modifiers: ["Meta"] });
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×"]);
  await expect(tabs(page, 0).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("texte");
  await page.locator(".search-result", { hasText: "Idée" }).click({ modifiers: ["Meta"] });
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×", "Idée×"]);
  await expect(firstLine(page, 0)).toHaveText("Idée");
});

/** Lâche l'onglet sur la colonne, à cette part de sa largeur depuis la gauche. */
async function dropTab(page: Page, tab: number, column: number, part: number) {
  const target = columns(page).nth(column);
  const box = (await target.boundingBox()) ?? { width: 0, height: 0 };
  await tabs(page, 0)
    .nth(tab)
    .dragTo(target, { targetPosition: { x: box.width * part, y: box.height / 2 } });
}

test("glisser un onglet vers une autre colonne l'y emmène ; vers le bord, une colonne s'ouvre", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Idée×", "Vieille note×"]);
  await dropTab(page, 1, 0, 0.95);
  await expect(columns(page)).toHaveCount(2);
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Vieille note×"]);
  await expect(tabs(page, 1)).toHaveText(["Idée×"]);
  await expect(firstLine(page, 1)).toHaveText("Idée");
  await dropTab(page, 0, 1, 0.5);
  await expect(tabs(page, 0)).toHaveText(["Vieille note×"]);
  await expect(tabs(page, 1)).toHaveText(["Idée×", "Courses×"]);
  await expect(firstLine(page, 1)).toHaveText("Courses");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  await dropTab(page, 0, 1, 0.5);
  await expect(columns(page)).toHaveCount(1);
  await expect(tabs(page, 0)).toHaveText(["Idée×", "Courses×", "Vieille note×"]);
});

test("raccourcis : nouvel onglet, onglet suivant ou précédent, fermer l'onglet, diviser", async ({
  page,
}) => {
  await launch(page);
  await firstLine(page, 0).click();
  await page.keyboard.press("Meta+T");
  const picker = page.getByRole("dialog", { name: "Nouvel onglet" });
  await page.keyboard.type("courses");
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×"]);
  await page.keyboard.press("Meta+T");
  await page.keyboard.type("idee");
  await page.keyboard.press("Enter");
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×", "Idée×"]);
  await page.keyboard.press("Control+Tab");
  await expect(tabs(page, 0).first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+Shift+Tab");
  await expect(tabs(page, 0).nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Idée");
  await page.keyboard.press("Meta+W");
  await expect(tabs(page, 0)).toHaveText(["Courses×", "Courses×"]);
  await page.keyboard.press("Control+Meta+T");
  await expect(columns(page)).toHaveCount(2);
  await expect(tabs(page, 1)).toHaveText(["Courses×"]);
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("fermer l'onglet");
  await expect(
    page.getByRole("dialog", { name: "Palette de commandes" }).getByRole("option"),
  ).toHaveText(["Fermer l'ongletCmd+W"]);
  await page.keyboard.press("Enter");
  await expect(columns(page)).toHaveCount(1);
});
