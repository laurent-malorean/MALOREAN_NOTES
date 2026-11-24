// Canvas (fiche 0052, spécification § 2 et § 7) : dessiner une carte. Une carte texte montre son Markdown
// mis en forme comme dans une note ; une carte de note montre un lien (pas d'aperçu) ; une image est
// affichée ; une page web montre son adresse ; un groupe est un cadre avec son nom.
import type { CanvasCardItem } from "../bridge";
import { noteHtml } from "../rendering/note-html";
import { cardTitle } from "../state/canvas-model";
import { canvasIcon } from "./canvas-icons";
import { wikiToLinks } from "./mind-map-nodes";

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;
const HEX = /^#[0-9a-f]{6}$/i;

export interface CardPainterOptions {
  /** L'adresse chargeable d'une image du canvas (chemin depuis la racine de l'espace de travail). */
  readonly resolveImage: (path: string) => string;
  /** Ouvre la note `path` (clic sur la carte d'une note). */
  readonly openNote: (path: string, inNewTab: boolean) => void;
}

export interface CardPainter {
  /** Met `element` à jour pour montrer `card` ; ne refait rien si la carte n'a pas changé. */
  paint(element: HTMLElement, card: CanvasCardItem): void;
}

/** La couleur d'une carte ou flèche : la variable de la palette, ou l'hexadécimal du fichier ; `null` si aucune. */
export function colorOf(item: { palette: string | null; color: string | null }): string | null {
  if (item.palette !== null) return `var(--palette-${item.palette})`;
  return item.color !== null && HEX.test(item.color) ? item.color : null;
}

const GRIPS = ["lt", "t", "rt", "r", "rb", "b", "lb", "l"];
const SIDES = ["top", "right", "bottom", "left"];

/** Les poignées d'une carte : huit pour la redimensionner, quatre ronds pour y accrocher une flèche. */
function handles(): HTMLElement[] {
  const grips = GRIPS.map((edges) => {
    const grip = document.createElement("div");
    grip.className = `canvas-grip canvas-grip-${edges}`;
    grip.dataset.edges = edges;
    return grip;
  });
  const dots = SIDES.map((side) => {
    const dot = document.createElement("div");
    dot.className = `canvas-link-dot canvas-link-dot-${side}`;
    dot.dataset.side = side;
    return dot;
  });
  return [...grips, ...dots];
}

export const isImage = (file: string) => IMAGE.test(file);

class Painter implements CardPainter {
  private readonly html = new Map<string, string>();
  private readonly painted = new WeakMap<HTMLElement, CanvasCardItem>();

  constructor(private readonly options: CardPainterOptions) {}

  paint(element: HTMLElement, card: CanvasCardItem): void {
    if (this.painted.get(element) === card) return;
    this.painted.set(element, card);
    element.dataset.id = card.id;
    element.dataset.kind = card.kind;
    element.className = `canvas-card canvas-card-${card.kind}`;
    Object.assign(element.style, {
      left: `${card.x}px`,
      top: `${card.y}px`,
      width: `${card.width}px`,
      height: `${card.height}px`,
    });
    const color = colorOf(card);
    if (color === null) element.style.removeProperty("--card-color");
    else element.style.setProperty("--card-color", color);
    element.classList.toggle("colored", color !== null);
    const body = document.createElement("div");
    body.className = "canvas-card-body";
    body.append(...this.content(card));
    const far = document.createElement("div");
    far.className = "canvas-far-icon";
    far.append(canvasIcon("lines"));
    element.replaceChildren(body, far, ...handles());
  }

  private content(card: CanvasCardItem): Node[] {
    if (card.kind === "text") return [this.text(card.text ?? "")];
    if (card.kind === "file") return [this.file(card.file ?? "")];
    if (card.kind === "link") return [this.page(card.url ?? "")];
    return [this.label(card)];
  }

  private text(markdown: string): HTMLElement {
    const body = document.createElement("div");
    body.className = "canvas-text-body";
    const cached = this.html.get(markdown);
    if (cached !== undefined) body.innerHTML = cached;
    else {
      body.textContent = markdown;
      void noteHtml(wikiToLinks(markdown), { resolveImage: this.options.resolveImage }).then(
        (html) => {
          this.html.set(markdown, html);
          if (body.isConnected || body.textContent === markdown) body.innerHTML = html;
        },
      );
    }
    return body;
  }

  private file(file: string): HTMLElement {
    if (isImage(file)) {
      const image = document.createElement("img");
      image.className = "canvas-card-image";
      image.alt = cardTitle({ kind: "file", file } as CanvasCardItem);
      image.draggable = false;
      image.src = this.options.resolveImage(file);
      return image;
    }
    const link = document.createElement("a");
    link.className = "canvas-card-note";
    link.href = `#note-${encodeURIComponent(file)}`;
    link.dataset.file = file;
    link.textContent = cardTitle({ kind: "file", file } as CanvasCardItem);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      this.options.openNote(file, event.metaKey);
    });
    return link;
  }

  private page(url: string): HTMLElement {
    const link = document.createElement("a");
    link.className = "canvas-card-page";
    link.href = url;
    link.textContent = url;
    return link;
  }

  private label(card: CanvasCardItem): HTMLElement {
    const label = document.createElement("div");
    label.className = "canvas-group-label";
    label.textContent = card.label ?? "";
    label.hidden = card.label === null || card.label === "";
    return label;
  }
}

export function createCardPainter(options: CardPainterOptions): CardPainter {
  return new Painter(options);
}
