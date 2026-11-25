import { describe, expect, it } from "vitest";
import { action, company, person, project, sample, TODAY } from "../../test-support/crm-fixture";
import { lookupsOf } from "./crm-card";
import {
  actionLine,
  countText,
  fold,
  matchesName,
  parseUnfolded,
  serializeUnfolded,
  takenColors,
  tallyBadges,
} from "./crm-lists";

describe("recherche par nom des listes", () => {
  it("ne compte ni les majuscules ni les accents", () => {
    expect(fold("Éléonore  DÛ")).toBe("eleonore  du");
    expect(matchesName("Éléonore Dupré", "eleo")).toBe(true);
    expect(matchesName("Éléonore Dupré", "DUPRE")).toBe(true);
    expect(matchesName("Éléonore Dupré", "durand")).toBe(false);
  });

  it("garde tout quand la recherche est vide ou n'a que des espaces", () => {
    expect(matchesName("Acme", "")).toBe(true);
    expect(matchesName("Acme", "   ")).toBe(true);
  });

  it("ignore les espaces autour du mot cherché", () => {
    expect(matchesName("Acme", "  acm ")).toBe(true);
  });
});

describe("textes des compteurs", () => {
  it("met le pluriel à partir de 2", () => {
    expect(countText(0, "personne")).toBe("0 personne");
    expect(countText(1, "personne")).toBe("1 personne");
    expect(countText(2, "personne")).toBe("2 personnes");
    expect(countText(2, "ouverte")).toBe("2 ouvertes");
  });

  it("dit le retard en rouge et le jour en orange, seulement quand il y en a", () => {
    expect(tallyBadges({ open: 5, late: 2, today: 1 })).toEqual({
      late: "2 en retard",
      today: "1 à faire aujourd'hui",
    });
    expect(tallyBadges({ open: 5, late: 0, today: 0 })).toEqual({ late: null, today: null });
    expect(tallyBadges({ open: 1, late: 1, today: 0 })).toEqual({
      late: "1 en retard",
      today: null,
    });
  });
});

describe("ce qui est déplié", () => {
  it("se garde en liste et se relit", () => {
    const keys = new Set(["people:jean", "companies:nodata"]);
    expect(parseUnfolded(serializeUnfolded(keys))).toEqual(keys);
  });

  it("repart de rien quand ce qui est gardé n'est pas une liste de textes", () => {
    for (const raw of [null, "", "pas du json", '{"a":1}', "[1,2]", '["a",2]'])
      expect(parseUnfolded(raw)).toEqual(new Set());
  });
});

describe("couleurs prises des projets", () => {
  it("donne celles des autres projets, pas celle du projet lui-même", () => {
    const projects = [
      project("a", "A", "bleu"),
      project("b", "B", "rouge"),
      project("c", "C", "bleu"),
    ];
    expect(takenColors(projects, "a")).toEqual(new Set(["rouge", "bleu"]));
    expect(takenColors([project("a", "A", "bleu")], "a")).toEqual(new Set());
    expect(takenColors(projects, "inconnu")).toEqual(new Set(["bleu", "rouge"]));
  });
});

describe("ligne d'action", () => {
  const crm = sample();
  const lookups = lookupsOf(crm);
  const devis = crm.actions[0] as (typeof crm.actions)[number];

  it("dans l'onglet Projets : date, statut, personnes, entreprises, titre", () => {
    expect(actionLine(devis, lookups, TODAY, "project")).toEqual({
      ...{ name: "devis", date: "22 nov.", status: "TODO", people: "Jean Dupont" },
      ...{ companies: "Acme", project: null, title: "Demande de devis" },
    });
  });

  it("dans les autres listes : le projet, pas les personnes", () => {
    expect(actionLine(devis, lookups, TODAY, "person")).toEqual({
      ...{ name: "devis", date: "22 nov.", status: "TODO", people: null, companies: null },
      project: { title: "Refonte du site", color: "bleu" },
      title: "Demande de devis",
    });
  });

  it("ne dit rien d'une action sans personne, sans projet ni date", () => {
    const bare = action("nue", { title: "Nue" });
    expect(actionLine(bare, lookups, TODAY, "project")).toMatchObject({
      date: null,
      people: null,
      companies: null,
      project: null,
    });
    expect(actionLine(bare, lookups, TODAY, "person").project).toBeNull();
  });

  it("nomme NODATA l'entreprise d'une personne qui n'en avait pas", () => {
    const many = action("deux", {
      people: [
        { person: "marie-durand", company: null },
        { person: "jean-dupont", company: "acme" },
      ],
    });
    const line = actionLine(many, lookups, TODAY, "project");
    expect(line.people).toBe("Marie Durand, Jean Dupont");
    expect(line.companies).toBe("NODATA, Acme");
  });

  it("ne nomme qu'une fois une entreprise partagée par plusieurs personnes", () => {
    const same = action("trois", {
      people: [
        { person: "jean-dupont", company: "acme" },
        { person: "marie-durand", company: "acme" },
        { person: "paul", company: null },
        { person: "luc", company: null },
      ],
    });
    const line = actionLine(
      same,
      lookupsOf({ ...crm, people: [...crm.people, person("paul", "Paul"), person("luc", "Luc")] }),
      TODAY,
      "project",
    );
    expect(line.companies).toBe("Acme, NODATA");
  });

  it("laisse de côté une personne ou une entreprise dont la fiche n'existe plus", () => {
    const gone = action("fantome", {
      people: [
        { person: "parti", company: "acme" },
        { person: "jean-dupont", company: "fermee" },
      ],
    });
    const line = actionLine(gone, lookups, TODAY, "project");
    expect(line.people).toBe("Jean Dupont");
    expect(line.companies).toBeNull();
    expect(
      actionLine(
        action("a", { people: [{ person: "parti", company: null }] }),
        lookups,
        TODAY,
        "project",
      ),
    ).toMatchObject({ people: null, companies: null });
  });

  it("laisse de côté un projet dont la fiche n'existe plus", () => {
    const orphan = action("o", { project: "disparu" });
    expect(actionLine(orphan, lookups, TODAY, "person").project).toBeNull();
  });

  it("garde l'année d'une date qui n'est pas de l'année en cours", () => {
    const old = action("vieille", { date: "2025-12-31" });
    expect(actionLine(old, lookups, TODAY, "person").date).toBe("31 déc. 2025");
  });

  it("garde le statut d'une action terminée", () => {
    const done = crm.actions[3] as (typeof crm.actions)[number];
    expect(actionLine(done, lookups, TODAY, "person").status).toBe("Done");
  });

  it("n'utilise pas les entreprises quand il n'y en a pas dans le CRM", () => {
    const empty = lookupsOf({ ...crm, companies: [company("x", "X")] });
    expect(actionLine(devis, empty, TODAY, "project").companies).toBeNull();
  });
});
