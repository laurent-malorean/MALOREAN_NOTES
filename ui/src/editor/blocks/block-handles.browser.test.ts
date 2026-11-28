import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "../editor";
import "../../theme.css";
import "../../style.css";

/** Un éditeur sur `content` (ou, en lecture seule, sur un cahier de recherche) ; ce qu'il signale modifié est noté. */
function mount(content: string, options: { readOnly?: boolean; height?: number } = {}) {
  const parent = document.createElement("div");
  parent.className = "editor";
  if (options.height) parent.style.height = `${String(options.height)}px`;
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (text) => changes.push(text));
  editor.show(options.readOnly ? `---\ntype: cahier-de-recherche\n---\n${content}` : content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  const doc = () => view.state.doc.toString();
  return { editor, view, changes, doc, parent };
}

type Mounted = ReturnType<typeof mount>;

afterEach(() => document.body.replaceChildren());

/** Un événement du pointeur, à `x`, `y`. */
function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    ...init,
  });
}

/** Le milieu de la ligne `number` à l'écran. */
function middleOfLine(view: EditorView, number: number) {
  const line = view.state.doc.line(number);
  const box = view.coordsAtPos(line.from) as { left: number; top: number; bottom: number };
  return { x: box.left + 5, y: (box.top + box.bottom) / 2, box };
}

/** La boîte de la ligne `number` (toute la ligne, pas seulement son texte). */
function lineBox(view: EditorView, number: number): DOMRect {
  const node = view.domAtPos(view.state.doc.line(number).from).node;
  const line = (node instanceof Element ? node : (node.parentElement as Element)).closest(
    ".cm-line",
  );
  return (line as Element).getBoundingClientRect();
}

/** Passe la souris sur la ligne `number` ; les boutons de bloc, s'il y en a, sont rendus. */
function hoverLine(view: EditorView, number: number) {
  const { x, y } = middleOfLine(view, number);
  view.contentDOM.dispatchEvent(pointer("pointermove", x, y));
}

