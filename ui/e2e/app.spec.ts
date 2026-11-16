import { expect, type Page, test } from "@playwright/test";

type Notes = Record<string, { content: string; modified: number }>;

const LIBRARY: Notes = {
  "courses.md": { content: "# Courses\n- [ ] pain\n- lait", modified: 30 },
  "idee.md": { content: "# Idée\nUne **bonne** idée.", modified: 20 },
  "vieille-note.md": { content: "# Vieille note\ntexte", modified: 10 },
};

async function launch(
  page: Page,
  options: { notes?: Notes; folders?: string[]; remembered?: boolean } = {},
) {
  const params = new URLSearchParams({
    notes: JSON.stringify(options.notes ?? LIBRARY),
    folders: JSON.stringify(options.folders ?? []),
    remembered: options.remembered === false ? "0" : "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
}

const titles = (page: Page) => page.locator(".note-title");
const editorLines = (page: Page) => page.locator(".cm-line");
const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);
const paths = (page: Page) => page.evaluate(() => Object.keys(window.backend.notes).sort());

test("au premier lancement, l'accueil propose de choisir un dossier", async ({ page }) => {
  await launch(page, { remembered: false });
  await expect(page.getByText("Choisir un dossier de notes")).toBeVisible();
  await page.getByRole("button", { name: "Choisir un dossier de notes" }).click();
  await expect(page.locator(".library-name")).toHaveText("Notes");
  await expect(titles(page)).toHaveText(["Courses", "Idée", "Vieille note"]);
});

test("la dernière bibliothèque est rouverte et la note la plus récente est ouverte", async ({
  page,
}) => {
  await launch(page);
  await expect(titles(page)).toHaveText(["Courses", "Idée", "Vieille note"]);
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Courses");
  await expect(editorLines(page).first()).toHaveText("Courses");
});

test("cliquer une note l'ouvre, mise en forme et sans syntaxe", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await expect(editorLines(page)).toHaveText(["Idée", "Une bonne idée."]);
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Idée");
});

test("ce qu'on tape est enregistré automatiquement", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ajouté");
  await expect
    .poll(() => savedContent(page, "vieille-note.md"))
    .toBe("# Vieille note\ntexte ajouté");
});

test("changer le titre renomme le fichier et la note reste sélectionnée", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await editorLines(page).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" relue");
  await expect.poll(() => paths(page)).toEqual(["courses.md", "idee.md", "vieille-note-relue.md"]);
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Vieille note relue");
  await page.keyboard.type(" encore");
  await expect
    .poll(() => savedContent(page, "vieille-note-relue-encore.md"))
    .toContain("# Vieille note relue encore");
});

test("une nouvelle note s'ouvre vide et prend le nom de son titre", async ({ page }) => {
  await launch(page);
  await page.getByTitle("Nouvelle note").click();
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Sans titre");
  await page.keyboard.type("# Liste de Noël");
  await expect.poll(() => savedContent(page, "liste-de-noel.md")).toBe("# Liste de Noël");
  await expect(page.locator(".note-item.selected .note-title")).toHaveText("Liste de Noël");
});

test("changer de note enregistre tout de suite ce qui ne l'était pas", async ({ page }) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.locator(".note-item", { hasText: "Idée" }).click();
  expect(await savedContent(page, "vieille-note.md")).toBe("# Vieille note\ntexte!");
});

test("cocher une case enregistre la tâche cochée", async ({ page }) => {
  await launch(page);
  await page.locator("input.cm-lp-checkbox").dispatchEvent("mousedown");
  await expect.poll(() => savedContent(page, "courses.md")).toBe("# Courses\n- [x] pain\n- lait");
});

test("un échec d'enregistrement est affiché, puis rattrapé", async ({ page }) => {
  await launch(page);
  await page.evaluate(() => (window.backend.failNextSave = true));
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await expect(page.getByRole("status")).toHaveText("stockage indisponible : disque plein");
  await page.keyboard.type("!");
  await expect
    .poll(() => savedContent(page, "courses.md"))
    .toBe("# Courses\n- [ ] pain\n- lait bio!");
});

test("une bibliothèque vide s'ouvre sans erreur", async ({ page }) => {
  await launch(page, { notes: {} });
  await expect(page.locator(".library-name")).toHaveText("Notes");
  await expect(titles(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("");
});

test("une image de la note s'affiche à la place de sa syntaxe", async ({ page }) => {
  await launch(page, {
    notes: { "voyage.md": { content: "# Voyage\n![La mer](voyage.assets/mer.png)", modified: 1 } },
  });
  const image = page.locator(".cm-editor img.cm-lp-image");
  await expect(image).toHaveAttribute(
    "src",
    "asset://localhost/%2FUsers%2Fmoi%2FNotes%2Fvoyage.assets%2Fmer.png",
  );
  await expect(image).toHaveAttribute("alt", "La mer");
});

const folderItem = (page: Page, name: string) => page.locator(".folder-item", { hasText: name });

test("on range ses notes dans des dossiers : créer, renommer, déplacer", async ({ page }) => {
  await launch(page, {
    notes: {
      "idee.md": { content: "# Idée", modified: 2 },
      "Travail/reunion.md": { content: "# Réunion", modified: 1 },
    },
    folders: ["Travail"],
  });
  await expect(page.locator(".folder-item")).toHaveText(["Notes", "Travail"]);
  await expect(titles(page)).toHaveText(["Idée"]);

  await folderItem(page, "Travail").click();
  await expect(titles(page)).toHaveText(["Réunion"]);
  await expect(editorLines(page).first()).toHaveText("Réunion");

  await page.getByTitle("Nouveau dossier").click();
  await page.keyboard.type("Projets");
  await page.keyboard.press("Enter");
  await expect(page.locator(".folder-item")).toHaveText(["Notes", "Travail", "Projets"]);
  await expect(page.locator(".folder-item.selected")).toHaveText("Projets");
  await expect(titles(page)).toHaveCount(0);

  await page.getByTitle("Nouvelle note").click();
  await expect.poll(() => paths(page)).toContain("Travail/Projets/sans-titre.md");

  await folderItem(page, "Projets").dblclick();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("Chantiers");
  await page.keyboard.press("Enter");
  await expect.poll(() => paths(page)).toContain("Travail/Chantiers/sans-titre.md");
  await expect(page.locator(".folder-item.selected")).toHaveText("Chantiers");

  await folderItem(page, "Chantiers").dragTo(folderItem(page, "Notes"));
  await expect.poll(() => paths(page)).toContain("Chantiers/sans-titre.md");
  await expect(page.locator(".folder-item")).toHaveText(["Notes", "Chantiers", "Travail"]);
});

test("une image d'une note rangée dans un dossier est cherchée à côté d'elle", async ({ page }) => {
  await launch(page, {
    notes: {
      "Voyages/lisbonne.md": {
        content: "# Lisbonne\n![vue](lisbonne.assets/vue.png)",
        modified: 1,
      },
    },
    folders: ["Voyages"],
  });
  await folderItem(page, "Voyages").click();
  await expect(page.locator(".cm-editor img.cm-lp-image")).toHaveAttribute(
    "src",
    "asset://localhost/%2FUsers%2Fmoi%2FNotes%2FVoyages%2Flisbonne.assets%2Fvue.png",
  );
});
