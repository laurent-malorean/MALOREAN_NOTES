import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { readBlocks, type TextBlock } from "./read-blocks";

function blocksOf(doc: string): readonly TextBlock[] {
  return readBlocks(
    EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }),
  );
}

/** Pour chaque bloc : son genre et ses lignes, « 3 » ou « 3-5 ». */
function summary(doc: string): string[] {
  return blocksOf(doc).map(
    (b) => `${b.kind} ${b.first === b.last ? b.first : `${b.first}-${b.last}`}`,
  );
}

describe("lecture des blocs de texte", () => {
  it("un paragraphe va jusqu'à la ligne vide", () => {
    expect(summary("un\ndeux\n\ntrois")).toEqual(["paragraph 1-2", "paragraph 4"]);
  });

  it("un titre est seul : le paragraphe qui le suit est un autre bloc", () => {
    expect(summary("# Titre\ntexte\n\n## Sous-titre\nautre")).toEqual([
      "heading 1",
      "paragraph 2",
      "heading 4",
      "paragraph 5",
    ]);
  });

  it("un titre souligné fait un bloc de deux lignes", () => {
    expect(summary("Titre\n=====\n\ntexte")).toEqual(["heading 1-2", "paragraph 4"]);
  });

  it("une citation prend toutes ses lignes", () => {
    expect(summary("> un\n> deux\n\nfin")).toEqual(["quote 1-2", "paragraph 4"]);
  });

  it("un bloc de code va de l'ouverture à la fermeture, lignes vides comprises", () => {
    expect(summary("```js\na\n\nb\n```\n\nfin")).toEqual(["code 1-5", "paragraph 7"]);
  });

  it("un bloc de code indenté est un bloc de code", () => {
    expect(summary("texte\n\n    code")).toEqual(["paragraph 1", "code 3"]);
  });

  it("un tableau prend toutes ses lignes", () => {
    expect(summary("| a | b |\n|---|---|\n| 1 | 2 |\n\nfin")).toEqual(["table 1-3", "paragraph 5"]);
  });

  it("une ligne de séparation est un bloc", () => {
    expect(summary("un\n\n***\n\ndeux")).toEqual(["paragraph 1", "rule 3", "paragraph 5"]);
  });

  it("une image seule sur sa ligne est un bloc", () => {
    expect(summary("![photo](a.png)\n\ntexte")).toEqual(["paragraph 1", "paragraph 3"]);
  });

  it("un bloc de HTML est un bloc (genre « other »)", () => {
    expect(summary("<div>x</div>\n\ntexte")).toEqual(["other 1", "paragraph 3"]);
  });

  it("l'en-tête YAML n'est pas un bloc", () => {
    expect(summary("---\ntype: note\ntags: [a]\n---\n# Titre\n\ntexte")).toEqual([
      "heading 5",
      "paragraph 7",
    ]);
  });

  it("une note vide ou faite de lignes vides n'a pas de bloc", () => {
    expect(summary("")).toEqual([]);
    expect(summary("\n\n")).toEqual([]);
  });

  it("chaque élément de liste est un bloc, ses sous-éléments le suivent dans son bloc", () => {
    const blocks = blocksOf("- a\n  - a1\n  - a2\n- b\n\nfin");
    expect(blocks.map((b) => [b.kind, b.first, b.last, b.descendants])).toEqual([
      ["list-item", 1, 3, 2],
      ["list-item", 2, 2, 0],
      ["list-item", 3, 3, 0],
      ["list-item", 4, 4, 0],
      ["paragraph", 6, 6, 0],
    ]);
  });

  it("un sous-élément de sous-élément compte parmi les descendants de l'élément de départ", () => {
    const [top] = blocksOf("- a\n  - b\n    - c\n- d");
    expect(top?.descendants).toBe(2);
    expect([top?.first, top?.last]).toEqual([1, 3]);
  });

  it("dit le retrait et le numéro d'un élément de liste", () => {
    const blocks = blocksOf("1. un\n   - sous\n2. deux\n10. dix");
    expect(blocks.map((b) => b.list)).toEqual([
      { ordered: true, indent: 0, number: 1, digits: 1, listId: 0, start: 1, task: false },
      { ordered: false, indent: 3, number: 0, digits: 0, listId: 0, start: 0, task: false },
      { ordered: true, indent: 0, number: 2, digits: 1, listId: 0, start: 1, task: false },
      { ordered: true, indent: 0, number: 10, digits: 2, listId: 0, start: 1, task: false },
    ]);
  });

  it("deux listes séparées par un paragraphe n'ont pas la même identité", () => {
    const [first, , second] = blocksOf("- a\n\ntexte\n\n- b");
    expect(first?.list?.listId).not.toBe(second?.list?.listId);
  });

  it("la case à cocher fait partie de l'élément, et il le dit", () => {
    const blocks = blocksOf("- [ ] tâche\n- [x] faite\n- simple");
    expect(blocks.map((b) => [b.kind, b.list?.task])).toEqual([
      ["list-item", true],
      ["list-item", true],
      ["list-item", false],
    ]);
  });

  it("une liste commencée par un autre numéro garde ce numéro de départ", () => {
    const [first, second] = blocksOf("3. a\n4. b");
    expect(first?.list?.start).toBe(3);
    expect(second?.list?.start).toBe(3);
  });

  it("la plage donne aussi les positions de la première et de la dernière ligne", () => {
    const [block] = blocksOf("un\ndeux\n\ntrois");
    expect([block?.from, block?.to]).toEqual([0, 7]);
  });
});
