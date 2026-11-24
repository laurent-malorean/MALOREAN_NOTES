// Canvas (fiche 0052, spécification § 12) : une image qui ne peut pas être lue fait échouer l'export, avec un message clair.
import { afterEach, describe, expect, it } from "vitest";
import type { CanvasItem } from "../bridge";
import { canvasImage } from "./canvas-image";

const card = {
  ...{ id: "c3c3c3c3c3c3c3c3", kind: "file", text: null, file: "Photos/chat.png", subpath: null },
  ...{ url: null, label: null, background: null, backgroundStyle: null, color: null },
  ...{ palette: null, extra: [], x: 0, y: 0, width: 240, height: 160 },
} as const;
const canvas: CanvasItem = { cards: [card], arrows: [], extra: [] };

/** Un écran de canvas dont la carte image pointe vers `src`. */
function screenWith(src: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `<div class="canvas-surface"><div class="canvas-world"><div class="canvas-card" data-id="${card.id}"><img alt="chat.png"></div></div></div>`;
  root.querySelector("img")?.setAttribute("src", src);
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("canvasImage", () => {
  it("refuse d'exporter quand une image ne peut pas être lue, en nommant le fichier", async () => {
    const root = screenWith("http://127.0.0.1:1/introuvable.png");
    await expect(canvasImage(canvas, root)).rejects.toThrow(
      "L'image « Photos/chat.png » n'a pas pu être lue : l'export est annulé.",
    );
  });

  it("exporte quand toutes les images se lisent", async () => {
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const png = await canvasImage(canvas, screenWith(pixel));
    expect(png?.length).toBeGreaterThan(8);
  });
});
