import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { linkTargetAt } from "./attachments";

function targetAt(doc: string, text: string): string | null {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return linkTargetAt(state, doc.indexOf(text));
}

describe("cible du lien sous le curseur", () => {
  it("donne la cible d'un lien depuis son texte", () => {
    expect(targetAt("voir [Billet.pdf](a.assets/Billet.pdf) ici", "Billet.pdf]")).toBe(
      "a.assets/Billet.pdf",
    );
  });

  it("donne la cible d'un lien mis en forme", () => {
    expect(targetAt("[**gras**](a.assets/b.pdf)", "gras")).toBe("a.assets/b.pdf");
  });

  it("donne la cible d'une image", () => {
    expect(targetAt("![vue](a.assets/vue.png)", "vue]")).toBe("a.assets/vue.png");
  });

  it("ne donne rien hors d'un lien", () => {
    expect(targetAt("texte [lien](x.pdf)", "texte")).toBeNull();
  });

  it("ne donne rien pour un lien par référence", () => {
    expect(targetAt("[lien][ref]\n\n[ref]: x.pdf", "lien")).toBeNull();
  });
});
