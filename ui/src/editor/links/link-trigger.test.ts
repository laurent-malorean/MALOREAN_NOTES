import { describe, expect, it } from "vitest";
import { linkTrigger } from "./link-trigger";

const at = (text: string) => linkTrigger(text, text.length);

describe("ce qui ouvre le menu des liens", () => {
  it("`[[` ouvre la complétion, ce qui suit filtre", () => {
    expect(at("voir [[")).toEqual({ kind: "brackets", from: 5, query: "" });
    expect(at("voir [[Cour")).toEqual({ kind: "brackets", from: 5, query: "Cour" });
    expect(at("voir [[Plan de sal")).toEqual({ kind: "brackets", from: 5, query: "Plan de sal" });
  });

  it("la complétion se ferme quand le lien est fermé ou que le texte montré commence", () => {
    expect(at("voir [[Courses]]")).toBeNull();
    expect(at("voir [[Courses|la li")).toBeNull();
    expect(at("voir [[Courses]] puis [[Pl")).toEqual({ kind: "brackets", from: 22, query: "Pl" });
  });

  it("un curseur placé avant `[[` ne l'ouvre pas", () => {
    expect(linkTrigger("voir [[Courses", 3)).toBeNull();
  });

  it("`/` en début de ligne ou après une espace ouvre le menu", () => {
    expect(at("/")).toEqual({ kind: "slash", from: 0, query: "" });
    expect(at("/cou")).toEqual({ kind: "slash", from: 0, query: "cou" });
    expect(at("voir /")).toEqual({ kind: "slash", from: 5, query: "" });
    expect(at("voir /plan de")).toEqual({ kind: "slash", from: 5, query: "plan de" });
    expect(at("\t/x")).toEqual({ kind: "slash", from: 1, query: "x" });
  });

  it("`/` collé à un mot n'ouvre rien : adresse, chemin, « et/ou »", () => {
    expect(at("et/ou")).toBeNull();
    expect(at("https://site.fr/page")).toBeNull();
    expect(at("a/b/c")).toBeNull();
  });

  it("`/` suivi d'une espace n'ouvre rien : « et / ou »", () => {
    expect(at("et / ")).toBeNull();
    expect(at("1 / 2")).toBeNull();
  });

  it("un chemin tapé après `/` garde le menu ouvert tant que le premier `/` le commence", () => {
    expect(at("/usr/bin")).toEqual({ kind: "slash", from: 0, query: "usr/bin" });
  });

  it("`[[` l'emporte sur `/` : un chemin de dossier dans un lien n'ouvre pas le menu du `/`", () => {
    expect(at("/ [[Dossier/Tit")).toEqual({ kind: "brackets", from: 2, query: "Dossier/Tit" });
  });

  it("sans `[[` ni `/`, rien", () => {
    expect(at("")).toBeNull();
    expect(at("du texte")).toBeNull();
    expect(at("un [ crochet")).toBeNull();
  });
});
