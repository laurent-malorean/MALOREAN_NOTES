import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { addBlockBelow } from "./add-block";
import { readBlocks } from "./read-blocks";

/** La note après le « + » du bloc `index`, et ce que le curseur a devant lui. */
function add(text: string, index: number) {
  const state = EditorState.create({
    doc: text,
    extensions: [markdown({ base: markdownLanguage })],
  });
  const added = addBlockBelow(text, readBlocks(state), index);
  return added && { text: added.text, before: added.text.slice(0, added.cursor).split("\n").pop() };
}

describe("ajouter un bloc sous un bloc", () => {
  it("sous un paragraphe : une ligne vide, séparée de chaque côté par une ligne vide", () => {
    const added = add("un\n\ndeux", 0);
    expect(added?.text).toBe("un\n\n\n\ndeux");
  });

  it("le curseur est sur la nouvelle ligne", () => {
    const text = "un\n\ndeux";
    const state = EditorState.create({
      doc: text,
      extensions: [markdown({ base: markdownLanguage })],
    });
    expect(addBlockBelow(text, readBlocks(state), 0)?.cursor).toBe("un\n\n".length);
  });

  it("sous le dernier bloc de la note", () => {
    expect(add("un", 0)?.text).toBe("un\n\n");
    expect(add("un\n", 0)?.text).toBe("un\n\n");
  });

  it("sous un bloc suivi sans ligne vide d'un autre", () => {
    expect(add("# T\ntexte", 0)?.text).toBe("# T\n\n\n\ntexte");
  });

  it("sous un titre, une citation, du code ou un tableau", () => {
    expect(add("# T\n\ntexte", 0)?.text).toBe("# T\n\n\n\ntexte");
    expect(add("> c\n\nfin", 0)?.text).toBe("> c\n\n\n\nfin");
    expect(add("```\nx\n```\n\nfin", 0)?.text).toBe("```\nx\n```\n\n\n\nfin");
  });

  it("sous un élément de liste : un nouvel élément au même niveau, le curseur après sa marque", () => {
    const added = add("- a\n- b", 0);
    expect(added?.text).toBe("- a\n- \n- b");
    expect(added?.before).toBe("- ");
  });

  it("sous un élément qui a des sous-éléments : après le dernier", () => {
    expect(add("- a\n  - a1\n    - a2\n- b", 0)?.text).toBe("- a\n  - a1\n    - a2\n- \n- b");
  });

  it("sous un sous-élément : au même niveau que lui", () => {
    const added = add("- a\n  - a1\n- b", 1);
    expect(added?.text).toBe("- a\n  - a1\n  - \n- b");
    expect(added?.before).toBe("  - ");
  });

  it("garde la puce utilisée, et la case à cocher", () => {
    expect(add("* a", 0)?.text).toBe("* a\n* ");
    expect(add("- [ ] a\n- [x] b", 1)?.text).toBe("- [ ] a\n- [x] b\n- [ ] ");
  });

  it("sous un élément numéroté : le numéro suivant, les suivants sont renumérotés", () => {
    const added = add("1. a\n2. b\n3. c", 0);
    expect(added?.text).toBe("1. a\n2. \n3. b\n4. c");
    expect(added?.before).toBe("2. ");
  });

  it("sous un élément numéroté qui a des sous-éléments numérotés", () => {
    expect(add("1. a\n   1. a1\n2. b", 0)?.text).toBe("1. a\n   1. a1\n2. \n3. b");
  });

  it("garde le délimiteur d'une liste numérotée", () => {
    expect(add("1) a", 0)?.text).toBe("1) a\n2) ");
  });

  it("refuse un bloc qui n'existe pas", () => {
    expect(add("un", 3)).toBeNull();
  });
});
