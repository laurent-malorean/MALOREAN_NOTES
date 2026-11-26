// Barre d'entrée d'un cahier de recherche (fiche 0097) : mesurée sur les pixels de la vraie page
// (capture WebKit), pour que le test voie ce que voit l'utilisateur et pas seulement le style calculé.
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createEditor } from "./editor";
import "../theme.css";
import "../style.css";

const NOTEBOOK =
  "---\ntype: cahier-de-recherche\n---\n# Levures\n\n" +
  "- 14:12 - Étape 22 — Citation imbriquée\n" +
  "  > citation simple\n  > > citation imbriquée\n  > retour à la citation simple\n\n" +
  "  ```js\n  const code = 1;\n  ```\n\n" +
  "  - puce\n    1. numérotée\n\n" +
  "  | a | b |\n  |---|---|\n  | 1 | 2 |\n\n" +
  "  dernière ligne\n" +
  "- 14:30 - deuxième entrée\n";

const FIRST_ENTRY = [
  "14:12",
  "citation simple",
  "citation imbriquée",
  "retour à la citation",
  "",
  "",
  "const code",
  "",
  "",
  "puce",
  "numérotée",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "dernière ligne",
];

type Pixels = { data: Uint8ClampedArray; width: number; scale: number };
type Rgb = [number, number, number];

/** Le premier élément de liste est une entrée ; ses lignes, du titre à « dernière ligne », en sont le corps. */
function entryLines(parent: HTMLElement): HTMLElement[] {
  const all = [...parent.querySelectorAll<HTMLElement>(".cm-line")];
  const start = all.findIndex((l) => l.textContent?.includes("14:12"));
  const end = all.findIndex((l) => l.textContent?.includes("14:30"));
  return all.slice(start, end);
}

async function capture(parent: HTMLElement): Promise<Pixels> {
  const shot = await page.screenshot({ element: parent, save: false, base64: true } as never);
  const base64 = typeof shot === "string" ? shot : (shot as { base64: string }).base64;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const scale = bitmap.width / parent.getBoundingClientRect().width;
  const last = parent.querySelectorAll(".cm-line")[parent.querySelectorAll(".cm-line").length - 1];
  const lastBottom = (last as HTMLElement).getBoundingClientRect().bottom;
  // La capture doit couvrir toute la page : sinon la mesure ne verrait pas la fin de l'entrée.
  if (lastBottom * scale > bitmap.height) throw new Error("capture trop courte pour la page");
  return { data, width: bitmap.width, scale };
}

/** Une couleur du thème (variable CSS) telle que la page la dessine : rouge, vert, bleu. */
function themeColor(name: string): Rgb {
  const probe = document.createElement("div");
  probe.style.background = `var(${name})`;
  document.body.append(probe);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  context.fillStyle = getComputedStyle(probe).backgroundColor;
  context.fillRect(0, 0, 1, 1);
  probe.remove();
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r as number, g as number, b as number];
}

const near = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 24;

/** Les pixels de la page sur une ligne horizontale (y en pixels de page), de gauche à droite. */
function row(pixels: Pixels, y: number): Rgb[] {
  const py = Math.round(y * pixels.scale);
  const out: Rgb[] = [];
  for (let x = 0; x < pixels.width; x++) {
    const i = (py * pixels.width + x) * 4;
    out.push([
      pixels.data[i] as number,
      pixels.data[i + 1] as number,
      pixels.data[i + 2] as number,
    ]);
  }
  return out;
}

/** Où, sur la ligne, commence la bande de la couleur (en pixels de page) et sa largeur ; null si absente. */
function band(pixels: Pixels, y: number, color: Rgb) {
  const pixelsOfRow = row(pixels, y);
  const start = pixelsOfRow.findIndex((p) => near(p, color));
  if (start < 0) return null;
  let end = start;
  while (end < pixelsOfRow.length && near(pixelsOfRow[end] as Rgb, color)) end++;
  return { x: start / pixels.scale, width: (end - start) / pixels.scale };
}

function mount() {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {}, { copyReference: () => {} });
  if (!EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement)) {
    throw new Error("éditeur introuvable");
  }
  editor.show(NOTEBOOK);
  return parent;
}

