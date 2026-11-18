import { expect, type Page, test } from "@playwright/test";

const WORKSPACE = {
  "courses.md": { content: "# Courses\n- pain", modified: 30 },
  "idee.md": { content: "# Idée\nUne idée.", modified: 20 },
  "Travail/lundi.md": { content: "# Lundi\nréunion", modified: 10 },
};

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: JSON.stringify(["Travail"]),
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
}

const titles = (page: Page) => page.locator(".notes-list .note-title");
const recentEntry = (page: Page) => page.getByRole("button", { name: "Récentes" });
const confirmation = (page: Page) => page.getByRole("dialog", { name: "Confirmation" });

test("Récentes montre les notes ouvertes, la plus récente d'abord, même après un relancement ; Cmd+O les propose d'abord", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await page.locator(".folder-item", { hasText: "Travail" }).click();
  await expect(page.locator(".cm-line").first()).toHaveText("Lundi");

  await recentEntry(page).click();
  await expect(page.locator(".list-heading")).toHaveText("Récentes");
  await expect(titles(page)).toHaveText(["Lundi", "Idée", "Courses"]);
  await page.locator(".note-item", { hasText: "Courses" }).click();
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");

  await page.reload();
  await expect(page.locator(".cm-line").first()).toHaveText("Courses");
  await recentEntry(page).click();
  await expect(titles(page)).toHaveText(["Courses", "Lundi", "Idée"]);

  await page.keyboard.press("Meta+O");
  const picker = page.getByRole("dialog", { name: "Ouvrir une note" });
  await expect(picker.getByRole("option")).toHaveText(["Courses", "LundiTravail", "Idée"]);
});

test("une note renommée reste dans les notes récentes ; une note mise à la corbeille en sort", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".note-item", { hasText: "Idée" }).click();
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await expect(page.locator(".note-item", { hasText: "Idée bio" })).toBeVisible();

  await recentEntry(page).click();
  await expect(titles(page)).toHaveText(["Idée bio", "Courses"]);

  await page.locator(".note-item", { hasText: "Courses" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Placer dans la corbeille" }).click();
  await confirmation(page).getByRole("button", { name: "Placer dans la corbeille" }).click();
  await expect(titles(page)).toHaveText(["Idée bio"]);
  await page.locator(".folder-item").first().click();
  await recentEntry(page).click();
  await expect(titles(page)).toHaveText(["Idée bio"]);
});
