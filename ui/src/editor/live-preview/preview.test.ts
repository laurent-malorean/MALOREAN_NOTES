import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, Text } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { type Conceal, computePreview, toggledTaskMarker } from "./preview";

/** Ce que l'on voit à l'écran : texte masqué retiré, puces, cases et séparateurs dessinés. */
function seen(source: string, activeLines: number[] = []): string {
  const state = EditorState.create({
    doc: source,
    extensions: markdown({ base: markdownLanguage }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  if (!tree) throw new Error("analyse Markdown incomplète");
  const { conceals } = computePreview({ doc: state.doc, tree, activeLines: new Set(activeLines) });
  return render(state.doc, conceals);
}

function render(doc: Text, conceals: readonly Conceal[]): string {
  let out = "";
  let pos = 0;
  for (const c of conceals) {
    out += doc.sliceString(pos, c.from) + drawn(c);
    pos = c.to;
  }
  return out + doc.sliceString(pos);
}

function drawn(c: Conceal): string {
  if (c.kind === "bullet") return "• ";
  if (c.kind === "checkbox") return c.checked ? "☑" : "☐";
  if (c.kind === "rule") return "───";
  return "";
}

function lineStyles(source: string): string[] {
  const state = EditorState.create({
    doc: source,
    extensions: markdown({ base: markdownLanguage }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  if (!tree) throw new Error("analyse Markdown incomplète");
  return computePreview({ doc: state.doc, tree, activeLines: new Set() }).lineStyles.map(
    (s) => `${state.doc.lineAt(s.from).number}:${s.className}`,
  );
}

describe("titres, gras, italique, barré", () => {
  it("cache les dièses d'un titre", () => {
    expect(seen("# Titre\n## Sous-titre")).toBe("Titre\nSous-titre");
  });

  it("montre la syntaxe sur la ligne où l'on écrit", () => {
    expect(seen("# Titre\n**gras**", [1])).toBe("# Titre\ngras");
  });

  it("cache les marques de gras, d'italique, de gras italique et de barré", () => {
    expect(seen("**g** *i* _i_ __g__ ***gi*** ~~b~~")).toBe("g i i g gi b");
  });

  it("cache les accents graves du code en ligne", () => {
    expect(seen("du `code` ici")).toBe("du code ici");
  });

  it("ne touche à rien dans un bloc de code", () => {
    expect(seen("```\n# pas un titre **x**\n```")).toBe("```\n# pas un titre **x**\n```");
  });

  it("ne touche pas à l'en-tête YAML et l'affiche en discret", () => {
    const source = "---\npinned: true\n---\n# Titre";
    expect(seen(source)).toBe("---\npinned: true\n---\nTitre");
    expect(lineStyles(source)).toEqual([
      "1:cm-lp-front-matter",
      "2:cm-lp-front-matter",
      "3:cm-lp-front-matter",
    ]);
  });
});

describe("listes, cases à cocher, citations", () => {
  it("dessine une puce à la place du tiret", () => {
    expect(seen("- un\n* deux\n  + trois")).toBe("• un\n• deux\n  • trois");
  });

  it("garde les numéros d'une liste numérotée", () => {
    expect(seen("1. un\n2. deux")).toBe("1. un\n2. deux");
  });

  it("dessine une case à cocher à la place de la tâche", () => {
    expect(seen("- [ ] à faire\n- [x] fait")).toBe("☐ à faire\n☑ fait");
  });

  it("cache le chevron d'une citation et la met en forme", () => {
    expect(seen("> une citation\n> suite")).toBe("une citation\nsuite");
    expect(lineStyles("> une citation\n> suite")).toEqual(["1:cm-lp-quote", "2:cm-lp-quote"]);
  });

  it("dessine un séparateur", () => {
    expect(seen("avant\n\n---\n\naprès")).toBe("avant\n\n───\n\naprès");
  });
});

describe("liens", () => {
  it("ne montre que le texte d'un lien", () => {
    expect(seen("un [site](https://example.com) ici")).toBe("un site ici");
  });

  it("laisse une adresse brute visible", () => {
    expect(seen("voir https://example.org")).toBe("voir https://example.org");
  });
});

describe("cocher une case", () => {
  it("coche et décoche", () => {
    expect(toggledTaskMarker("[ ]")).toBe("[x]");
    expect(toggledTaskMarker("[x]")).toBe("[ ]");
    expect(toggledTaskMarker("[X]")).toBe("[ ]");
  });
});
