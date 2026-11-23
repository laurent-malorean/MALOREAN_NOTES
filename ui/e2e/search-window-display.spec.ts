// Affichage de la fenêtre de recherche dans les conditions réelles : thème sombre, des centaines de
// résultats, réponses lentes. Elle doit avoir un fond, une hauteur, être au premier plan et défiler.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { waitForLaunchedNote } from "./journey";

async function rectOf(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error("élément absent de l'écran");
  return rect;
}

const COUNT = 400;
const NOTES = { "premiere.md": { content: "# Première\n\nrien", modified: COUNT + 1 } };

async function launch(page: Page) {
  const params = new URLSearchParams({ notes: JSON.stringify(NOTES), remembered: "1" });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await waitForLaunchedNote(page, NOTES);
  await page.evaluate(() => (document.documentElement.dataset.appearance = "dark"));
}

test("la fenêtre de recherche est opaque, haute, au premier plan et défile, en sombre avec des centaines de résultats", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await launch(page);
  await page.evaluate((count) => {
    // Les centaines de notes sont ajoutées au faux Rust : l'adresse de la page serait trop longue.
    for (let i = 0; i < count; i += 1)
      window.backend.notes[`richesse-${i}.md`] = {
        content: `# Richesse numéro ${i}\n\nLa richesse des nations, passage ${i}.`,
        modified: i + 1,
      };
    window.backend.searchDuration = 400;
  }, COUNT);
  const field = page.getByRole("searchbox", { name: "Rechercher" });
  await field.fill("richesse");

  const win = page.locator(".search-window");
  await expect(win).toBeVisible();
  // Pendant le chargement déjà : une vraie fenêtre, pas un filet.
  // Sa hauteur ne dépend pas du contenu (le moteur du Mac l'écrasait à zéro) : la même avant et après les résultats.
  const during = await rectOf(win);
  expect(during.height).toBeGreaterThan(900 * 0.6);
  await expect(page.locator(".match-results")).toContainText("Recherche…");

  await expect(page.locator(".match-results .search-result").first()).toBeVisible();
  const box = await rectOf(win);
  expect(box.height).toBeGreaterThan(900 * 0.6);
  expect(Math.round(box.height)).toBe(Math.round(during.height));
  const fieldBox = await rectOf(field);
  expect(box.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);

  const style = await win.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopWidth, z: s.zIndex };
  });
  expect(style.bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.bg).not.toBe("transparent");
  expect(style.border).toBe("1px");

  // Au premier plan : les points de la fenêtre (y compris au niveau des onglets) sont à elle.
  for (const [fx, fy] of [
    [0.25, 0.1],
    [0.75, 0.1],
    [0.5, 0.5],
    [0.25, 0.9],
  ]) {
    const inside = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".search-window") !== null,
      { x: box.x + box.width * (fx ?? 0), y: box.y + box.height * (fy ?? 0) },
    );
    expect(inside).toBe(true);
  }

  // Les colonnes défilent et ne débordent pas de la fenêtre.
  const column = page.locator(".match-results");
  const cb = await rectOf(column);
  expect(cb.y + cb.height).toBeLessThanOrEqual(box.y + box.height + 1);
  const scrolls = await column.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
  await page.screenshot({
    path: "/private/tmp/claude-503/-Users-mobilitywork-MALOREAN-NOTES/9f9a4769-9277-473c-b5ed-e7b1748e6e81/scratchpad/recherche-corrigee-sombre.png",
  });
});
