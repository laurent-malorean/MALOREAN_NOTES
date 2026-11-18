import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";
import type { ImageResolver } from "./plugin";

function mount(content: string, resolveImage?: ImageResolver) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {}, { resolveImage });
  editor.show(content);
  const frame = parent.querySelector(".cm-editor") as HTMLElement;
  frame.style.height = "300px";
  const view = EditorView.findFromDOM(frame);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view };
}

const lineText = (parent: HTMLElement, index: number) =>
  (parent.querySelectorAll(".cm-line")[index] as HTMLElement | undefined)?.innerText;

const lastLine = (parent: HTMLElement) =>
  ([...parent.querySelectorAll(".cm-line")].at(-1) as HTMLElement | undefined)?.innerText;

describe("aperçu en direct : mise à jour de l'affichage", () => {
  it("dessine une case cochée pour une tâche faite et vide pour une tâche à faire", () => {
    const { parent } = mount("- [x] fait\n- [ ] à faire");
    const boxes = [...parent.querySelectorAll<HTMLInputElement>("input.cm-lp-checkbox")];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
  });

  it("met en forme chaque ligne d'une citation", () => {
    const { parent } = mount("> une\n> deux\n\ntexte");
    expect(parent.querySelectorAll(".cm-line.cm-lp-quote")).toHaveLength(2);
  });

  it("met en forme chaque ligne de l'en-tête YAML", () => {
    const { parent } = mount("---\na: 1\n---\n# T");
    expect(parent.querySelectorAll(".cm-line.cm-lp-front-matter")).toHaveLength(3);
  });

  it("cache la syntaxe tapée hors de l'éditeur", () => {
    const { parent, view } = mount("titre");
    view.dispatch({ changes: { from: 0, insert: "# " } });
    expect(lineText(parent, 0)).toBe("titre");
  });

  it("montre la syntaxe de la ligne où l'on déplace le curseur, et seulement elle", () => {
    const { parent, view } = mount("# Un\n# Deux");
    view.focus();
    view.dispatch({ selection: { anchor: 1 } });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect([lineText(parent, 0), lineText(parent, 1)]).toEqual(["Un", "# Deux"]);
  });

  it("cache de nouveau toute la syntaxe quand on quitte l'éditeur", () => {
    const { parent, view } = mount("# Un");
    view.focus();
    view.contentDOM.blur();
    expect(lineText(parent, 0)).toBe("Un");
  });

  it("met en forme les lignes qui apparaissent quand on fait défiler", async () => {
    const { parent, view } = mount(
      Array.from({ length: 400 }, (_, i) => `# Titre ${i}`).join("\n"),
    );
    view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
    await expect.poll(() => lastLine(parent)).toBe("Titre 399");
  });

  it("met en forme une très longue note une fois son analyse terminée", async () => {
    const { parent, view } = mount(
      Array.from({ length: 60_000 }, (_, i) => `# Titre ${i}`).join("\n"),
    );
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    await expect.poll(() => lastLine(parent), { timeout: 5000 }).toBe("Titre 59999");
  });
});

describe("aperçu en direct : éléments dessinés", () => {
  it("dessine une puce ronde", () => {
    const { parent } = mount("- un");
    expect(parent.querySelector(".cm-lp-bullet")?.textContent).toBe("•");
  });

  it("dessine une vraie case à cocher", () => {
    const { parent } = mount("- [ ] tâche");
    expect(parent.querySelector<HTMLInputElement>(".cm-lp-checkbox")?.type).toBe("checkbox");
  });

  it("garde le curseur en place quand on coche une case", () => {
    const { parent } = mount("- [ ] tâche");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    parent.querySelector(".cm-lp-checkbox")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("aperçu en direct : images", () => {
  const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  it("affiche l'image à l'adresse donnée par le traducteur, avec son texte de remplacement", () => {
    const { parent } = mount("![un chat](chat.png)", (src) => `asset://espace/${src}`);
    const image = parent.querySelector<HTMLImageElement>("img.cm-lp-image");
    expect(image?.getAttribute("src")).toBe("asset://espace/chat.png");
    expect(image?.alt).toBe("un chat");
    expect(image?.title).toBe("un chat");
  });

  it("charge l'adresse écrite telle quelle sans traducteur", () => {
    const { parent } = mount(`![](${PIXEL})`);
    expect(parent.querySelector("img.cm-lp-image")?.getAttribute("src")).toBe(PIXEL);
  });

  it("ne recharge pas l'image quand on tape ailleurs", () => {
    const { parent, view } = mount("![x](a.png)\ntexte");
    const before = parent.querySelector("img.cm-lp-image");
    view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });
    expect(parent.querySelector("img.cm-lp-image")).toBe(before);
  });

  it("remplace l'image quand son adresse change", () => {
    const { parent, view } = mount("![x](a.png)\ntexte");
    view.dispatch({ changes: { from: 5, to: 6, insert: "b" } });
    expect(parent.querySelector("img.cm-lp-image")?.getAttribute("src")).toBe("b.png");
  });

  it("remplace l'image quand son texte de remplacement change", () => {
    const { parent, view } = mount("![x](a.png)\ntexte");
    view.dispatch({ changes: { from: 2, to: 3, insert: "y" } });
    expect(parent.querySelector<HTMLImageElement>("img.cm-lp-image")?.alt).toBe("y");
  });
});