/** La couleur du thème `name`, telle que le navigateur la calcule. */
function themeColor(name: string): string {
  const probe = document.createElement("div");
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

const toolsOf = (parent: HTMLElement) =>
  parent.querySelector<HTMLElement>(".cm-block-tools") as HTMLElement;
const addButton = (parent: HTMLElement) =>
  parent.querySelector<HTMLButtonElement>(".cm-block-add") as HTMLButtonElement;
const handleOf = (parent: HTMLElement) =>
  parent.querySelector<HTMLButtonElement>(".cm-block-handle") as HTMLButtonElement;
const shown = (parent: HTMLElement) => !toolsOf(parent).hidden;

/** Appuie sur la poignée, la glisse jusqu'à la ligne `to` (puis `dy` points plus bas) sans relâcher. */
function pullHandle(m: Mounted, to: { line: number; dy?: number }) {
  const start = handleOf(m.parent).getBoundingClientRect();
  const x = start.left + start.width / 2;
  const y = start.top + start.height / 2;
  handleOf(m.parent).dispatchEvent(pointer("pointerdown", x, y));
  const target = middleOfLine(m.view, to.line);
  document.dispatchEvent(pointer("pointermove", x, y + 10));
  document.dispatchEvent(pointer("pointermove", x, target.y + (to.dy ?? 0)));
  return { x, y: target.y + (to.dy ?? 0) };
}

const release = (at: { x: number; y: number }) =>
  document.dispatchEvent(pointer("pointerup", at.x, at.y));

describe("boutons d'un bloc : au survol", () => {
  it("n'apparaissent pas avant le survol", () => {
    const { parent } = mount("un\n\ndeux");
    expect(shown(parent)).toBe(false);
  });

  it("apparaissent à gauche du bloc survolé, alignés sur sa première ligne, sans décaler le texte", () => {
    const { view, parent } = mount("un\ndeux\n\ntrois");
    const before = view.coordsAtPos(0) as { left: number; top: number };
    const line = lineBox(view, 1);
    hoverLine(view, 2);
    expect(shown(parent)).toBe(true);
    const tools = toolsOf(parent).getBoundingClientRect();
    expect(tools.right).toBeLessThanOrEqual(before.left + 1);
    expect(tools.top).toBeCloseTo(line.top, 0);
    expect(view.coordsAtPos(0)).toMatchObject({ left: before.left, top: before.top });
    expect(parent.querySelectorAll(".cm-block-tools button")).toHaveLength(2);
  });

  it("n'ont qu'une paire de boutons, avec leurs bulles d'aide", () => {
    const { view, parent } = mount("un\n\ndeux");
    hoverLine(view, 1);
    hoverLine(view, 3);
    expect(parent.querySelectorAll(".cm-block-tools")).toHaveLength(1);
    expect(addButton(parent).title).toBe("Ajouter un bloc dessous");
    expect(handleOf(parent).title).toBe("Glisser pour déplacer");
    expect(handleOf(parent).getAttribute("aria-label")).toBe("Glisser pour déplacer");
  });

  it("suivent le bloc survolé", () => {
    const { view, parent } = mount("un\n\ndeux");
    hoverLine(view, 1);
    const first = toolsOf(parent).getBoundingClientRect().top;
    hoverLine(view, 3);
    expect(toolsOf(parent).getBoundingClientRect().top).toBeGreaterThan(first);
  });

  it("dans une liste, chaque élément a sa paire ; un élément avec sous-éléments se survole sur sa ligne", () => {
    const { view, parent } = mount("- a\n  - a1\n- b");
    hoverLine(view, 1);
    const parentTop = toolsOf(parent).getBoundingClientRect().top;
    hoverLine(view, 2);
    expect(toolsOf(parent).getBoundingClientRect().top).toBeGreaterThan(parentTop);
  });

  it("disparaissent quand la souris s'en va, ou passe entre deux blocs", () => {
    const { view, parent } = mount("un\n\ndeux");
    hoverLine(view, 1);
    expect(shown(parent)).toBe(true);
    hoverLine(view, 2);
    expect(shown(parent)).toBe(false);
    hoverLine(view, 1);
    view.scrollDOM.dispatchEvent(pointer("pointerleave", 0, 0, { bubbles: false }));
    expect(shown(parent)).toBe(false);
  });

  it("restent sur le bloc quand la souris est dans la marge, à la hauteur du bloc", () => {
    const { view, parent } = mount("un\ndeux\n\ntrois");
    const { y, box } = middleOfLine(view, 2);
    view.scrollDOM.dispatchEvent(pointer("pointermove", box.left - 40, y));
    expect(shown(parent)).toBe(true);
  });

  it("ne sont pas montrés sous la fin de la note", () => {
    const { view, parent } = mount("un", { height: 400 });
    const box = view.scrollDOM.getBoundingClientRect();
    view.scrollDOM.dispatchEvent(pointer("pointermove", box.left + 50, box.bottom - 5));
    expect(shown(parent)).toBe(false);
  });

  it("prennent les couleurs du thème, comme les autres boutons-icônes", () => {
    const { view, parent } = mount("un");
    hoverLine(view, 1);
    expect(getComputedStyle(handleOf(parent)).color).toBe(themeColor("muted"));
    handleOf(parent).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    expect(getComputedStyle(addButton(parent)).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("disparaissent quand le texte change", () => {
    const { view, parent } = mount("un\n\ndeux");
    hoverLine(view, 1);
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(shown(parent)).toBe(false);
  });

  it("se reposent quand la mise en page change", () => {
    const { view, parent } = mount("un\n\ndeux", { height: 300 });
    hoverLine(view, 1);
    parent.style.width = "300px";
    view.requestMeasure();
    expect(shown(parent)).toBe(true);
  });

  it("n'existent plus quand l'éditeur est retiré", () => {
    const { editor, parent, view } = mount("un");
    hoverLine(view, 1);
    editor.destroy();
    expect(parent.querySelector(".cm-block-tools")).toBeNull();
  });
});

describe("boutons d'un bloc : absents", () => {
  it("dans une note en lecture seule (cahier de recherche)", () => {
    const { view, parent } = mount("- une entrée\n\nsuite", { readOnly: true });
    hoverLine(view, 5);
    expect(shown(parent)).toBe(false);
  });

  it("pendant une saisie vocale", () => {
    const { view, parent, editor } = mount("un\n\ndeux");
    hoverLine(view, 1);
    expect(shown(parent)).toBe(true);
    editor.dictation.begin();
    editor.dictation.provisional("bonjour");
    expect(shown(parent)).toBe(false);
    hoverLine(view, 3);
    expect(shown(parent)).toBe(false);
    editor.dictation.end();
    hoverLine(view, 3);
    expect(shown(parent)).toBe(true);
  });
});

describe("le bouton d'insertion", () => {
  it("ajoute une ligne vide sous le bloc, y place le curseur, en une seule étape d'annulation", () => {
    const { view, parent, doc, changes } = mount("un\n\ndeux");
    hoverLine(view, 1);
    addButton(parent).click();
    expect(doc()).toBe("un\n\n\n\ndeux");
    expect(view.state.selection.main.head).toBe("un\n\n".length);
    expect(changes).toEqual(["un\n\n\n\ndeux"]);
    undo(view);
    expect(doc()).toBe("un\n\ndeux");
  });

  it("sous un élément de liste : un nouvel élément au même niveau", () => {
    const { view, parent, doc } = mount("- a\n  - a1\n- b");
    hoverLine(view, 1);
    addButton(parent).click();
    expect(doc()).toBe("- a\n  - a1\n- \n- b");
    expect(view.state.selection.main.head).toBe("- a\n  - a1\n- ".length);
  });

  it("ne fait rien sans bloc survolé ou en lecture seule", () => {
    const { parent, doc } = mount("un");
    addButton(parent).click();
    expect(doc()).toBe("un");
  });
});

describe("la poignée : glisser pour déplacer", () => {
  it("un clic sans glisser ne fait rien", () => {
    const m = mount("un\n\ndeux");
    hoverLine(m.view, 1);
    const box = handleOf(m.parent).getBoundingClientRect();
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", box.left + 2, box.top + 2));
    document.dispatchEvent(pointer("pointermove", box.left + 3, box.top + 3));
    release({ x: box.left + 3, y: box.top + 3 });
    expect(m.doc()).toBe("un\n\ndeux");
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
    expect(m.changes).toEqual([]);
  });

  it("grise le bloc et montre le repère de dépôt, de la couleur d'accent, entre les blocs", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    pullHandle(m, { line: 5, dy: -4 });
    const veil = m.parent.querySelector<HTMLElement>(".cm-block-dragged") as HTMLElement;
    const mark = m.parent.querySelector<HTMLElement>(".cm-block-drop-mark") as HTMLElement;
    expect(veil).not.toBeNull();
    expect(mark.hidden).toBe(false);
    const first = lineBox(m.view, 1);
    const veilBox = veil.getBoundingClientRect();
    expect(veilBox.top).toBeCloseTo(first.top, 0);
    expect(veilBox.bottom).toBeCloseTo(first.bottom, 0);
    const third = lineBox(m.view, 5);
    expect(mark.getBoundingClientRect().top + mark.offsetHeight / 2).toBeCloseTo(third.top, 0);
    expect(getComputedStyle(mark).backgroundColor).toBe(themeColor("accent"));
    expect(m.parent.querySelector(".cm-editor")?.classList.contains("cm-block-dragging")).toBe(
      true,
    );
  });

  it("relâché, pose le bloc devant le repère, le curseur dans le bloc déplacé, une seule étape d'annulation", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    const at = pullHandle(m, { line: 5, dy: -4 });
    release(at);
    expect(m.doc()).toBe("deux\n\nun\n\ntrois");
    expect(m.view.state.selection.main.head).toBe("deux\n\n".length);
    expect(m.changes).toEqual(["deux\n\nun\n\ntrois"]);
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
    expect(m.parent.querySelector(".cm-block-drop-mark")).toBeNull();
    undo(m.view);
    expect(m.doc()).toBe("un\n\ndeux\n\ntrois");
    expect(m.view.state.selection.main.head).toBeLessThanOrEqual("un\n\ndeux\n\ntrois".length);
  });

  it("déplace un élément de liste avec ses sous-éléments", () => {
    const m = mount("- a\n  - a1\n- b\n- c");
    hoverLine(m.view, 1);
    const at = pullHandle(m, { line: 4, dy: 30 });
    release(at);
    expect(m.doc()).toBe("- b\n- c\n- a\n  - a1");
  });

  it("vers le haut", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 5);
    const at = pullHandle(m, { line: 1, dy: -10 });
    release(at);
    expect(m.doc()).toBe("trois\n\nun\n\ndeux");
  });

  it("Échap abandonne : rien ne change, les repères disparaissent", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    const at = pullHandle(m, { line: 5, dy: -4 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
    expect(m.parent.querySelector(".cm-block-drop-mark")).toBeNull();
    release(at);
    expect(m.doc()).toBe("un\n\ndeux\n\ntrois");
    expect(m.changes).toEqual([]);
  });

  it("une autre touche n'abandonne pas", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    const at = pullHandle(m, { line: 5, dy: -4 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    release(at);
    expect(m.doc()).toBe("deux\n\nun\n\ntrois");
  });

  it("relâché sur la place d'origine : rien ne change", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 3);
    const at = pullHandle(m, { line: 3, dy: 2 });
    expect(m.parent.querySelector<HTMLElement>(".cm-block-drop-mark")?.hidden).toBe(true);
    release(at);
    expect(m.doc()).toBe("un\n\ndeux\n\ntrois");
    expect(m.changes).toEqual([]);
  });

  it("le pointeur annulé (pointercancel) abandonne", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    pullHandle(m, { line: 5, dy: -4 });
    document.dispatchEvent(pointer("pointercancel", 0, 0));
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
    expect(m.doc()).toBe("un\n\ndeux\n\ntrois");
  });

  it("un autre bouton que le premier ne glisse pas", () => {
    const m = mount("un\n\ndeux");
    hoverLine(m.view, 1);
    const box = handleOf(m.parent).getBoundingClientRect();
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", box.left, box.top, { button: 2 }));
    document.dispatchEvent(pointer("pointermove", box.left, box.top + 60));
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
  });

  it("un changement du texte pendant le glissement l'abandonne", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    const at = pullHandle(m, { line: 5, dy: -4 });
    m.view.dispatch({ changes: { from: m.doc().length, insert: "!" } });
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
    release(at);
    expect(m.doc()).toBe("un\n\ndeux\n\ntrois!");
  });

  it("n'existe pas en lecture seule ni pendant une saisie vocale", () => {
    const m = mount("un\n\ndeux");
    hoverLine(m.view, 1);
    m.editor.dictation.begin();
    const box = handleOf(m.parent).getBoundingClientRect();
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", box.left, box.top));
    document.dispatchEvent(pointer("pointermove", box.left, box.top + 80));
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
  });

  it("une poignée sans bloc survolé ne glisse pas", () => {
    const m = mount("un\n\ndeux");
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", 0, 0));
    document.dispatchEvent(pointer("pointermove", 0, 80));
    expect(m.parent.querySelector(".cm-block-dragged")).toBeNull();
  });

  it("l'éditeur retiré pendant un glissement l'abandonne", () => {
    const m = mount("un\n\ndeux\n\ntrois");
    hoverLine(m.view, 1);
    pullHandle(m, { line: 5, dy: -4 });
    m.editor.destroy();
    expect(document.querySelector(".cm-block-dragged")).toBeNull();
  });
});

