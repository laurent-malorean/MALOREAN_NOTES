import { undo } from "@codemirror/commands";
import { ChangeSet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor, type Editor } from "../editor";
import "../../theme.css";
import "../../style.css";

/** Un éditeur sur `content`, le curseur en `at` ; ce qu'il signale comme modifié est noté. */
function mount(content: string, at = content.length, readOnlyHeader = false) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (text) => changes.push(text));
  editor.show(readOnlyHeader ? `---\ntype: cahier-de-recherche\n---\n${content}` : content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.dispatch({ selection: { anchor: at } });
  const doc = () => view.state.doc.toString();
  const grey = () => parent.querySelector<HTMLElement>(".cm-voice-provisional");
  return { editor, view, changes, doc, grey, parent };
}

/** Laisse passer la tâche qui fixe le texte provisoire quand l'utilisateur tape. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function dictate(editor: Editor) {
  editor.dictation.begin();
  return editor.dictation;
}

describe("saisie vocale dans l'éditeur : le texte provisoire", () => {
  it("s'affiche en grisé à la suite du curseur, sans entrer dans la note ni la signaler modifiée", () => {
    const { editor, view, doc, grey, changes } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout le");
    expect(grey()?.textContent).toBe(" tout le");
    expect(getComputedStyle(grey() as HTMLElement).color).not.toBe(
      getComputedStyle(view.contentDOM).color,
    );
    expect(doc()).toBe("Bonjour");
    expect(changes).toEqual([]);
    expect(editor.content()).toBe("Bonjour");
  });

  it("est remplacé en entier par le suivant, et s'efface s'il est vide", () => {
    const { editor, grey, parent } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout");
    voice.provisional("tout le monde");
    expect(parent.querySelectorAll(".cm-voice-provisional")).toHaveLength(1);
    expect(grey()?.textContent).toBe(" tout le monde");
    voice.provisional("");
    expect(grey()).toBeNull();
  });

  it("n'est montré que pendant l'écoute", () => {
    const { editor, grey } = mount("Bonjour");
    editor.dictation.provisional("tout");
    expect(grey()).toBeNull();
    expect(editor.dictation.listening()).toBe(false);
  });

  it("l'éditeur garde le focus et le curseur reste avant le texte provisoire", () => {
    const { editor, view } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout le monde");
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(7);
  });
});

describe("saisie vocale dans l'éditeur : le texte fixé", () => {
  it("s'écrit au curseur comme une frappe, signalé, et le curseur passe à sa suite", () => {
    const { editor, view, doc, changes, grey } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout le monde");
    voice.fixed("tout le monde.");
    expect(doc()).toBe("Bonjour tout le monde.");
    expect(changes).toEqual(["Bonjour tout le monde."]);
    expect(view.state.selection.main.head).toBe(22);
    expect(grey()).toBeNull();
  });

  it("sépare deux phrases fixées par un blanc, sans blanc de trop au début d'une ligne ni après un blanc", () => {
    const first = mount("");
    dictate(first.editor).fixed("Première phrase.");
    first.editor.dictation.fixed("Seconde phrase.");
    expect(first.doc()).toBe("Première phrase. Seconde phrase.");
    const afterSpace = mount("Salut ");
    dictate(afterSpace.editor).fixed("tout le monde");
    expect(afterSpace.doc()).toBe("Salut tout le monde");
    const lineStart = mount("Titre\n");
    dictate(lineStart.editor).fixed("Début.");
    expect(lineStart.doc()).toBe("Titre\nDébut.");
  });

  it("remplace la sélection, comme une frappe", () => {
    const { editor, view, doc } = mount("un X ici", 3);
    view.dispatch({ selection: { anchor: 3, head: 4 } });
    dictate(editor).fixed("mot");
    expect(doc()).toBe("un mot ici");
  });

  it("ne fait rien d'un texte fixé vide, sauf effacer le décor", () => {
    const { editor, doc, grey, changes } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout");
    voice.fixed("");
    expect(doc()).toBe("Bonjour");
    expect(grey()).toBeNull();
    expect(changes).toEqual([]);
  });
});

describe("saisie vocale dans l'éditeur : l'annulation", () => {
  it("une écoute entière est une seule étape, même avec du temps entre les phrases", () => {
    const { editor, view, doc } = mount("Bonjour");
    const voice = dictate(editor);
    voice.fixed("Un.");
    voice.provisional("deux");
    voice.fixed("Deux.");
    voice.fixed("Trois.");
    voice.end();
    expect(doc()).toBe("Bonjour Un. Deux. Trois.");
    undo(view);
    expect(doc()).toBe("Bonjour");
  });

  it("ne mêle pas l'écoute à la frappe qui la précède ni à celle qui la suit", () => {
    const { editor, view, doc } = mount("");
    view.dispatch({
      changes: { from: 0, insert: "avant" },
      selection: { anchor: 5 },
      userEvent: "input.type",
    });
    const voice = dictate(editor);
    voice.fixed("dicté");
    voice.end();
    view.dispatch({
      changes: { from: 11, insert: "!" },
      selection: { anchor: 12 },
      userEvent: "input.type",
    });
    expect(doc()).toBe("avant dicté!");
    undo(view);
    expect(doc()).toBe("avant dicté");
    undo(view);
    expect(doc()).toBe("avant");
  });

  it("le texte provisoire n'entre pas dans l'historique : annuler après lui ne change rien", () => {
    const { editor, view, doc } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout");
    undo(view);
    expect(doc()).toBe("Bonjour");
  });
});

describe("saisie vocale dans l'éditeur : l'utilisateur tape ou déplace le curseur", () => {
  it("fixe le texte provisoire tel quel quand il tape, et continue après", async () => {
    const { editor, view, doc, grey } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout le");
    view.dispatch({
      changes: { from: 7, insert: "," },
      selection: { anchor: 8 },
      userEvent: "input.type",
    });
    await settled();
    expect(doc()).toBe("Bonjour, tout le");
    expect(grey()).toBeNull();
    expect(view.state.selection.main.head).toBe(doc().length);
    // Le moteur répète le début de sa phrase : seule la suite est écrite.
    voice.provisional("tout le monde");
    expect(grey()?.textContent).toBe(" monde");
    voice.fixed("tout le monde.");
    expect(doc()).toBe("Bonjour, tout le monde.");
  });

  it("fixe le texte provisoire à sa place quand il déplace le curseur, et écoute à la nouvelle place", async () => {
    const { editor, view, doc } = mount("Un\nDeux", 2);
    const voice = dictate(editor);
    voice.provisional("alors");
    view.dispatch({ selection: { anchor: 7 }, userEvent: "select.pointer" });
    await settled();
    expect(doc()).toBe("Un alors\nDeux");
    expect(view.state.selection.main.head).toBe(doc().length);
    voice.fixed("fin");
    expect(doc()).toBe("Un alors\nDeux fin");
  });

  it("un texte que le moteur a corrigé (qui n'est plus la suite) s'écrit en entier", async () => {
    const { editor, view, doc } = mount("");
    const voice = dictate(editor);
    voice.provisional("bon jour");
    view.dispatch({ selection: { anchor: 0 }, userEvent: "select.pointer" });
    await settled();
    voice.fixed("Bonjour");
    expect(doc()).toBe("bon jour Bonjour");
  });

  it("ne réagit pas à ce qui est tapé dans une autre colonne sur la même note : le décor suit", async () => {
    const { editor, view, grey, doc } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout");
    editor.follow(ChangeSet.of({ from: 0, insert: "Hé " }, 7), "Hé Bonjour");
    await settled();
    expect(doc()).toBe("Hé Bonjour");
    expect(grey()?.textContent).toBe(" tout");
    expect(view.state.selection.main.head).toBe(10);
  });
});

describe("saisie vocale dans l'éditeur : la fin", () => {
  it("fixe le texte provisoire tel quel, efface le décor et arrête l'écoute", () => {
    const { editor, doc, grey } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout le monde");
    voice.end();
    expect(doc()).toBe("Bonjour tout le monde");
    expect(grey()).toBeNull();
    expect(editor.dictation.listening()).toBe(false);
    editor.dictation.fixed("trop tard");
    expect(doc()).toBe("Bonjour tout le monde");
  });

  it("l'abandon n'écrit rien", () => {
    const { editor, doc, grey } = mount("Bonjour");
    const voice = dictate(editor);
    voice.provisional("tout");
    voice.drop();
    expect(editor.dictation.listening()).toBe(false);
    voice.fixed("rien");
    expect(doc()).toBe("Bonjour");
    expect(grey()).not.toBeNull();
  });

  it("afficher une autre note abandonne l'écoute et efface le décor", () => {
    const { editor, grey } = mount("Bonjour");
    dictate(editor).provisional("tout");
    editor.show("Autre note");
    expect(editor.dictation.listening()).toBe(false);
    expect(grey()).toBeNull();
  });

  it("ne peut s'écrire que si le texte n'est pas en lecture seule", () => {
    expect(mount("Bonjour").editor.writable()).toBe(true);
    expect(mount("- entrée", 0, true).editor.writable()).toBe(false);
  });
});
