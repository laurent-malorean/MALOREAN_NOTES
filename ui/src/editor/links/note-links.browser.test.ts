import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "../editor";
import "../../theme.css";
import "../../style.css";

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const opened: string[] = [];
  createEditor(parent, () => {}, { openLink: (title) => opened.push(title) }).show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view, opened };
}

function coordsOf(view: EditorView, pos: number) {
  const coords = view.coordsAtPos(pos);
  if (!coords) throw new Error("position hors de l'écran");
  return { clientX: coords.left + 1, clientY: (coords.top + coords.bottom) / 2 };
}

function click(view: EditorView, pos: number, metaKey: boolean) {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    metaKey,
    ...coordsOf(view, pos),
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const texts = (parent: HTMLElement, selector: string) =>
  [...parent.querySelectorAll(selector)].map((e) => e.textContent);

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
});

describe("liens entre notes dans l'éditeur", () => {
  it("montrent le texte du lien en couleur, sans crochets ni titre caché quand le curseur est ailleurs", () => {
    const { parent } = mount("Voir [[Courses]] et [[Agenda|le planning]]\n\n[[Plus bas]]");
    expect(texts(parent, ".cm-note-link")).toEqual(["Courses", "le planning", "Plus bas"]);
    expect(texts(parent, ".cm-note-link-mark")).toEqual([]);
    expect(texts(parent, ".cm-line")).toEqual(["Voir Courses et le planning", "", "Plus bas"]);
  });

  it("montrent leurs marques, en discret, quand le curseur touche le lien, et seulement celui-là", () => {
    const text = "Voir [[Courses]] et [[Agenda|le planning]]";
    const { parent, view } = mount(text);
    view.focus();
    for (const [anchor, shown] of [
      [10, "Voir [[Courses]] et le planning"],
      [5, "Voir [[Courses]] et le planning"],
      [16, "Voir [[Courses]] et le planning"],
      [17, "Voir Courses et le planning"],
      [20, "Voir Courses et [[Agenda|le planning]]"],
      [text.length, "Voir Courses et [[Agenda|le planning]]"],
    ] as const) {
      view.dispatch({ selection: { anchor } });
      expect(texts(parent, ".cm-line"), `${anchor}`).toEqual([shown]);
    }
    expect(texts(parent, ".cm-note-link-mark")).toEqual(["[[Agenda|", "]]"]);
  });

  it("montrent les marques des liens que touche une sélection, de part et d'autre", () => {
    const { parent, view } = mount("[[A]] x [[B]] y [[C]]");
    view.focus();
    view.dispatch({ selection: { anchor: 2, head: 9 } });
    expect(texts(parent, ".cm-line")).toEqual(["[[A]] x [[B]] y C"]);
    view.dispatch({ selection: { anchor: 9, head: 2 } });
    expect(texts(parent, ".cm-line")).toEqual(["[[A]] x [[B]] y C"]);
  });

  it("cachent de nouveau leurs marques quand l'éditeur perd le focus", async () => {
    const { parent, view } = mount("[[Courses]]");
    view.focus();
    view.dispatch({ selection: { anchor: 3 } });
    expect(texts(parent, ".cm-line")).toEqual(["[[Courses]]"]);
    view.contentDOM.blur();
    await expect.poll(() => texts(parent, ".cm-line")).toEqual(["Courses"]);
  });

  it("ne coupent jamais un lien en fin de ligne, marques visibles ou non", () => {
    const words = "mot ".repeat(12);
    const { parent, view } = mount(`${words}[[Un titre assez long]] fin`);
    (parent.querySelector(".cm-content") as HTMLElement).style.width = "14rem";
    const at = words.length;
    const linkTops = () => {
      const start = view.domAtPos(at);
      const end = view.domAtPos(view.state.doc.length - 4);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top));
    };
    expect(linkTops().size).toBe(1);
    view.focus();
    view.dispatch({ selection: { anchor: at + 3 } });
    expect(linkTops().size).toBe(1);
  });

  it("prennent leurs couleurs dans le thème", () => {
    document.documentElement.style.setProperty("--accent", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--marker", "rgb(4, 5, 6)");
    const { parent, view } = mount("[[Courses]]");
    view.focus();
    view.dispatch({ selection: { anchor: 3 } });
    const link = parent.querySelector(".cm-note-link") as HTMLElement;
    const mark = parent.querySelector(".cm-note-link-mark") as HTMLElement;
    expect([getComputedStyle(link).color, getComputedStyle(mark).color]).toEqual([
      "rgb(1, 2, 3)",
      "rgb(4, 5, 6)",
    ]);
  });

  it("suivent la frappe", () => {
    const { parent, view } = mount("Voir ");
    view.dispatch({ changes: { from: 5, insert: "[[Agenda]]" } });
    expect(texts(parent, ".cm-note-link")).toEqual(["Agenda"]);
  });

  it("Cmd+clic ouvre la note visée, sans déplacer le curseur", () => {
    const text = "Voir [[Courses|la liste]] ici";
    const { view, opened } = mount(text);
    view.dispatch({ selection: { anchor: text.length } });
    const event = click(view, 17, true);
    expect(event.defaultPrevented).toBe(true);
    expect(opened).toEqual(["Courses"]);
    expect(view.state.selection.main.head).toBe(text.length);
    expect(view.hasFocus).toBe(false);
  });

  it("un Cmd+clic hors d'un lien n'ouvre rien et laisse l'éditeur faire", () => {
    const { view, opened } = mount("Voir [[Courses]] ici\nautre ligne [[Agenda]]");
    for (const pos of [18, 24]) {
      view.contentDOM.blur();
      click(view, pos, true);
      expect(view.hasFocus, `${pos}`).toBe(true);
    }
    expect(opened).toEqual([]);
  });

  it("restent mis en forme plus bas dans une longue note, une fois qu'on y descend", async () => {
    const lines = Array.from({ length: 400 }, (_, i) => `ligne ${i}`);
    const { parent, view } = mount([...lines, "fin [[Agenda]]"].join("\n"));
    (view.dom as HTMLElement).style.height = "200px";
    view.requestMeasure();
    expect(texts(parent, ".cm-note-link")).toEqual([]);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    await expect.poll(() => texts(parent, ".cm-note-link")).toEqual(["Agenda"]);
  });

  it("Cmd+clic sur un lien d'une autre ligne vise le bon titre", () => {
    const { view, opened } = mount("première\nvoir [[Agenda]]");
    click(view, 18, true);
    expect(opened).toEqual(["Agenda"]);
  });
});