describe("barre d'entrée : continue et alignée sur toutes les lignes", () => {
  afterEach(() => {
    delete document.documentElement.dataset.appearance;
  });

  for (const appearance of ["light", "dark"]) {
    it(`même position et même couleur du titre à la dernière ligne (thème ${appearance})`, async () => {
      document.documentElement.dataset.appearance = appearance;
      const parent = mount();
      const lines = entryLines(parent);
      expect(lines.length).toBe(FIRST_ENTRY.length);
      FIRST_ENTRY.forEach((text, i) => {
        expect(lines[i]?.textContent ?? "").toContain(text);
      });
      const pixels = await capture(parent);
      const bar = themeColor("--entry-bar");
      const origin = parent.getBoundingClientRect();
      const title = lines[0] as HTMLElement;
      const reference = band(pixels, title.getBoundingClientRect().bottom - origin.top - 3, bar);
      expect(reference).not.toBeNull();
      expect(reference?.width).toBeGreaterThanOrEqual(2.5);
      expect(reference?.width).toBeLessThanOrEqual(3.5);
      lines.forEach((l, i) => {
        const rect = l.getBoundingClientRect();
        const found = band(pixels, rect.bottom - origin.top - 2, bar);
        expect(found, `ligne ${i} « ${l.textContent} » sans barre d'entrée`).not.toBeNull();
        expect(found?.x, `ligne ${i} « ${l.textContent} » : x de la barre`).toBeCloseTo(
          reference?.x ?? 0,
          0,
        );
        expect(found?.width, `ligne ${i} : largeur de la barre`).toBeCloseTo(
          reference?.width ?? 0,
          0,
        );
      });
    });
  }

  it("la barre est continue : aucun pixel d'une autre couleur du titre à la dernière ligne", async () => {
    const parent = mount();
    const lines = entryLines(parent);
    const pixels = await capture(parent);
    const bar = themeColor("--entry-bar");
    const origin = parent.getBoundingClientRect();
    const title = lines[0] as HTMLElement;
    const first = band(pixels, title.getBoundingClientRect().bottom - origin.top - 3, bar);
    const x = (first?.x ?? 0) + (first?.width ?? 0) / 2;
    const top = title.getBoundingClientRect().top - origin.top + 16;
    const bottom = (lines.at(-1) as HTMLElement).getBoundingClientRect().bottom - origin.top;
    const missing: number[] = [];
    for (let y = top; y < bottom - 1; y++) {
      const i = (Math.round(y * pixels.scale) * pixels.width + Math.round(x * pixels.scale)) * 4;
      const color: Rgb = [
        pixels.data[i] as number,
        pixels.data[i + 1] as number,
        pixels.data[i + 2] as number,
      ];
      if (!near(color, bar)) missing.push(Math.round(y));
    }
    expect(missing).toEqual([]);
  });

  it("le trait d'une citation reste visible à droite de la barre d'entrée, sans la masquer", async () => {
    const parent = mount();
    const lines = entryLines(parent);
    const pixels = await capture(parent);
    const bar = themeColor("--entry-bar");
    const border = themeColor("--border");
    const origin = parent.getBoundingClientRect();
    for (const text of ["citation simple", "citation imbriquée", "retour à la citation"]) {
      const l = lines.find((x) => x.textContent?.includes(text)) as HTMLElement;
      const y = l.getBoundingClientRect().bottom - origin.top - 2;
      const entryBar = band(pixels, y, bar);
      const quote = band(pixels, y, border);
      expect(entryBar, text).not.toBeNull();
      expect(quote, text).not.toBeNull();
      expect(quote?.x ?? 0, text).toBeGreaterThanOrEqual(
        (entryBar?.x ?? 0) + (entryBar?.width ?? 0) + 2,
      );
    }
  });

  it("le bloc de code garde son fond dans une entrée", () => {
    const parent = mount();
    const code = entryLines(parent).find((l) => l.textContent?.includes("const code"));
    const probe = document.createElement("div");
    probe.style.background = "var(--code-block-background)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    expect(getComputedStyle(code as HTMLElement).backgroundColor).toBe(expected);
  });
});
