import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentOrigin } from "../bridge";
import { createEditor } from "./editor";

interface Attached {
  readonly name: string;
  readonly origin: AttachmentOrigin;
}

const linkFor = (file: File) => `![](n.assets/${file.name})`;

/** Un éditeur dont les pièces jointes sont notées ; `answer` donne le lien rendu pour un fichier. */
function mount(content: string, answer: (file: File) => string | null = linkFor) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const attached: Attached[] = [];
  const opened: string[] = [];
  const editor = createEditor(parent, () => {}, {
    attachmentActions: {
      attach: (file, origin) => {
        attached.push({ name: file.name, origin });
        return Promise.resolve(answer(file));
      },
      open: (target) => opened.push(target),
    },
  });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { editor, view, attached, opened };
}

const image = (name: string) => new File(["x"], name, { type: "image/png" });

/** Ce que le Mac met dans le presse-papiers ou le glisser : des fichiers, et leur nom en texte. */
function transferOf(files: readonly File[], text = files.map((f) => f.name).join(" ")) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  if (text) transfer.setData("text/plain", text);
  return transfer;
}

/** Un évènement de la fenêtre, avec ses données collées ou glissées. */
function eventWith(
  type: string,
  property: string,
  transfer: DataTransfer | null,
  init: MouseEventInit = {},
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, property, { value: transfer });
  return event;
}

function coordsOf(view: EditorView, pos: number) {
  const coords = view.coordsAtPos(pos);
  if (!coords) throw new Error("position hors de l'écran");
  return { clientX: coords.left + 1, clientY: (coords.top + coords.bottom) / 2 };
}

const errors = vi.spyOn(console, "error");
afterEach(() => errors.mockClear());

