import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "./editor";
import "../theme.css";
import "../style.css";

const LONG = Array.from({ length: 300 }, (_, i) => `ligne ${i}`).join("\n");

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  parent.style.height = "300px";
  parent.style.display = "flex";
  parent.style.flexDirection = "column";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { editor, view };
}

/** Attend que l'écran ait fini de défiler et de se mesurer. */
const settled = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));

afterEach(() => document.body.replaceChildren());

describe("position dans une note", () => {
  it("se retrouve après avoir montré une autre note : même sélection, même défilement", async () => {
    const { editor, view } = mount(LONG);
    view.scrollDOM.scrollTop = 1234;
    await settled();
    view.dispatch({ selection: { anchor: 2000, head: 2010 } });
    const scrolled = view.scrollDOM.scrollTop;
    const position = editor.position();
    expect(position.anchor).toBe(2000);
    expect(position.head).toBe(2010);
    expect(position.top).toBeGreaterThan(0);
    editor.show("# Autre\ncourte");
    editor.show(LONG);
    expect(view.scrollDOM.scrollTop).toBe(0);
    editor.restore(position);
    await settled();
    expect(Math.abs(view.scrollDOM.scrollTop - scrolled)).toBeLessThanOrEqual(1);
    expect(view.state.selection.main.anchor).toBe(2000);
    expect(view.state.selection.main.head).toBe(2010);
  });

  it("en haut de la note, revient en haut", async () => {
    const { editor, view } = mount(LONG);
    await settled();
    const position = editor.position();
    expect(position).toMatchObject({ anchor: 0, head: 0, top: 0 });
    expect(position.offset).toBeLessThan(0);
    view.scrollDOM.scrollTop = 500;
    await settled();
    editor.restore(position);
    await settled();
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  it("dans une note qui a raccourci entre-temps, s'arrête à sa fin", async () => {
    const { editor, view } = mount(LONG);
    view.scrollDOM.scrollTop = 2000;
    await settled();
    view.dispatch({ selection: { anchor: 2500 } });
    const position = editor.position();
    editor.show("court");
    editor.restore(position);
    await settled();
    expect(view.state.selection.main.head).toBe(5);
    expect(view.state.selection.main.anchor).toBe(5);
  });

  it("peut aller au terme cherché : il est sélectionné et montré au milieu de l'écran", async () => {
    const lines = LONG.split("\n");
    lines[150] = "le beagle est un chien";
    const { editor, view } = mount(lines.join("\n"));
    expect(editor.reveal("BEAGLE")).toBe(true);
    await settled();
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("beagle");
    const area = view.scrollDOM.getBoundingClientRect();
    const middle = ((view.coordsAtPos(from)?.top ?? 0) - area.top) / area.height;
    expect(middle).toBeGreaterThan(0.25);
    expect(middle).toBeLessThan(0.75);
    expect(editor.reveal("zèbre")).toBe(false);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(
      "beagle",
    );
  });
});
