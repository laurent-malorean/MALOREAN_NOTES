import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";
import "../../style.css";
import "../../theme.css";

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view, editor };
}

const dimmedText = (parent: HTMLElement) =>
  [...parent.querySelectorAll(".cm-focus-dimmed")].map((e) => e.textContent).join("|");

/** Les lignes de la note telles qu'on les voit : chaque texte en clair ou estompé (opacité réduite). */
function seen(parent: HTMLElement): { lit: string[]; dim: string[] } {
  const lit: string[] = [];
  const dim: string[] = [];
  for (const line of parent.querySelectorAll<HTMLElement>(".cm-line")) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let litPart = "";
    let dimPart = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (isFaded(node.parentElement, line)) dimPart += node.textContent;
      else litPart += node.textContent;
    }
    if (litPart.trim()) lit.push(tidy(litPart));
    if (dimPart.trim()) dim.push(tidy(dimPart));
  }
  return { lit, dim };
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** Un élément, ou l'un de ses parents jusqu'à la ligne, est-il rendu moins opaque ? */
function isFaded(element: HTMLElement | null, line: HTMLElement): boolean {
  for (let e = element; e && e !== line.parentElement; e = e.parentElement) {
    if (Number.parseFloat(getComputedStyle(e).opacity) < 1) return true;
  }
  return false;
}

/** Ouvre `marked` en mode focus `unit`, curseur sur le `|` ; ce qu'on voit, transition d'opacité finie. */
async function focusedAt(marked: string, unit: "sentence" | "paragraph") {
  const { parent, view, editor } = mount(marked.replace("|", ""));
  editor.setFocusMode(unit);
  view.dispatch({ selection: { anchor: marked.indexOf("|") } });
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_MS));
  return seen(parent);
}

/** Plus long que la transition d'opacité du texte estompé. */
const TRANSITION_MS = 300;

describe("mode focus, ce qu'on voit à l'écran", () => {
  it("en paragraphe, ne laisse en clair que la ligne du curseur, même sans ligne vide autour", async () => {
    expect(
      await focusedAt("Première ligne\nDeuxième ligne\nTroi|sième ligne", "paragraph"),
    ).toEqual({
      lit: ["Troisième ligne"],
      dim: ["Première ligne", "Deuxième ligne"],
    });
  });

  it("en phrase, termine la phrase au retour à la ligne, même sans point", async () => {
    expect(await focusedAt("Une ligne sans point\nLa sui|vante", "sentence")).toEqual({
      lit: ["La suivante"],
      dim: ["Une ligne sans point"],
    });
  });

  it("en phrase, ne laisse en clair que la phrase du curseur sur sa ligne", async () => {
    expect(await focusedAt("Avant\nUn. De|ux. Trois.", "sentence")).toEqual({
      lit: ["Deux."],
      dim: ["Avant", "Un. Trois."],
    });
  });

  it("fait d'un élément de liste, d'une tâche ou d'une ligne de citation un bloc à lui seul", async () => {
    const list = await focusedAt("- un\n- de|ux\n- trois", "paragraph");
    expect(list.lit.join()).toContain("deux");
    expect(list.dim.join()).toContain("un");
    expect(list.dim.join()).toContain("trois");
    const tasks = await focusedAt("- [ ] faire\n- [x] fa|it", "paragraph");
    expect(tasks.lit.join()).toContain("fait");
    expect(tasks.dim.join()).toContain("faire");
    const quote = await focusedAt("> premier vers\n> second v|ers", "paragraph");
    expect(quote.lit.join()).toContain("second vers");
    expect(quote.dim.join()).toContain("premier vers");
    expect(quote.lit.join()).not.toContain("premier");
  });

  it("ne déplace pas le texte quand on l'active ou le coupe", () => {
    const { view, editor } = mount("Un.\nDeux.\nTrois.");
    const top = () => view.coordsAtPos(view.state.doc.line(2).from)?.top;
    const before = top();
    editor.setFocusMode("paragraph");
    expect(top()).toBe(before);
    editor.setFocusMode(null);
    expect(top()).toBe(before);
  });
});

describe("mode focus", () => {
  it("n'estompe rien tant qu'il est arrêté", () => {
    const { parent } = mount("Un. Deux.");
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("estompe tout sauf la phrase du curseur", () => {
    const { parent, view, editor } = mount("Un. Deux. Trois.");
    view.dispatch({ selection: { anchor: 6 } });
    editor.setFocusMode("sentence");
    expect(dimmedText(parent)).toBe("Un. | Trois.");
  });

  it("estompe tout sauf le paragraphe du curseur", () => {
    const { parent, view, editor } = mount("Un.\n\nDeux. Trois.");
    editor.setFocusMode("paragraph");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(dimmedText(parent)).toBe("Un.");
  });

  it("suit le curseur", () => {
    const { parent, view, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(dimmedText(parent)).toBe("Un. ");
  });

  it("estompe aussi le texte tapé hors de la phrase en cours", () => {
    const { parent, view, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    view.dispatch({ changes: { from: view.state.doc.length, insert: " Trois." } });
    expect(dimmedText(parent)).toBe(" Deux. Trois.");
  });

  it("n'estompe rien quand le passage est toute la note", () => {
    const { parent, editor } = mount("Une seule phrase.");
    editor.setFocusMode("sentence");
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("s'arrête quand on le demande", () => {
    const { parent, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    editor.setFocusMode(null);
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("reste actif quand on ouvre une autre note", () => {
    const { parent, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    editor.show("Trois. Quatre.");
    expect(dimmedText(parent)).toBe(" Quatre.");
  });
});
