import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { makeLink, setHeading, toggleEmphasis, toggleList } from "./formatting";

/** `‹` et `›` bornent la sélection ; `|` est le curseur. */
function stateOf(marked: string): EditorState {
  const cursor = marked.indexOf("|");
  const doc = marked.replace(/[‹›|]/g, "");
  const selection =
    cursor >= 0
      ? EditorSelection.single(cursor)
      : EditorSelection.single(marked.indexOf("‹"), marked.indexOf("›") - 1);
  return EditorState.create({ doc, selection });
}

function marked(state: EditorState): string {
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();
  if (from === to) return `${doc.slice(0, from)}|${doc.slice(from)}`;
  return `${doc.slice(0, from)}‹${doc.slice(from, to)}›${doc.slice(to)}`;
}

const after = (text: string, transform: (state: EditorState) => TransactionSpec) => {
  const state = stateOf(text);
  return marked(state.update(transform(state)).state);
};

describe("gras et italique", () => {
  const bold = (s: EditorState) => toggleEmphasis(s, 2);
  const italic = (s: EditorState) => toggleEmphasis(s, 1);

  it("entoure la sélection, qui reste sélectionnée", () => {
    expect(after("un ‹mot› ici", bold)).toBe("un **‹mot›** ici");
    expect(after("un ‹mot› ici", italic)).toBe("un *‹mot›* ici");
  });

  it("retire la mise en forme déjà présente", () => {
    expect(after("un **‹mot›** ici", bold)).toBe("un ‹mot› ici");
    expect(after("un *‹mot›* ici", italic)).toBe("un ‹mot› ici");
  });

  it("distingue le gras de l'italique, et les deux ensemble", () => {
    expect(after("**‹mot›**", italic)).toBe("***‹mot›***");
    expect(after("*‹mot›*", bold)).toBe("***‹mot›***");
    expect(after("***‹mot›***", italic)).toBe("**‹mot›**");
    expect(after("***‹mot›***", bold)).toBe("*‹mot›*");
  });

  it("sans sélection, insère la paire et place le curseur au milieu", () => {
    expect(after("un |", bold)).toBe("un **|**");
    expect(after("un |", italic)).toBe("un *|*");
  });

  it("une seconde fois sans rien taper, retire la paire", () => {
    expect(after("un **|**", bold)).toBe("un |");
  });

  it("ne voit pas d'étoile d'un seul côté", () => {
    expect(after("*‹mot›", italic)).toBe("**‹mot›*");
  });
});

describe("lien", () => {
  it("fait de la sélection le texte du lien, l'adresse à taper sélectionnée", () => {
    expect(after("voir ‹le site› ici", makeLink)).toBe("voir [le site](‹url›) ici");
  });

  it("sans sélection, place le curseur entre les crochets", () => {
    expect(after("voir |", makeLink)).toBe("voir [|](url)");
  });
});

describe("titres", () => {
  it("fait de la ligne un titre du niveau demandé", () => {
    expect(after("Mon |titre", (s) => setHeading(s, 2))).toBe("## Mon |titre");
  });

  it("change le niveau d'un titre existant", () => {
    expect(after("# Mon |titre", (s) => setHeading(s, 3))).toBe("### Mon |titre");
  });

  it("retire le titre quand on redemande le même niveau", () => {
    expect(after("## Mon |titre", (s) => setHeading(s, 2))).toBe("Mon |titre");
  });

  it("ne voit un titre qu'en début de ligne", () => {
    expect(after("C# |code", (s) => setHeading(s, 1))).toBe("# C# |code");
  });

  it("met au même niveau des lignes mélangées", () => {
    expect(after("‹# un\ndeux›", (s) => setHeading(s, 1))).toBe("‹# un\n# deux›");
  });

  it("s'applique à chaque ligne sélectionnée", () => {
    expect(after("‹un\ndeux›", (s) => setHeading(s, 1))).toBe("# ‹un\n# deux›");
  });

  it("sur une ligne vide, laisse le curseur après les dièses", () => {
    expect(after("|", (s) => setHeading(s, 2))).toBe("## |");
  });

  it("en début de ligne, laisse le curseur après les dièses", () => {
    expect(after("|titre", (s) => setHeading(s, 1))).toBe("# |titre");
  });
});

describe("listes", () => {
  const bullet = (s: EditorState) => toggleList(s, "bullet");

  it("sur une ligne vide, laisse le curseur après la puce et après le numéro", () => {
    expect(after("|", bullet)).toBe("- |");
    expect(after("|", (s) => toggleList(s, "numbered"))).toBe("1. |");
  });
  const numbered = (s: EditorState) => toggleList(s, "numbered");

  it("met une puce ou un numéro à chaque ligne", () => {
    expect(after("‹pain\nlait›", bullet)).toBe("- ‹pain\n- lait›");
    expect(after("‹pain\nlait›", numbered)).toBe("1. ‹pain\n2. lait›");
  });

  it("retire les puces ou les numéros si toutes les lignes en ont", () => {
    expect(after("‹- pain\n- lait›", bullet)).toBe("‹pain\nlait›");
    expect(after("‹1. pain\n2. lait›", numbered)).toBe("‹pain\nlait›");
  });

  it("change des puces en numéros, et inversement, en gardant l'indentation", () => {
    expect(after("‹- pain\n  - lait›", numbered)).toBe("‹1. pain\n  2. lait›");
    expect(after("‹1. pain\n2) lait›", bullet)).toBe("‹- pain\n- lait›");
  });

  it("complète une liste où certaines lignes n'ont pas de puce", () => {
    expect(after("‹- pain\nlait›", bullet)).toBe("‹- pain\n- lait›");
  });

  it("ne voit une marque de liste qu'en début de ligne", () => {
    expect(after("acheter 2. |pain", numbered)).toBe("1. acheter 2. |pain");
    expect(after("pain - |lait", bullet)).toBe("- pain - |lait");
  });

  it("reconnaît les puces indentées", () => {
    expect(after("‹  - a\n  - b›", bullet)).toBe("‹  a\n  b›");
  });

  it("reconnaît les numéros indentés et à plusieurs chiffres", () => {
    expect(after("‹  1. pain\n  2. lait›", numbered)).toBe("‹  pain\n  lait›");
    expect(after("‹9. a\n10. b›", numbered)).toBe("‹a\nb›");
    expect(after("‹9. a\n10. b›", bullet)).toBe("‹- a\n- b›");
  });

  it("laisse une case à cocher telle quelle", () => {
    expect(after("- [ ] |pain", bullet)).toBe("- [ ] |pain");
  });
});
