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
  it("montrent le texte du lien en couleur, crochets et titre caché en discret", () => {
    const { parent } = mount("Voir [[Courses]] et [[Agenda|le planning]]\n\n[[Plus bas]]");
    expect(texts(parent, ".cm-note-link")).toEqual(["Courses", "le planning", "Plus bas"]);
    // L'aperçu en direct cache déjà une partie des crochets, et peut découper les marques.
    const marks = texts(parent, ".cm-note-link-mark").join("");
    expect(marks.replace(/[[\]]/g, "")).toBe("Agenda|");
    expect(marks.length).toBeGreaterThan("Agenda|".length);
  });

  it("prennent leurs couleurs dans le thème", () => {
    document.documentElement.style.setProperty("--accent", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--marker", "rgb(4, 5, 6)");
    const { parent } = mount("[[Courses]]");
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

  it("un clic simple, ou un Cmd+clic hors d'un lien, n'ouvre rien et laisse l'éditeur faire", () => {
    const { view, opened } = mount("Voir [[Courses]] ici\nautre ligne [[Agenda]]");
    for (const [pos, metaKey] of [
      [9, false],
      [18, true],
      [24, true],
    ] as const) {
      view.contentDOM.blur();
      click(view, pos, metaKey);
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