describe("pièces jointes collées", () => {
  it("joint une image collée par son type et met son lien à la place de la sélection", async () => {
    const { view, attached } = mount("avant XX après");
    view.dispatch({ selection: { anchor: 6, head: 8 } });
    const paste = eventWith("paste", "clipboardData", transferOf([image("image.png")]));
    view.contentDOM.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(attached).toEqual([
      { name: "image.png", origin: { kind: "pasted", mediaType: "image/png" } },
    ]);
    await expect.poll(() => view.state.doc.toString()).toBe("avant ![](n.assets/image.png) après");
    expect(view.state.selection.main.head).toBe("avant ![](n.assets/image.png)".length);
  });

  it("laisse coller du texte normalement", () => {
    const { view, attached } = mount("texte");
    view.dispatch({ selection: { anchor: 5 } });
    view.contentDOM.dispatchEvent(eventWith("paste", "clipboardData", transferOf([], " collé")));
    view.contentDOM.dispatchEvent(eventWith("paste", "clipboardData", null));
    expect(attached).toEqual([]);
    expect(view.state.doc.toString()).toBe("texte collé");
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("pièces jointes glissées", () => {
  it("joint les fichiers glissés sous leur nom, à l'endroit où on les dépose", async () => {
    const { view, attached } = mount("un deux");
    const files = [image("a.png"), new File(["x"], "b.pdf", { type: "application/pdf" })];
    const drop = eventWith("drop", "dataTransfer", transferOf(files), coordsOf(view, 3));
    view.contentDOM.dispatchEvent(drop);
    // On continue d'écrire pendant que les fichiers sont copiés.
    view.dispatch({ selection: { anchor: 0 } });
    expect(drop.defaultPrevented).toBe(true);
    await expect
      .poll(() => view.state.doc.toString())
      .toBe("un ![](n.assets/a.png)\n![](n.assets/b.pdf)deux");
    expect(attached.map((a) => a.origin)).toEqual([
      { kind: "dropped", fileName: "a.png" },
      { kind: "dropped", fileName: "b.pdf" },
    ]);
    // L'éditeur ne colle pas en plus le contenu des fichiers comme du texte.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(view.state.doc.toString()).toBe("un ![](n.assets/a.png)\n![](n.assets/b.pdf)deux");
  });

  it("dépose au plus près quand on lâche hors du texte", async () => {
    const { view } = mount("un deux");
    const drop = eventWith("drop", "dataTransfer", transferOf([image("a.png")]), {
      clientX: -5000,
      clientY: -5000,
    });
    view.contentDOM.dispatchEvent(drop);
    await expect.poll(() => view.state.doc.toString()).toBe("![](n.assets/a.png)un deux");
  });

  it("accepte qu'on survole l'éditeur avec des fichiers, et seulement avec des fichiers", () => {
    const { view } = mount("texte");
    const withFiles = eventWith("dragover", "dataTransfer", transferOf([image("a.png")]));
    view.contentDOM.dispatchEvent(withFiles);
    expect(withFiles.defaultPrevented).toBe(true);
    const withText = eventWith("dragover", "dataTransfer", transferOf([], "x"));
    view.contentDOM.dispatchEvent(withText);
    expect(withText.defaultPrevented).toBe(false);
    view.contentDOM.dispatchEvent(eventWith("dragover", "dataTransfer", null));
    expect(errors).not.toHaveBeenCalled();
  });

  it("laisse glisser du texte normalement", () => {
    const { view, attached } = mount("texte");
    const at = coordsOf(view, 5);
    view.contentDOM.dispatchEvent(eventWith("drop", "dataTransfer", transferOf([], " glissé"), at));
    view.contentDOM.dispatchEvent(eventWith("drop", "dataTransfer", null, at));
    expect(attached).toEqual([]);
    expect(view.state.doc.toString()).toBe("texte glissé");
    expect(errors).not.toHaveBeenCalled();
  });

  it("n'insère que les liens des fichiers acceptés, sans rien toucher s'il n'y en a aucun", async () => {
    const { view, attached } = mount("un deux", (file) =>
      file.name.endsWith(".txt") ? null : linkFor(file),
    );
    const files = [new File(["x"], "a.txt"), image("b.png")];
    view.contentDOM.dispatchEvent(
      eventWith("drop", "dataTransfer", transferOf(files), coordsOf(view, 3)),
    );
    await expect.poll(() => view.state.doc.toString()).toBe("un ![](n.assets/b.png)deux");
    view.dispatch({ selection: { anchor: 1 } });
    const refused = [new File(["x"], "c.txt")];
    view.contentDOM.dispatchEvent(
      eventWith("drop", "dataTransfer", transferOf(refused), coordsOf(view, 3)),
    );
    await expect.poll(() => attached.length).toBe(3);
    await Promise.resolve();
    expect(view.state.doc.toString()).toBe("un ![](n.assets/b.png)deux");
    expect(view.state.selection.main.head).toBe(1);
  });

  it("n'insère pas le lien dans une autre note ouverte entre-temps", async () => {
    const { editor, view, attached } = mount("première");
    view.contentDOM.dispatchEvent(
      eventWith("drop", "dataTransfer", transferOf([image("a.png")]), coordsOf(view, 3)),
    );
    editor.show("seconde");
    await expect.poll(() => attached.length).toBe(1);
    await Promise.resolve();
    expect(view.state.doc.toString()).toBe("seconde");
  });
});

describe("ouvrir une pièce jointe", () => {
  const PDF = "[Billet.pdf](n.assets/Billet.pdf) et la suite";

  const click = (view: EditorView, at: { clientX: number; clientY: number }, metaKey: boolean) => {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, metaKey, ...at });
    view.contentDOM.dispatchEvent(event);
    return event;
  };

  it("Cmd+clic sur un lien ouvre sa cible, sans déplacer le curseur", () => {
    const { view, opened } = mount(PDF);
    view.dispatch({ selection: { anchor: PDF.length } });
    const event = click(view, coordsOf(view, 3), true);
    expect(event.defaultPrevented).toBe(true);
    expect(opened).toEqual(["n.assets/Billet.pdf"]);
    expect(view.state.selection.main.head).toBe(PDF.length);
    expect(view.hasFocus).toBe(false);
  });

  it("un Cmd+clic hors d'un lien place le curseur sans rien ouvrir", () => {
    const { view, opened } = mount(PDF);
    // L'éditeur prend la main : le curseur quitte le début de la note.
    click(view, coordsOf(view, PDF.length - 2), true);
    expect(view.state.selection.main.head).not.toBe(0);
    expect(opened).toEqual([]);
  });
});
