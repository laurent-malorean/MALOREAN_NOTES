import { EditorView, runScopeHandlers } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor } from "../editor";

/** Un éditeur où l'on tape, curseur à la fin de `content`. */
function typing(content: string) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  createEditor(parent, () => {}).show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  return view;
}

describe("écriture : passer à la ligne", () => {
  it("continue une liste à puces", async () => {
    const view = typing("- pain");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("- pain\n- ");
  });

  it("continue une liste numérotée avec le numéro suivant", async () => {
    const view = typing("1. pain");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("1. pain\n2. ");
  });

  it("continue une liste de tâches avec une case vide", async () => {
    const view = typing("- [x] pain");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("- [x] pain\n- [ ] ");
  });

  it("continue une citation", async () => {
    const view = typing("> pensée");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("> pensée\n> ");
  });

  it("termine la liste quand on valide un élément vide", async () => {
    const view = typing("- pain\n- ");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("- pain\n");
  });

  it("efface la marque d'un élément vide d'un seul retour arrière", async () => {
    const view = typing("- pain\n- ");
    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- pain\n");
  });

  it("termine aussi une liste numérotée, de tâches ou une citation", async () => {
    for (const empty of ["1. a\n2. ", "- [ ] a\n- [ ] ", "> a\n> "]) {
      const view = typing(empty);
      await userEvent.keyboard("{Enter}");
      expect(view.state.doc.toString()).toBe(`${empty.split("\n")[0]}\n`);
    }
  });

  it("efface normalement quand le curseur n'est pas au bout de l'élément vide", async () => {
    const view = typing("- pain\n- ");
    view.dispatch({ selection: { anchor: "- pain\n".length } });
    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- pain- ");
  });

  it("efface seulement la sélection dans un élément vide", async () => {
    const view = typing("- pain\n- ");
    const start = "- pain\n".length;
    view.dispatch({ selection: { anchor: start, head: start + 1 } });
    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- pain\n ");
  });

  it("passe simplement à la ligne hors d'une liste", async () => {
    const view = typing("texte");
    await userEvent.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("texte\n");
  });
});

describe("écriture : raccourcis de mise en forme", () => {
  /** Tape `keys` sur une note où `selected` est sélectionné, à la fin du texte. */
  async function press(content: string, keys: string, selected = "") {
    const view = typing(content);
    const end = view.state.doc.length;
    view.dispatch({ selection: { anchor: end - selected.length, head: end } });
    await userEvent.keyboard(keys);
    return view.state.doc.toString();
  }

  it("Cmd+B met en gras, Cmd+I en italique", async () => {
    expect(await press("un mot", "{Meta>}b{/Meta}", "mot")).toBe("un **mot**");
    expect(await press("un mot", "{Meta>}i{/Meta}", "mot")).toBe("un *mot*");
  });

  it("garde pour lui Cmd+I, que CodeMirror emploie aussi", () => {
    const view = typing("un mot");
    const press = new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      keyCode: 73,
      metaKey: true,
    });
    expect(runScopeHandlers(view, press, "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("un mot**");
    expect(view.state.selection.main.head).toBe("un mot*".length);
  });

  it("Cmd+K fait un lien", async () => {
    expect(await press("un site", "{Meta>}k{/Meta}", "site")).toBe("un [site](url)");
  });

  it("Cmd+1 à Cmd+3 font des titres", async () => {
    expect(await press("Titre", "{Meta>}1{/Meta}")).toBe("# Titre");
    expect(await press("Titre", "{Meta>}2{/Meta}")).toBe("## Titre");
    expect(await press("Titre", "{Meta>}3{/Meta}")).toBe("### Titre");
  });

  it("Cmd+Maj+8 met une puce, Cmd+Maj+7 un numéro", async () => {
    expect(await press("pain", "{Meta>}{Shift>}8{/Shift}{/Meta}")).toBe("- pain");
    expect(await press("pain", "{Meta>}{Shift>}7{/Shift}{/Meta}")).toBe("1. pain");
  });

  it("ramène à l'écran le texte mis en forme", async () => {
    const view = typing(`${"ligne\n".repeat(300)}fin`);
    (view.dom as HTMLElement).style.height = "200px";
    view.scrollDOM.scrollTop = 0;
    await userEvent.keyboard("{Meta>}b{/Meta}");
    await expect.poll(() => view.scrollDOM.scrollTop).toBeGreaterThan(0);
  });
});

describe("écriture : date du jour", () => {
  function withDate(content: string) {
    const parent = document.createElement("div");
    document.body.replaceChildren(parent);
    createEditor(parent, () => {}, { today: () => new Date(2026, 10, 16) }).show(content);
    const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
    if (!view) throw new Error("éditeur introuvable");
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    return view;
  }

  it("Cmd+Maj+D insère la date du jour en toutes lettres, curseur après", async () => {
    const view = withDate("Réunion du ");
    await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    expect(view.state.doc.toString()).toBe("Réunion du 16 novembre 2026");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("garde le raccourci pour lui", () => {
    const view = withDate("");
    const press = new KeyboardEvent("keydown", {
      key: "D",
      code: "KeyD",
      keyCode: 68,
      metaKey: true,
      shiftKey: true,
    });
    expect(runScopeHandlers(view, press, "editor")).toBe(true);
  });

  it("remplace la sélection par la date", async () => {
    const view = withDate("le jour J");
    view.dispatch({ selection: { anchor: 3, head: 9 } });
    await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    expect(view.state.doc.toString()).toBe("le 16 novembre 2026");
  });

  it("prend la vraie date sans horloge donnée", async () => {
    const view = typing("");
    await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    expect(view.state.doc.toString()).toMatch(/^(1er|\d{1,2}) \p{L}+ \d{4}$/u);
  });

  it("ramène la date insérée à l'écran", async () => {
    const view = withDate(`${"ligne\n".repeat(300)}fin`);
    (view.dom as HTMLElement).style.height = "200px";
    view.scrollDOM.scrollTop = 0;
    await userEvent.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    await expect.poll(() => view.scrollDOM.scrollTop).toBeGreaterThan(0);
  });
});

describe("écriture : titre d'une note vide", () => {
  it("ce qu'on tape dans une note vide devient son titre, curseur à la fin", async () => {
    const view = typing("");
    await userEvent.keyboard("Liste");
    expect(view.state.doc.toString()).toBe("# Liste");
    expect(view.state.selection.main.head).toBe("# Liste".length);
  });

  it("annuler retire d'un coup le titre tapé, marque comprise", async () => {
    const view = typing("");
    await userEvent.keyboard("Liste");
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(view.state.doc.toString()).toBe("");
  });

  it("taper la marque soi-même ne la double pas", async () => {
    const view = typing("");
    await userEvent.keyboard("# Liste");
    expect(view.state.doc.toString()).toBe("# Liste");
  });
});
