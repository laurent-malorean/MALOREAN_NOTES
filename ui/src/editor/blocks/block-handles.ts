// Les boutons d'un bloc de texte dans la marge de l'éditeur (spécification « deplacer-un-bloc », §§ 4 et 6) :
// au survol d'un bloc, « + » (ajoute une ligne vide dessous) et la poignée ⋮⋮ (qu'on glisse pour déplacer le
// bloc). Une seule paire, posée dans la zone défilante sur la première ligne du bloc survolé : elle ne décale
// pas le texte et ne fait pas partie de la note.
import { isolateHistory } from "@codemirror/commands";
import type { EditorState, Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { addBlockBelow } from "./add-block";
import { blockAtHeight, firstLineOf, textColumn } from "./block-geometry";
import { type BlockDrag, startBlockDrag } from "./block-drag";
import { changeBetween } from "./move-block";
import { readBlocks, type TextBlock, wholeTree } from "./read-blocks";
import "./block-handles.css";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
/** Le dessin du « + » et celui de la poignée (six points), dans une grille de 24 sur 24. */
const ADD_ICON = "M12 5v14M5 12h14";
const HANDLE_ICON = "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01";

/** Ce que l'éditeur dit des boutons de bloc : ils s'effacent pendant une saisie vocale. */
export interface BlockHandlesOptions {
  readonly blocked: () => boolean;
}

/** Les blocs de la note, relus seulement quand le texte ou l'arbre syntaxique ont changé. */
let cache: { doc: unknown; tree: unknown; blocks: readonly TextBlock[] } | null = null;
function blocksOf(state: EditorState): readonly TextBlock[] {
  const tree = wholeTree(state);
  if (cache?.doc !== state.doc || cache.tree !== tree) {
    cache = { doc: state.doc, tree, blocks: readBlocks(state) };
  }
  return cache.blocks;
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const shape = document.createElementNS(SVG_NAMESPACE, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

function button(className: string, label: string, path: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(icon(path));
  // Le bouton ne prend ni le focus ni la sélection de l'éditeur.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  return element;
}

class BlockHandles {
  private readonly tools = document.createElement("div");
  /** Le bloc dont la paire de boutons est montrée, dans `blocksOf(view.state)` ; `null` : elle est cachée. */
  private shown: number | null = null;
  private drag: BlockDrag | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly options: BlockHandlesOptions,
  ) {
    this.tools.className = "cm-block-tools";
    this.tools.hidden = true;
    const add = button("cm-block-add", "Ajouter un bloc dessous", ADD_ICON);
    const handle = button("cm-block-handle", "Glisser pour déplacer", HANDLE_ICON);
    add.addEventListener("click", () => this.addBelow());
    handle.addEventListener("pointerdown", (event) => this.grab(event));
    this.tools.append(add, handle);
    view.scrollDOM.append(this.tools);
    view.scrollDOM.addEventListener("pointermove", this.hover);
    view.scrollDOM.addEventListener("pointerleave", this.leave);
  }

  /** Les boutons n'ont pas lieu d'être : note en lecture seule, ou saisie vocale en cours. */
  private away(): boolean {
    return this.view.state.readOnly || this.options.blocked();
  }

  private readonly hover = (event: PointerEvent): void => {
    if (this.drag) return;
    if (this.away()) return this.hide();
    const blocks = blocksOf(this.view.state);
    this.show(blockAtHeight(this.view, blocks, event.clientY), blocks);
  };

  private readonly leave = (): void => {
    if (!this.drag) this.hide();
  };

  private show(index: number | null, blocks: readonly TextBlock[]): void {
    if (index === null) return this.hide();
    const line = firstLineOf(this.view, blocks[index] as TextBlock);
    const { left } = textColumn(this.view);
    const height = Math.min(line.bottom - line.top, this.view.defaultLineHeight);
    this.tools.style.top = `${String(line.top)}px`;
    this.tools.style.left = `${String(left)}px`;
    this.tools.style.height = `${String(height)}px`;
    this.tools.hidden = false;
    this.shown = index;
  }

  private hide(): void {
    this.tools.hidden = true;
    this.shown = null;
  }

  private addBelow(): void {
    const { view, shown } = this;
    if (shown === null || this.away()) return;
    const text = view.state.doc.toString();
    const added = addBlockBelow(text, blocksOf(view.state), shown);
    if (added === null) return;
    view.dispatch({
      changes: changeBetween(text, added.text),
      selection: { anchor: added.cursor },
      scrollIntoView: true,
      userEvent: "add.block",
      annotations: isolateHistory.of("full"),
    });
    view.focus();
  }

  private grab(event: PointerEvent): void {
    const { shown } = this;
    if (shown === null || this.away()) return;
    event.preventDefault();
    this.tools.classList.add("cm-block-tools-active");
    this.drag = startBlockDrag(this.view, blocksOf(this.view.state), shown, event, () => {
      this.drag = null;
      this.tools.classList.remove("cm-block-tools-active");
      this.hide();
    });
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.drag?.cancel();
      this.hide();
    } else if (this.shown !== null && (this.away() || update.geometryChanged)) {
      this.show(this.away() ? null : this.shown, blocksOf(this.view.state));
    }
  }

  destroy(): void {
    this.drag?.cancel();
    this.view.scrollDOM.removeEventListener("pointermove", this.hover);
    this.view.scrollDOM.removeEventListener("pointerleave", this.leave);
    this.tools.remove();
  }
}

/** Les boutons de bloc de l'éditeur : « + » et la poignée, au survol d'un bloc de texte. */
export function blockHandles(options: BlockHandlesOptions): Extension {
  return ViewPlugin.define((view) => new BlockHandles(view, options));
}