describe("la poignée : défilement", () => {
  const long = Array.from({ length: 80 }, (_, i) => `paragraphe ${String(i + 1)}`).join("\n\n");

  it("la note défile toute seule quand le pointeur reste près du bas, et s'arrête au retour", async () => {
    const m = mount(long, { height: 300 });
    hoverLine(m.view, 1);
    const box = m.view.scrollDOM.getBoundingClientRect();
    const start = handleOf(m.parent).getBoundingClientRect();
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", start.left, start.top));
    document.dispatchEvent(pointer("pointermove", start.left, start.top + 10));
    document.dispatchEvent(pointer("pointermove", start.left, box.bottom - 10));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(m.view.scrollDOM.scrollTop).toBeGreaterThan(0);
    document.dispatchEvent(pointer("pointermove", start.left, box.top + 100));
    const stopped = m.view.scrollDOM.scrollTop;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(m.view.scrollDOM.scrollTop).toBe(stopped);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  it("défile vers le haut près du bord haut", async () => {
    const m = mount(long, { height: 300 });
    m.view.scrollDOM.scrollTop = 600;
    const box = m.view.scrollDOM.getBoundingClientRect();
    let paragraph = 0;
    await vi.waitFor(() => {
      const pos = m.view.posAtCoords({ x: box.left + 100, y: box.top + 150 });
      if (pos === null) throw new Error("la note n'est pas encore dessinée");
      const line = m.view.state.doc.lineAt(pos).number;
      paragraph = line % 2 === 1 ? line : line + 1;
      if (m.view.coordsAtPos(m.view.state.doc.line(paragraph).from) === null)
        throw new Error("hors écran");
    });
    hoverLine(m.view, paragraph);
    const start = handleOf(m.parent).getBoundingClientRect();
    handleOf(m.parent).dispatchEvent(pointer("pointerdown", start.left, start.top));
    document.dispatchEvent(pointer("pointermove", start.left, start.top - 10));
    const before = m.view.scrollDOM.scrollTop;
    document.dispatchEvent(pointer("pointermove", start.left, box.top + 10));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(m.view.scrollDOM.scrollTop).toBeLessThan(before);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
});
