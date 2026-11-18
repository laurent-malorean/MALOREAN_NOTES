import { expect, type Page, test } from "@playwright/test";

const WORKSPACE = {
  "banane.md": { content: "# Banane\npain", modified: 40 },
  "cerise.md": { content: "# cerise\npain", modified: 30 },
  "avion.md": { content: "# avion\npain", modified: 20 },
  "agenda.md": { content: "---\npinned: true\n---\n# Zut\npain", modified: 5 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({ notes: JSON.stringify(WORKSPACE), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(titles(page)).toHaveText(["Zut", "Banane", "cerise", "avion"]);
}

const titles = (page: Page) => page.locator(".notes-list .note-title");
const sortChoice = (page: Page) => page.getByRole("combobox", { name: "Trier la liste" });

test("le tri par titre, choisi au-dessus de la liste, ignore les majuscules, garde les épinglées en tête et revient au relancement", async ({
  page,
}) => {
  await launch(page);
  await expect(sortChoice(page)).toHaveValue("modified");

  await sortChoice(page).selectOption("title");
  await expect(titles(page)).toHaveText(["Zut", "avion", "Banane", "cerise"]);

  await page.locator(".search-field").fill("pain");
  await expect(page.locator(".search-result .note-title")).toHaveText([
    "Zut",
    "avion",
    "Banane",
    "cerise",
  ]);

  await page.reload();
  await expect(sortChoice(page)).toHaveValue("title");
  await expect(titles(page)).toHaveText(["Zut", "avion", "Banane", "cerise"]);

  await sortChoice(page).selectOption("modified");
  await expect(titles(page)).toHaveText(["Zut", "Banane", "cerise", "avion"]);
});

test("la palette de commandes choisit aussi le tri", async ({ page }) => {
  await launch(page);
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("trier");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Trier la liste" })).toBeVisible();
  await page.keyboard.type("titre");
  await page.keyboard.press("Enter");
  await expect(titles(page)).toHaveText(["Zut", "avion", "Banane", "cerise"]);
  await expect(sortChoice(page)).toHaveValue("title");
});
