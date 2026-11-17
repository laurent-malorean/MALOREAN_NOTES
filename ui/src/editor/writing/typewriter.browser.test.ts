import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";
import "../../style.css";

/** Un éditeur de 300 px de haut, sur une longue note. */
function mount() {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(Array.from({ length: 200 }, (_, i) => `ligne ${i}`).join("\n"));
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  (view.dom as HTMLElement).style.height = "300px";
  view.requestMeasure();
  return { editor, view };
}

/** Écart entre le milieu de la ligne du curseur et le milieu de l'éditeur, en pixels. */
function offCentre(view: EditorView): number {
  return offCentreAt(view, view.state.selection.main.head);
}

/** Écart, signé, entre le milieu de la ligne de `pos` et le milieu de l'éditeur. */
function offCentreAt(view: EditorView, pos: number): number {
  const cursor = view.coordsAtPos(pos);
  const frame = view.scrollDOM.getBoundingClientRect();
  if (!cursor) return Number.POSITIVE_INFINITY;
  return Math.abs((cursor.top + cursor.bottom) / 2 - (frame.top + frame.bottom) / 2);
}

/** La première ligne, sans rien faire défiler, est-elle juste au milieu ? */
const firstLineOffCentre = (view: EditorView) => {
  view.scrollDOM.scrollTop = 0;
  return offCentreAt(view, 0);
};

describe("mode machine à écrire", () => {
  it("garde la ligne du curseur au milieu de l'écran quand on se déplace", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    view.dispatch({ selection: { anchor: view.state.doc.line(100).from } });
    await expect.poll(() => offCentre(view)).toBeLessThan(20);
  });

  it("garde la ligne au milieu quand on tape", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    const at = view.state.doc.line(120).to;
    view.dispatch({ changes: { from: at, insert: "!" }, selection: { anchor: at + 1 } });
    await expect.poll(() => offCentre(view)).toBeLessThan(20);
  });

  it("amène aussi la première ligne au milieu, grâce à la marge du haut", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    view.dispatch({ selection: { anchor: view.state.doc.line(100).from } });
    view.dispatch({ selection: { anchor: 0 } });
    await expect.poll(() => offCentre(view)).toBeLessThan(20);
  });

  it("met juste assez de marge pour que la première ligne soit au milieu", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    await expect.poll(() => firstLineOffCentre(view)).toBeLessThan(3);
  });

  it("ajuste la marge quand la fenêtre change de taille", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    await expect.poll(() => firstLineOffCentre(view)).toBeLessThan(3);
    (view.dom as HTMLElement).style.height = "500px";
    await expect.poll(() => firstLineOffCentre(view)).toBeLessThan(3);
  });

  it("laisse l'affichage où il est quand rien ne bouge dans le texte", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    view.dispatch({ selection: { anchor: view.state.doc.line(100).from } });
    await expect.poll(() => offCentre(view)).toBeLessThan(20);
    view.scrollDOM.scrollTop = 0;
    editor.setFocusMode("sentence");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  it("ne déplace plus l'affichage une fois arrêté", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    await expect.poll(() => view.contentDOM.style.paddingTop).not.toBe("");
    editor.setTypewriter("off");
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(view.scrollDOM.scrollTop).toBe(0);
    expect(view.contentDOM.style.paddingTop).toBe("");
    expect(view.contentDOM.style.paddingBottom).toBe("");
  });

  it("n'est pas en marche tant qu'on ne l'a pas demandé", async () => {
    const { view } = mount();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(view.contentDOM.style.paddingTop).toBe("");
  });

  it("arrêté aussitôt après sa mise en marche, ne laisse aucune marge", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    editor.setTypewriter("off");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(view.contentDOM.style.paddingTop).toBe("");
  });

  it("reste en marche quand on ouvre une autre note", async () => {
    const { editor, view } = mount();
    editor.setTypewriter("on");
    editor.show(Array.from({ length: 200 }, (_, i) => `autre ${i}`).join("\n"));
    const shown = EditorView.findFromDOM(view.dom) as EditorView;
    shown.dispatch({ selection: { anchor: shown.state.doc.line(100).from } });
    await expect.poll(() => offCentre(shown)).toBeLessThan(20);
  });
});
