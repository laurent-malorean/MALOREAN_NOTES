import { describe, expect, it } from "vitest";
import type { ContentTypeItem, SearchResultItem } from "../bridge";
import { resultSections, sectionTitle } from "./result-sections";

function found(contentType: ContentTypeItem, path: string): SearchResultItem {
  return {
    ...{ path, title: path, folder: "", contentType, container: null },
    ...{ containerTitle: null, node: null, modified: 1 },
    excerpt: [{ text: path, matched: false }],
  };
}

const titles = (results: readonly SearchResultItem[]) =>
  resultSections(results).map((section) => sectionTitle(section));

describe("sections de résultats", () => {
  it("ne montre aucune section sans résultat", () => {
    expect(resultSections([])).toEqual([]);
    expect(titles([found("note", "a")])).toEqual(["Notes (1)"]);
  });

  it("range les sections dans l'ordre : Canvas, Cartes mentales, Cahiers de recherche, CRM, Notes", () => {
    const results = [
      found("note", "n"),
      found("crmAction", "a"),
      found("entry", "e"),
      found("node", "m"),
      found("canvas", "c"),
    ];
    expect(titles(results)).toEqual([
      "Canvas (1)",
      "Cartes mentales (1)",
      "Cahiers de recherche (1)",
      "CRM (1)",
      "Notes (1)",
    ]);
  });

  it("met les notes en dernier, même quand elles arrivent en premier et en nombre", () => {
    const results = [
      found("note", "a"),
      found("note", "b"),
      found("note", "c"),
      found("canvas", "x"),
    ];
    expect(titles(results)).toEqual(["Canvas (1)", "Notes (3)"]);
  });

  it("compte les résultats de chaque section", () => {
    const results = [found("node", "1"), found("mindMap", "2"), found("node", "3")];
    expect(titles(results)).toEqual(["Cartes mentales (3)"]);
  });

  it("réunit le CRM et ses fiches (action, projet, personne, entreprise) en une section", () => {
    const kinds: ContentTypeItem[] = ["crm", "crmAction", "crmProject", "crmPerson", "crmCompany"];
    expect(titles(kinds.map((kind) => found(kind, kind)))).toEqual(["CRM (5)"]);
  });

  it("réunit les agendas 12 et leurs événements, avant les notes", () => {
    expect(
      titles([found("note", "n"), found("agenda12Event", "e"), found("agenda12", "a")]),
    ).toEqual(["Agendas 12 (2)", "Notes (1)"]);
  });

  it("réunit les cahiers de recherche et leurs entrées", () => {
    expect(titles([found("entry", "e"), found("researchNotebook", "c")])).toEqual([
      "Cahiers de recherche (2)",
    ]);
  });

  it("garde l'ordre des résultats à l'intérieur d'une section", () => {
    const results = [
      found("crmPerson", "p1"),
      found("note", "n1"),
      found("crmAction", "a1"),
      found("crmPerson", "p2"),
    ];
    const [crm, notes] = resultSections(results);
    expect(crm?.results.map((r) => r.path)).toEqual(["p1", "a1", "p2"]);
    expect(notes?.results.map((r) => r.path)).toEqual(["n1"]);
  });

  it("range un type inconnu parmi les notes", () => {
    const unknown = found("note", "u");
    const results = [
      { ...unknown, contentType: "inconnu" as ContentTypeItem },
      found("canvas", "c"),
    ];
    expect(titles(results)).toEqual(["Canvas (1)", "Notes (1)"]);
  });

  it("garde tous les résultats, une seule fois chacun", () => {
    const results = (["note", "canvas", "node", "crm", "entry", "note"] as const).map((kind, i) =>
      found(kind, `r${i}`),
    );
    const all = resultSections(results).flatMap((section) => section.results);
    expect(all.map((r) => r.path).sort()).toEqual(results.map((r) => r.path).sort());
  });
});
