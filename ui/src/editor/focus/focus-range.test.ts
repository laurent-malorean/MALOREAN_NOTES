import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { ABBREVIATIONS, focusRange } from "./focus-range";

/** Le passage mis en avant quand le curseur est sur le `|` de `marked`. */
function focused(marked: string, unit: "sentence" | "paragraph"): string {
  const pos = marked.indexOf("|");
  const doc = Text.of(marked.replace("|", "").split("\n"));
  const { from, to } = focusRange(doc, pos, unit);
  return doc.sliceString(from, to);
}

describe("paragraphe en cours", () => {
  it("est le bloc de lignes entre deux lignes vides", () => {
    expect(focused("avant\n\nun |deux\ntrois\n\naprès", "paragraph")).toBe("un deux\ntrois");
  });

  it("va jusqu'au début et à la fin de la note", () => {
    expect(focused("un |deux", "paragraph")).toBe("un deux");
  });

  it("est vide, au curseur, sur une ligne vide", () => {
    expect(focusRange(Text.of(["un", "", "deux"]), 3, "paragraph")).toEqual({ from: 3, to: 3 });
  });

  it("compte une ligne blanche faite d'espaces comme vide", () => {
    expect(focused("un\n   \nde|ux", "paragraph")).toBe("deux");
  });

  it("fait d'un titre un paragraphe à lui seul", () => {
    expect(focused("# Ti|tre\ntexte", "paragraph")).toBe("# Titre");
    expect(focused("# Titre\nte|xte", "paragraph")).toBe("texte");
  });

  it("ne prend pour titre qu'une ligne qui commence par un à six dièses suivis d'une espace", () => {
    expect(focused("un|\n#collé", "paragraph")).toBe("un\n#collé");
    expect(focused("un|\n####### sept", "paragraph")).toBe("un\n####### sept");
    expect(focused("un|\na # b", "paragraph")).toBe("un\na # b");
    expect(focused("un|\n### trois", "paragraph")).toBe("un");
    expect(focused("un|\n##", "paragraph")).toBe("un");
  });

  it("ne prend pour élément de liste qu'une ligne qui commence par sa marque", () => {
    expect(focused("un|\nx- y", "paragraph")).toBe("un\nx- y");
    expect(focused("un|\na - b", "paragraph")).toBe("un\na - b");
    expect(focused("- un\n  - so|us", "paragraph")).toBe("  - sous");
    expect(focused("9. neuf\n10. d|ix", "paragraph")).toBe("10. dix");
  });

  it("fait de chaque élément de liste un paragraphe", () => {
    expect(focused("- un\n- de|ux\n  suite\n- trois", "paragraph")).toBe("- deux\n  suite");
    expect(focused("1. un\n2. de|ux", "paragraph")).toBe("2. deux");
    expect(focused("* un\n+ de|ux", "paragraph")).toBe("+ deux");
  });
});

describe("phrase en cours", () => {
  it("s'arrête au point suivi d'une espace", () => {
    expect(focused("Une phrase. Une au|tre phrase. La fin.", "sentence")).toBe("Une autre phrase.");
  });

  it("reconnaît les points d'exclamation, d'interrogation et de suspension", () => {
    expect(focused("Quoi ? Vrai|ment ! Bon…", "sentence")).toBe("Vraiment !");
    expect(focused("Bon… Al|ors.", "sentence")).toBe("Alors.");
    expect(focused("Oui! Su|r?", "sentence")).toBe("Sur?");
  });

  it("garde le guillemet fermant avec la phrase qu'il termine", () => {
    expect(focused("Il dit « oui. » Pu|is part.", "sentence")).toBe("Puis part.");
    expect(focused("« Oui. » Pu|is", "sentence")).toBe("Puis");
    expect(focused('Il dit "oui." Pu|is', "sentence")).toBe("Puis");
  });

  it("ne coupe pas après une abréviation ou une initiale", () => {
    expect(focused("Voir M. Du|pont demain.", "sentence")).toBe("Voir M. Dupont demain.");
    expect(focused("Signé J. K. Row|ling ici.", "sentence")).toBe("Signé J. K. Rowling ici.");
    expect(focused("Voir p. 12 et cf. no|te.", "sentence")).toBe("Voir p. 12 et cf. note.");
  });

  it.each([...ABBREVIATIONS])("ne coupe pas après l'abréviation « %s. »", (abbreviation) => {
    expect(focused(`Voir ${abbreviation}. Du|pont ici.`, "sentence")).toBe(
      `Voir ${abbreviation}. Dupont ici.`,
    );
  });

  it("coupe après un mot en capitales et après un point d'exclamation qui suit une abréviation", () => {
    expect(focused("Voir le PDG. Pu|is.", "sentence")).toBe("Puis.");
    expect(focused("C'est un ex! Pu|is.", "sentence")).toBe("Puis.");
  });

  it("garde plusieurs guillemets ou parenthèses fermants avec la phrase", () => {
    expect(focused("Il dit (« oui. ») Pu|is part.", "sentence")).toBe("Puis part.");
  });

  it("coupe après un nombre suivi d'un point", () => {
    expect(focused("J'en ai 3. Pu|is.", "sentence")).toBe("Puis.");
  });

  it("trouve la phrase dans un paragraphe qui n'est pas le premier", () => {
    expect(focused("Avant.\n\nUn. De|ux. Trois.", "sentence")).toBe("Deux.");
  });

  it("finit la dernière phrase sans ponctuation au dernier mot", () => {
    expect(focused("Un. Deux sans| fin   ", "sentence")).toBe("Deux sans fin");
  });

  it("ne coupe pas un nombre décimal ni une adresse", () => {
    expect(focused("Il fait 3.5 de|grés.", "sentence")).toBe("Il fait 3.5 degrés.");
  });

  it("s'arrête au bout du paragraphe, même sans ponctuation", () => {
    expect(focused("un titre\n\nPhra|se sans fin\n\nautre", "sentence")).toBe("Phrase sans fin");
  });

  it("continue sur la ligne suivante du même paragraphe", () => {
    expect(focused("Début de\nla phra|se. Fin.", "sentence")).toBe("Début de\nla phrase.");
  });

  it("commence après la fin de la phrase précédente, sur une autre ligne", () => {
    expect(focused("Un.\nDe|ux.", "sentence")).toBe("Deux.");
  });

  it("donne la phrase qui précède quand le curseur suit sa ponctuation", () => {
    expect(focused("Un.| Deux.", "sentence")).toBe("Un.");
  });

  it("est vide sur une ligne vide", () => {
    expect(focused("Un.\n|\nDeux.", "sentence")).toBe("");
  });
});
