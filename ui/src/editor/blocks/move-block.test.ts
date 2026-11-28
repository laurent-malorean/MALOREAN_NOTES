import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { canDrop, changeBetween, moveBlock } from "./move-block";
import { readBlocks } from "./read-blocks";

function blocksOf(text: string) {
  const state = EditorState.create({
    doc: text,
    extensions: [markdown({ base: markdownLanguage })],
  });
  return readBlocks(state);
}

/** La note après avoir déplacé le bloc `index` devant le bloc `slot` (`slot` = nombre de blocs : à la fin). */
function move(text: string, index: number, slot: number): string | null {
  return moveBlock(text, blocksOf(text), index, slot)?.text ?? null;
}

describe("déplacer un paragraphe, un titre, une citation, du code, un tableau", () => {
  it("vers le bas : il reste une seule ligne vide avant et après", () => {
    expect(move("un\n\ndeux\n\ntrois", 0, 2)).toBe("deux\n\nun\n\ntrois");
    expect(move("un\n\ndeux\n\ntrois", 0, 3)).toBe("deux\n\ntrois\n\nun");
  });

  it("vers le haut", () => {
    expect(move("un\n\ndeux\n\ntrois", 2, 0)).toBe("trois\n\nun\n\ndeux");
    expect(move("un\n\ndeux\n\ntrois", 2, 1)).toBe("un\n\ntrois\n\ndeux");
  });

  it("des lignes vides en trop autour du bloc ne se retrouvent pas", () => {
    expect(move("un\n\n\n\ndeux\n\ntrois", 1, 0)).toBe("deux\n\nun\n\ntrois");
    expect(move("un\n\n\ndeux\n\n\n\ntrois", 1, 3)).toBe("un\n\ntrois\n\ndeux");
  });

  it("un titre se déplace seul, sans son paragraphe", () => {
    expect(move("# A\n\ntexte\n\n## B\n\nsuite", 0, 3)).toBe("texte\n\n## B\n\n# A\n\nsuite");
  });

  it("une citation, du code (avec ses lignes vides) et un tableau gardent leurs lignes", () => {
    expect(move("> c1\n> c2\n\nfin", 0, 2)).toBe("fin\n\n> c1\n> c2");
    expect(move("```\na\n\nb\n```\n\nfin", 0, 2)).toBe("fin\n\n```\na\n\nb\n```");
    expect(move("| a | b |\n|---|---|\n| 1 | 2 |\n\nfin", 0, 2)).toBe(
      "fin\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    );
  });

  it("une ligne de séparation et une image se déplacent comme un paragraphe", () => {
    expect(move("un\n\n***\n\n![i](a.png)", 1, 3)).toBe("un\n\n![i](a.png)\n\n***");
  });

  it("garde les fins de note : la ligne finale vide reste en fin de note", () => {
    expect(move("un\n\ndeux\n", 0, 2)).toBe("deux\n\nun\n");
    expect(move("un\n\ndeux\n", 1, 0)).toBe("deux\n\nun\n");
  });

  it("l'en-tête de la note reste en haut, avec sa ligne vide", () => {
    const note = "---\ntype: note\n---\n\nun\n\ndeux";
    expect(move(note, 1, 0)).toBe("---\ntype: note\n---\n\ndeux\n\nun");
    expect(move(note, 0, 2)).toBe("---\ntype: note\n---\n\ndeux\n\nun");
  });

  it("garde les lignes vides de tête d'une note sans en-tête", () => {
    expect(move("\nun\n\ndeux", 1, 0)).toBe("\ndeux\n\nun");
  });

  it("ne change rien à la place d'origine, ni juste devant ni juste derrière", () => {
    expect(move("un\n\ndeux\n\ntrois", 1, 1)).toBeNull();
    expect(move("un\n\ndeux\n\ntrois", 1, 2)).toBeNull();
    expect(move("un\n\ndeux", 1, 2)).toBeNull();
    expect(move("un\n\ndeux", 0, 0)).toBeNull();
  });

  it("refuse un bloc ou une place qui n'existent pas", () => {
    expect(move("un", 4, 0)).toBeNull();
    expect(move("un\n\ndeux", 0, -1)).toBeNull();
    expect(move("un\n\ndeux", 0, 3)).toBeNull();
  });

  it("dit où est le bloc après le déplacement, au début de sa première ligne", () => {
    const text = "un\ndeux\n\ntrois";
    const moved = moveBlock(text, blocksOf(text), 0, 2);
    expect(moved?.text).toBe("trois\n\nun\ndeux");
    expect(moved?.cursor).toBe("trois\n\n".length);
  });

  it("le curseur est au bon endroit quand le bloc remonte", () => {
    const text = "un\n\ndeux";
    const moved = moveBlock(text, blocksOf(text), 1, 0);
    expect(moved?.text).toBe("deux\n\nun");
    expect(moved?.cursor).toBe(0);
  });
});

describe("déplacer un élément de liste", () => {
  it("entre deux éléments de la même liste : aucune ligne vide", () => {
    expect(move("- a\n- b\n- c", 0, 2)).toBe("- b\n- a\n- c");
    expect(move("- a\n- b\n- c", 2, 0)).toBe("- c\n- a\n- b");
  });

  it("emporte ses sous-éléments, qui gardent leur retrait relatif", () => {
    expect(move("- a\n  - a1\n    - a2\n- b", 0, 4)).toBe("- b\n- a\n  - a1\n    - a2");
  });

  it("prend le retrait de l'élément devant lequel il est déposé, ses sous-éléments le suivent", () => {
    expect(move("- a\n  - a1\n- b\n  - b1", 0, 3)).toBe("- b\n  - a\n    - a1\n  - b1");
  });

  it("un sous-élément déposé devant un élément du premier niveau remonte à son niveau", () => {
    expect(move("- a\n  - a1\n- b", 1, 2)).toBe("- a\n- a1\n- b");
    expect(move("- a\n  - a1\n- b", 1, 3)).toBe("- a\n- b\n- a1");
  });

  it("déposé juste derrière sa place, au même niveau, rien ne change", () => {
    expect(move("- a\n- b\n- c", 1, 2)).toBeNull();
    expect(move("- a\n- b\n\nfin", 1, 2)).toBeNull();
  });

  it("déposé dans son propre contenu : rien ne change", () => {
    expect(move("- a\n  - a1\n  - a2\n- b", 0, 1)).toBeNull();
    expect(move("- a\n  - a1\n  - a2\n- b", 0, 2)).toBeNull();
  });

  it("déposé à la fin de la liste, il prend le retrait du dernier élément", () => {
    expect(move("- a\n- b\n  - b1\n\nfin", 0, 3)).toBe("- b\n  - b1\n  - a\n\nfin");
  });

  it("déposé entre deux paragraphes, il forme une liste à lui seul", () => {
    expect(move("un\n\ndeux\n\n- a", 2, 1)).toBe("un\n\n- a\n\ndeux");
  });

  it("déposé devant un titre, une ligne vide le sépare", () => {
    expect(move("- a\n- b\n\n# T", 1, 3)).toBe("- a\n\n# T\n\n- b");
  });

  it("un paragraphe déposé au milieu d'une liste la coupe, avec une ligne vide de chaque côté", () => {
    expect(move("texte\n\n- a\n- b", 0, 2)).toBe("- a\n\ntexte\n\n- b");
  });

  it("retiré du milieu d'une liste, ses voisins se rejoignent sans ligne vide", () => {
    expect(move("- a\n- b\n- c\n\nfin", 1, 4)).toBe("- a\n- c\n\nfin\n\n- b");
  });

  it("un élément sorti d'entre deux paragraphes laisse une seule ligne vide", () => {
    expect(move("un\n\n- a\n\ndeux", 1, 3)).toBe("un\n\ndeux\n\n- a");
  });

  it("une case à cocher se déplace comme un élément", () => {
    expect(move("- [ ] a\n- [x] b", 0, 2)).toBe("- [x] b\n- [ ] a");
  });

  it("un élément déposé devant un élément d'une autre liste la rejoint", () => {
    expect(move("- a\n\ntexte\n\n- b", 0, 2)).toBe("texte\n\n- a\n- b");
  });
});

describe("déplacer un élément d'une liste numérotée", () => {
  it("refait les numéros de la liste", () => {
    expect(move("1. a\n2. b\n3. c", 0, 3)).toBe("1. b\n2. c\n3. a");
    expect(move("1. a\n2. b\n3. c", 2, 0)).toBe("1. c\n2. a\n3. b");
  });

  it("refait aussi les numéros des sous-listes numérotées, sans toucher aux autres listes", () => {
    const note = "1. a\n   1. a1\n   2. a2\n2. b\n\ntexte\n\n1. x\n3. y";
    expect(move(note, 2, 1)).toBe("1. a\n   1. a2\n   2. a1\n2. b\n\ntexte\n\n1. x\n3. y");
  });

  it("garde le numéro de départ de la liste", () => {
    expect(move("3. a\n4. b\n5. c", 2, 0)).toBe("3. c\n4. a\n5. b");
  });

  it("déposé dans une autre liste numérotée : les deux listes sont renumérotées", () => {
    const note = "1. a\n2. b\n3. c\n\ntexte\n\n1. x\n2. y";
    expect(move(note, 1, 5)).toBe("1. a\n2. c\n\ntexte\n\n1. x\n2. b\n3. y");
  });

  it("un élément numéroté déposé seul entre deux paragraphes redevient le numéro de départ", () => {
    expect(move("1. a\n2. b\n\ntexte", 1, 3)).toBe("1. a\n\ntexte\n\n1. b");
  });

  it("garde le délimiteur de la marque et élargit un numéro à deux chiffres", () => {
    expect(move("9) a\n10) b", 1, 0)).toBe("9) b\n10) a");
  });

  it("un élément numéroté qui change de niveau sans changer de place est renuméroté", () => {
    expect(move("1. a\n   2. a1\n2. b", 1, 2)).toBe("1. a\n2. a1\n3. b");
  });

  it("un élément numéroté déplacé parmi des puces garde sa marque et sa liste d'origine renumérotée", () => {
    expect(move("1. a\n2. b\n\n- p", 0, 3)).toBe("1. b\n\n- p\n\n1. a");
  });
});

describe("retraits en détail", () => {
  it("les lignes vides à l'intérieur d'un élément ne sont pas décalées, les autres le sont", () => {
    expect(move("- a\n\n  suite de a\n- b\n  - b1", 0, 2)).toBe(
      "- b\n  - a\n\n    suite de a\n  - b1",
    );
  });

  it("un sous-sous-élément déposé au premier niveau perd tout son retrait, sans manger le texte", () => {
    expect(move("- a\n    - a1\n- b", 1, 3)).toBe("- a\n- b\n- a1");
  });

  it("un bloc qui n'est pas un élément de liste ne change jamais de retrait", () => {
    expect(move("- a\n  - a1\n\n  texte\n\nfin", 2, 4)).toBeNull();
  });
});

describe("où un bloc peut être déposé", () => {
  const blocks = (text: string) => {
    const state = EditorState.create({
      doc: text,
      extensions: [markdown({ base: markdownLanguage })],
    });
    return readBlocks(state);
  };

  it("pas devant lui-même ni dans ses sous-éléments", () => {
    const list = blocks("- a\n  - a1\n  - a2\n- b");
    expect(canDrop(list, 0, 0)).toBe(false);
    expect(canDrop(list, 0, 1)).toBe(false);
    expect(canDrop(list, 0, 2)).toBe(false);
    expect(canDrop(list, 0, 3)).toBe(true);
    expect(canDrop(list, 0, 4)).toBe(true);
  });

  it("juste derrière lui, seulement pour un élément de liste", () => {
    expect(canDrop(blocks("un\n\ndeux"), 0, 1)).toBe(false);
    expect(canDrop(blocks("- a\n- b"), 0, 1)).toBe(true);
  });

  it("ni un bloc ni une place qui n'existent pas", () => {
    expect(canDrop(blocks("un"), 1, 0)).toBe(false);
    expect(canDrop(blocks("un\n\ndeux"), 0, 3)).toBe(false);
    expect(canDrop(blocks("un\n\ndeux"), 0, -1)).toBe(false);
  });
});

describe("changement minimal entre deux textes", () => {
  it("ne remplace que ce qui diffère", () => {
    expect(changeBetween("un deux trois", "un DEUX trois")).toEqual({
      from: 3,
      to: 7,
      insert: "DEUX",
    });
  });

  it("gère un ajout, un retrait et un texte identique", () => {
    expect(changeBetween("ab", "abc")).toEqual({ from: 2, to: 2, insert: "c" });
    expect(changeBetween("abc", "ab")).toEqual({ from: 2, to: 3, insert: "" });
    expect(changeBetween("abab", "ab")).toEqual({ from: 2, to: 4, insert: "" });
    expect(changeBetween("ab", "ab")).toEqual({ from: 2, to: 2, insert: "" });
  });
});
