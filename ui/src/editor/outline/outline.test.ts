import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { outlineOf } from "./outline";

function outline(doc: string) {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return outlineOf(state).map((h) => `${h.level}:${h.text}@${h.from}`);
}

describe("plan de la note", () => {
  it("liste les titres dans l'ordre, avec leur niveau et leur place", () => {
    expect(outline("# Un\ntexte\n## Deux\n### Trois")).toEqual([
      "1:Un@0",
      "2:Deux@11",
      "3:Trois@19",
    ]);
  });

  it("reconnaît les titres soulignés", () => {
    expect(outline("Grand\n=====\n\nPetit\n-----")).toEqual(["1:Grand@0", "2:Petit@13"]);
  });

  it("donne le texte tel qu'on le lit, sans marques ni dièses de fermeture", () => {
    expect(outline("## Le **grand** [plan](u) ##")).toEqual(["2:Le grand plan@0"]);
  });

  it("reconnaît tous les niveaux de titre", () => {
    expect(outline("#### 4\n##### 5\n###### 6")).toEqual(["4:4@0", "5:5@7", "6:6@15"]);
  });

  it("ne retire que de vrais dièses de fermeture, et les espaces autour du titre", () => {
    expect(outline("## Titre # milieu ##")).toEqual(["2:Titre # milieu@0"]);
    expect(outline("# Titre #x")).toEqual(["1:Titre #x@0"]);
    expect(outline("# C##")).toEqual(["1:C##@0"]);
    expect(outline("# Titre   ")).toEqual(["1:Titre@0"]);
  });

  it("ignore l'en-tête YAML, les blocs de code et les citations", () => {
    expect(outline("---\ntitre: x\n---\n# Vrai\n```\n# faux\n```\n> # cité")).toEqual([
      "1:Vrai@17",
    ]);
  });

  it("n'a rien pour une note sans titre", () => {
    expect(outline("du texte\nseulement")).toEqual([]);
  });
});
