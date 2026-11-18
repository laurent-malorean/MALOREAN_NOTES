import { expect, type Page, test } from "@playwright/test";

const WORKSPACE = { "voyage.md": { content: "# Voyage\nfin", modified: 10 } };

async function launch(page: Page) {
  const params = new URLSearchParams({
    notes: JSON.stringify(WORKSPACE),
    folders: "[]",
    remembered: "1",
  });
  await page.goto(`/e2e/app.html?${params.toString()}`);
  await expect(page.locator(".cm-line").first()).toHaveText("Voyage");
}

const saved = (page: Page) => page.evaluate(() => window.backend.notes["voyage.md"]?.content);
const attachments = (page: Page) =>
  page.evaluate(() => Object.keys(window.backend.attachments).sort());

/** Colle ou dépose dans l'éditeur un fichier du nom et du type donnés, comme le ferait le Mac. */
async function give(page: Page, how: "paste" | "drop", name: string, type: string) {
  await page.locator(".cm-content").evaluate(
    (content, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["0123"], file.name, { type: file.type }));
      // Déposé à la fin de la dernière ligne.
      const end = [...content.querySelectorAll(".cm-line")].at(-1)?.getBoundingClientRect();
      const event = new MouseEvent(file.how, {
        bubbles: true,
        cancelable: true,
        clientX: (end?.right ?? 0) - 1,
        clientY: ((end?.top ?? 0) + (end?.bottom ?? 0)) / 2,
      });
      const property = file.how === "paste" ? "clipboardData" : "dataTransfer";
      Object.defineProperty(event, property, { value: transfer });
      content.dispatchEvent(event);
    },
    { how, name, type },
  );
}

test("une capture d'écran collée devient une pièce jointe de la note et s'affiche", async ({
  page,
}) => {
  await launch(page);
  await page.locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await give(page, "paste", "image.png", "image/png");
  await expect
    .poll(() => saved(page))
    .toBe("# Voyage\nfin\n![](voyage.assets/image-2026-11-16-1830.png)");
  expect(await attachments(page)).toEqual(["voyage.assets/image-2026-11-16-1830.png"]);
  await page.locator(".cm-line").first().click();
  await expect(page.locator("img.cm-lp-image")).toHaveAttribute(
    "src",
    "asset://localhost/%2FUsers%2Fmoi%2FNotes%2Fvoyage.assets%2Fimage-2026-11-16-1830.png",
  );
});

test("un PDF glissé devient une pièce jointe, et Cmd+clic l'ouvre", async ({ page }) => {
  await launch(page);
  await give(page, "drop", "Billet avion.pdf", "application/pdf");
  await expect
    .poll(() => saved(page))
    .toBe("# Voyage\nfin[Billet avion.pdf](voyage.assets/Billet%20avion.pdf)");
  await page.locator(".cm-line").first().click();
  await page.getByText("Billet avion.pdf").click({ modifiers: ["Meta"] });
  await expect
    .poll(() => page.evaluate(() => window.backend.opened))
    .toEqual(["voyage.assets/Billet%20avion.pdf"]);
});

test("un fichier qui n'est ni une image ni un PDF est refusé, avec un message", async ({
  page,
}) => {
  await launch(page);
  await give(page, "drop", "notes.txt", "text/plain");
  await expect(page.locator(".status")).toContainText("ne peut pas être joint");
  expect(await saved(page)).toBe("# Voyage\nfin");
  expect(await attachments(page)).toEqual([]);
});
