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

test("taper dans une nouvelle note écrit son titre : la première ligne reste un titre `#`", async ({
  page,
}) => {
  await launch(page);
  await page.getByTitle("Nouvelle note").click();
  await page.keyboard.type("Liste de Noël");
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

test("glisser une note sur un dossier l'y range, et le nom pris reçoit un suffixe", async ({
  page,
}) => {
  await launch(page, {
    notes: { ...LIBRARY, "Perso/idee.md": { content: "# Idée\nautre", modified: 5 } },
    folders: ["Perso"],
  });
  await page.locator(".note-item", { hasText: "Idée" }).dragTo(folderItem(page, "Perso"));
  await expect(titles(page)).toHaveText(["Courses", "Vieille note"]);
  await folderItem(page, "Perso").click();
  await expect(titles(page)).toHaveText(["Idée", "Idée"]);
  expect(await paths(page)).toEqual([
    "Perso/idee-2.md",
    "Perso/idee.md",
    "courses.md",
    "vieille-note.md",
  ]);
});

test("la note ouverte glissée dans un dossier reste ouverte, avec ce qu'on vient de taper", async ({
  page,
}) => {
  await launch(page, { folders: ["Perso"] });
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ajouté");
  await page.locator(".note-item", { hasText: "Vieille note" }).dragTo(folderItem(page, "Perso"));
  await expect
    .poll(() => savedContent(page, "Perso/vieille-note.md"))
    .toBe("# Vieille note\ntexte ajouté");
  await expect(editorLines(page).last()).toHaveText("texte ajouté");
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);
});

test("la recherche trouve les notes de tous les dossiers et ouvre celle qu'on clique", async ({
  page,
}) => {
  await launch(page, {
    notes: {
      "courses.md": { content: "# Courses\n- pain\n- lait", modified: 3 },
      "Travail/reunion.md": { content: "# Réunion\nApporter du pain", modified: 2 },
      "idee.md": { content: "# Idée\nRien à voir", modified: 1 },
    },
  });
  const field = page.getByRole("searchbox", { name: "Rechercher" });
  await field.fill("PAIN");
  await expect(page.locator(".search-result .note-title")).toHaveText(["Courses", "Réunion"]);
  await expect(page.locator(".search-result .search-folder")).toHaveText(["Notes", "Travail"]);
  await expect(page.locator(".search-result mark").first()).toHaveText("pain");
  await page.locator(".search-result", { hasText: "Réunion" }).click();
  await expect(editorLines(page).first()).toHaveText("Réunion");
  await field.press("Escape");
  await expect(field).toHaveValue("");
  await expect(titles(page)).toHaveText(["Courses", "Idée"]);
});

test("taper vite dans la recherche ne perd aucune lettre, même si une réponse arrive en route", async ({
  page,
}) => {
  await launch(page, { notes: { "lisbonne.md": { content: "# Lisbonne\nTram 28", modified: 1 } } });
  await page.evaluate(() => (window.backend.searchDuration = 300));
  const field = page.getByRole("searchbox", { name: "Rechercher" });
  await field.focus();
  await page.keyboard.type("lis");
  await page.waitForTimeout(250);
  await page.keyboard.type("bonne", { delay: 60 });
  await expect(field).toHaveValue("lisbonne");
  await expect(page.locator(".search-result .note-title")).toHaveText(["Lisbonne"]);
  await expect(field).toHaveValue("lisbonne");
  const searches = await page.evaluate(() =>
    window.backend.calls.filter((c) => c === "search_notes"),
  );
  expect(searches).toHaveLength(2);
});

test("en dessous de trois caractères, la liste reste celle du dossier, sauf pour un nombre", async ({
  page,
}) => {
  await launch(page, {
    notes: {
      "courses.md": { content: "# Courses\n- pain", modified: 2 },
      "budget.md": { content: "# Budget\n42 euros", modified: 1 },
    },
  });
  const field = page.getByRole("searchbox", { name: "Rechercher" });
  await field.pressSequentially("pa");
  await page.waitForTimeout(400);
  await expect(titles(page)).toHaveText(["Courses", "Budget"]);
  expect(await page.evaluate(() => window.backend.calls)).not.toContain("search_notes");
  await field.fill("42");
  await expect(page.locator(".search-result .note-title")).toHaveText(["Budget"]);
});

test("une recherche sans résultat le dit", async ({ page }) => {
  await launch(page);
  await page.getByRole("searchbox", { name: "Rechercher" }).fill("introuvable");
  await expect(page.locator(".notes-list")).toHaveText("Aucune note trouvée");
});

test("épingler une note par clic droit la met en tête, sans perdre ce qu'on tape", async ({
  page,
}) => {
  await launch(page);
  await expect(titles(page)).toHaveText(["Courses", "Idée", "Vieille note"]);
  await page.locator(".note-item", { hasText: "Vieille note" }).click();
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ajouté");
  await page.locator(".note-item", { hasText: "Vieille note" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Épingler" }).click();
  await expect(titles(page)).toHaveText(["Vieille note", "Courses", "Idée"]);
  await expect(page.locator(".note-item").first().locator(".note-pin")).toBeVisible();
  await expect
    .poll(() => savedContent(page, "vieille-note.md"))
    .toBe("---\npinned: true\n---\n# Vieille note\ntexte ajouté");
  await expect(editorLines(page).first()).toHaveText("---");

  await page.locator(".note-item", { hasText: "Vieille note" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Désépingler" }).click();
  await expect(page.locator(".note-pin")).toHaveCount(0);
  // Ce qu'on a tapé l'a rendue la plus récente.
  await expect(editorLines(page).first()).toHaveText("Vieille note");
});

test("le mode focus estompe tout sauf la phrase en cours, et reste réglé au relancement", async ({
  page,
}) => {
  await launch(page, {
    notes: { "idee.md": { content: "# Idée\nUne phrase. Une autre.", modified: 1 } },
  });
  await editorLines(page).last().click();
  await page.keyboard.press("End");
  const focus = page.getByRole("button", { name: /^Focus/ });
  await focus.click();
  await expect(focus).toHaveText("Focus : phrase");
  await expect(page.locator(".cm-focus-dimmed").first()).toBeVisible();
  await expect(page.locator(".cm-focus-dimmed", { hasText: "Une autre." })).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+F");
  await expect(focus).toHaveText("Focus : paragraphe");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Focus/ })).toHaveText("Focus : paragraphe");
  await page.keyboard.press("Meta+Shift+F");
  await expect(page.getByRole("button", { name: /^Focus/ })).toHaveText("Focus");
  await expect(page.locator(".cm-focus-dimmed")).toHaveCount(0);
});

test("le plein écran s'ouvre par le bouton ou Ctrl+Cmd+F, et Échap en sort", async ({ page }) => {
  await launch(page);
  const fullScreen = () => page.evaluate(() => window.backend.fullScreen);
  await page.getByRole("button", { name: "Plein écran" }).click();
  await expect(page.getByRole("button", { name: "Quitter le plein écran" })).toBeVisible();
  await expect(editorLines(page).first()).toBeVisible();
  expect(await fullScreen()).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(fullScreen).toBe(false);
  await page.keyboard.press("Control+Meta+F");
  await expect.poll(fullScreen).toBe(true);
  await page.keyboard.press("Control+Meta+F");
  await expect.poll(fullScreen).toBe(false);
});
