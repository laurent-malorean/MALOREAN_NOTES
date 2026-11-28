import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

type Notes = Record<string, { content: string; modified: number }>;

async function launch(page: Page, notes: Notes) {
  const params = new URLSearchParams({ notes: JSON.stringify(notes), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, notes);
}

const savedContent = (page: Page, path: string) =>
  page.evaluate((name) => window.backend.notes[name]?.content ?? null, path);

/** La ligne de la note qui a exactement ce texte. */
const line = (page: Page, text: string): Locator =>
  page.locator(".cm-line", { hasText: new RegExp(`^${text}$`) });

/** La ligne numéro `n` de la note (à partir de 0), liste comprise : la marque d'un élément est cachée à l'écran. */
const nth = (page: Page, n: number): Locator => page.locator(".cm-line").nth(n);

/** Glisse la poignée du bloc de la ligne `from` jusqu'au bord haut (`above`) ou bas de la ligne `to`, sans relâcher. */
async function dragHandle(page: Page, from: Locator, to: Locator, side: "above" | "below") {
  await from.hover();
  const handle = page.getByRole("button", { name: "Glisser pour déplacer" });
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  const target = await to.boundingBox();
  if (!box || !target) throw new Error("élément absent de l'écran");
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height / 2 + 12, { steps: 3 });
  const y = side === "above" ? target.y + 2 : target.y + target.height - 2;
  await page.mouse.move(x, y, { steps: 8 });
  return { x, y };
}

test("glisser la poignée d'un paragraphe le déplace, une seule annulation le remet", async ({
  page,
}) => {
  await launch(page, { "titre.md": { content: "# Titre\n\nun\n\ndeux\n\ntrois", modified: 1 } });
  await expect(page.locator(".cm-block-tools")).toBeHidden();
  const at = await dragHandle(page, line(page, "un"), line(page, "trois"), "above");
  await expect(page.locator(".cm-block-dragged")).toBeVisible();
  await expect(page.locator(".cm-block-drop-mark")).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => savedContent(page, "titre.md")).toBe("# Titre\n\ndeux\n\nun\n\ntrois");
  expect(at.y).toBeGreaterThan(0);
  await page.keyboard.press("Meta+Z");
  await expect.poll(() => savedContent(page, "titre.md")).toBe("# Titre\n\nun\n\ndeux\n\ntrois");
  await page.keyboard.press("Meta+Shift+Z");
  await expect.poll(() => savedContent(page, "titre.md")).toBe("# Titre\n\ndeux\n\nun\n\ntrois");
});

test("un élément de liste se déplace avec ses sous-éléments", async ({ page }) => {
  await launch(page, {
    "liste.md": { content: "# Liste\n\n- a\n  - a1\n- b\n- c", modified: 1 },
  });
  await dragHandle(page, nth(page, 2), nth(page, 5), "below");
  await page.mouse.up();
  await expect.poll(() => savedContent(page, "liste.md")).toBe("# Liste\n\n- b\n- c\n- a\n  - a1");
  await page.keyboard.press("Meta+Z");
  await expect.poll(() => savedContent(page, "liste.md")).toBe("# Liste\n\n- a\n  - a1\n- b\n- c");
});

test("Échap pendant le glissement abandonne : rien ne change", async ({ page }) => {
  await launch(page, { "titre.md": { content: "# Titre\n\nun\n\ndeux", modified: 1 } });
  await dragHandle(page, line(page, "un"), line(page, "deux"), "below");
  await expect(page.locator(".cm-block-drop-mark")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-block-dragged")).toHaveCount(0);
  await page.mouse.up();
  expect(await savedContent(page, "titre.md")).toBe("# Titre\n\nun\n\ndeux");
});

test("« + » ajoute une ligne vide sous le bloc et y place le curseur", async ({ page }) => {
  await launch(page, { "titre.md": { content: "# Titre\n\nun\n\ndeux", modified: 1 } });
  await line(page, "un").hover();
  await page.getByRole("button", { name: "Ajouter un bloc dessous" }).click();
  await page.keyboard.type("nouveau");
  await expect.poll(() => savedContent(page, "titre.md")).toBe("# Titre\n\nun\n\nnouveau\n\ndeux");
});
