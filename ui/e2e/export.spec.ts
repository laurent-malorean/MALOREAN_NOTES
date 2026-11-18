import { expect, type Page, test } from "@playwright/test";

const VOYAGE = "---\ntags: [loin]\n---\n# Voyage\nUn *beau* départ.\n![Vue](voyage.assets/vue.png)";
const WORKSPACE = {
  "voyage.md": { content: VOYAGE, modified: 20 },
  "courses.md": { content: "# Courses\n- [x] pain", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").nth(3)).toHaveText("Voyage");
}

const picker = (page: Page) => page.getByRole("dialog", { name: "Exporter" });
const exported = (page: Page) => page.evaluate(() => window.backend.exported);
const saveDialogs = (page: Page) => page.evaluate(() => window.backend.saveDialogs);

async function chooseFormat(page: Page, format: "PDF" | "Markdown") {
  await expect(picker(page).getByRole("option")).toHaveText(["PDF", "Markdown"]);
  await picker(page).getByRole("option", { name: format }).click();
}

test("Cmd+E exporte en Markdown la note de la colonne active, ce qui est tapé compris", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Fin.");
  await page.keyboard.press("Meta+E");
  await chooseFormat(page, "Markdown");
  await expect
    .poll(() => exported(page))
    .toEqual({ "/Users/moi/Documents/Voyage.md": `${VOYAGE} Fin.` });
  expect(await saveDialogs(page)).toEqual([{ name: "Voyage.md", folder: null }]);
});

test("le menu d'une note de la liste l'exporte en PDF, mise en forme, dans le dossier du dernier export", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Voyage" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Exporter…", exact: true }).click();
  await chooseFormat(page, "PDF");
  await expect
    .poll(() => exported(page))
    .toEqual({
      "/Users/moi/Documents/Voyage.pdf":
        "<h1>Voyage</h1><p>Un <em>beau</em> départ.\n" +
        '<img src="asset://localhost/%2FUsers%2Fmoi%2FNotes%2Fvoyage.assets%2Fvue.png" alt="Vue"></p>',
    });
  await expect(page.locator(".print-sheet")).toBeHidden();

  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Exporter…", exact: true }).click();
  await chooseFormat(page, "PDF");
  await expect.poll(async () => Object.keys(await exported(page))).toHaveLength(2);
  expect((await exported(page))["/Users/moi/Documents/Courses.pdf"]).toBe(
    '<h1>Courses</h1><ul><li><input type="checkbox" disabled="" checked=""> pain</li></ul>',
  );
  expect(await saveDialogs(page)).toEqual([
    { name: "Voyage.pdf", folder: null },
    { name: "Courses.pdf", folder: "/Users/moi/Documents" },
  ]);
});

test("la palette propose l'export, et annuler la fenêtre d'enregistrement n'exporte rien", async ({
  page,
}) => {
  await launch(page);
  await page.evaluate(() => (window.backend.nextExport = null));
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("export");
  await page.keyboard.press("Enter");
  await chooseFormat(page, "Markdown");
  await expect.poll(() => saveDialogs(page)).toHaveLength(1);
  expect(await exported(page)).toEqual({});
});
