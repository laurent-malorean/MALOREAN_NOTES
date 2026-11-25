import { describe, expect, it } from "vitest";
import { action, company, crm, person } from "../../test-support/crm-fixture";
import { lookupsOf } from "./crm-card";
import {
  careerLines,
  crmFichePath,
  ficheTarget,
  formerPeople,
  lastActions,
  personActions,
  recentFirst,
} from "./crm-fiche";

const PERSON = "---\ntype: crm-personne\n---\n# Jean\n";
const COMPANY = "---\ntype: crm-entreprise\n---\n# Acme\n";

describe("chemin d'une fiche", () => {
  it("range une personne dans personnes/, une entreprise dans entreprises/, sous le nom du CRM", () => {
    expect(crmFichePath("clients.md", "person", "jean-dupont")).toBe(
      "clients/personnes/jean-dupont.md",
    );
    expect(crmFichePath("Ventes/clients.md", "company", "acme")).toBe(
      "Ventes/clients/entreprises/acme.md",
    );
  });
});

describe("reconnaître une fiche", () => {
  it("lit le CRM, la sorte et la référence d'après le chemin et l'en-tête", () => {
    expect(ficheTarget("clients/personnes/jean.md", PERSON)).toEqual({
      ...{ kind: "person", crm: "clients.md" },
      name: "jean",
    });
    expect(ficheTarget("Ventes/clients/entreprises/acme.md", COMPANY)).toEqual({
      ...{ kind: "company", crm: "Ventes/clients.md" },
      name: "acme",
    });
  });

  it("n'en reconnaît pas une note d'un autre type, ni une fiche hors de son dossier", () => {
    expect(ficheTarget("clients/personnes/jean.md", "# Jean\n")).toBeNull();
    expect(ficheTarget("clients/actions/jean.md", "---\ntype: crm-action\n---\n# A\n")).toBeNull();
    expect(ficheTarget("clients/entreprises/jean.md", PERSON)).toBeNull();
    expect(ficheTarget("clients/personnes/acme.md", COMPANY)).toBeNull();
    expect(ficheTarget("personnes/jean.md", PERSON)).toBeNull();
    expect(ficheTarget("jean.md", PERSON)).toBeNull();
  });
});

describe("actions de la plus récente à la plus ancienne", () => {
  it("range par date, les actions sans date à la fin, la dernière créée d'abord à date égale", () => {
    const list = [
      action("2026-11-01-a", { date: "2026-11-01" }),
      action("sans", { date: null }),
      action("2026-11-20-b", { date: "2026-11-20" }),
      action("2026-11-02-c", { date: "2026-11-20" }),
    ];
    expect(recentFirst(list).map((a) => a.name)).toEqual([
      "2026-11-20-b",
      "2026-11-02-c",
      "2026-11-01-a",
      "sans",
    ]);
    expect(list[0]?.name).toBe("2026-11-01-a");
  });

  it("garde les 10 dernières actions d'une personne, ouvertes et terminées mêlées", () => {
    const actions = Array.from({ length: 12 }, (_, i) =>
      action(`a${String(i).padStart(2, "0")}`, {
        date: `2026-11-${String(i + 1).padStart(2, "0")}`,
        open: i % 2 === 0,
      }),
    );
    const who = {
      ...person("jean", "Jean"),
      openActions: actions.filter((a) => a.open).map((a) => a.name),
      closedActions: actions.filter((a) => !a.open).map((a) => a.name),
    };
    const found = lastActions(who, lookupsOf(crm({ actions })));
    expect(found).toHaveLength(10);
    expect(found[0]?.name).toBe("a11");
    expect(found[9]?.name).toBe("a02");
    expect(lastActions(who, lookupsOf(crm({ actions })), 3).map((a) => a.name)).toEqual([
      "a11",
      "a10",
      "a09",
    ]);
  });

  it("donne toutes les actions d'une personne : les ouvertes d'abord, puis les terminées, chaque groupe du plus récent au plus ancien", () => {
    const actions = [
      action("o1", { date: "2026-11-01" }),
      action("o2", { date: "2026-11-09" }),
      action("c1", { date: "2026-12-01", open: false, status: "Done" }),
      action("c2", { date: "2026-10-01", open: false, status: "Cancel" }),
    ];
    const who = {
      ...person("jean", "Jean"),
      openActions: ["o1", "o2"],
      closedActions: ["c2", "c1"],
    };
    const found = personActions(who, lookupsOf(crm({ actions })));
    expect(found.open.map((a) => a.name)).toEqual(["o2", "o1"]);
    expect(found.closed.map((a) => a.name)).toEqual(["c1", "c2"]);
  });

  it("laisse de côté une action dont la fiche n'existe pas", () => {
    const who = { ...person("jean", "Jean"), openActions: ["absente"], closedActions: [] };
    expect(personActions(who, lookupsOf(crm())).open).toEqual([]);
    expect(lastActions(who, lookupsOf(crm()))).toEqual([]);
  });
});

describe("anciennes personnes d'une entreprise", () => {
  const acme = { ...company("acme", "Acme"), people: ["marie"] };
  const gone = {
    ...person("jean", "Jean Dupont", "globex"),
    career: [
      { company: "acme", from: "2024-01-10", to: "2025-01-01" },
      { company: "globex", from: "2025-01-01", to: null },
    ],
  };
  const here = {
    ...person("marie", "Marie", "acme"),
    career: [
      { company: "acme", from: "2023-01-01", to: "2023-06-01" },
      { company: "globex", from: "2023-06-01", to: "2024-01-01" },
      { company: "acme", from: "2024-01-01", to: null },
    ],
  };
  const never = { ...person("paul", "Paul", "globex"), career: [] };
  const data = crm({ companies: [acme, company("globex", "Globex")], people: [gone, here, never] });

  it("sont les personnes passées par l'entreprise et parties, pas celles qui y sont", () => {
    expect(formerPeople(acme, data).map((f) => f.person.name)).toEqual(["jean"]);
  });

  it("gardent les actions qu'elles y avaient, pas celles d'une autre entreprise", () => {
    const actions = [
      action("chez-acme", { people: [{ person: "jean", company: "acme" }] }),
      action("chez-globex", { people: [{ person: "jean", company: "globex" }] }),
      action("autre", { people: [{ person: "paul", company: "acme" }] }),
    ];
    const full = crm({ ...data, actions });
    const found = formerPeople(acme, full);
    expect(found[0]?.actions.map((a) => a.name)).toEqual(["chez-acme"]);
  });

  it("ne comptent pas une personne passée dont la fiche n'existe plus", () => {
    const orphan = crm({ ...data, people: [here] });
    expect(formerPeople(acme, orphan)).toEqual([]);
  });
});

describe("parcours d'une personne", () => {
  it("écrit une ligne par passage, la fin vide pour le passage en cours", () => {
    const data = crm({ companies: [company("acme", "Acme"), company("globex", "Globex")] });
    const lines = careerLines(
      [
        { company: "globex", from: "2024-01-10", to: "2026-03-01" },
        { company: "acme", from: "2026-03-01", to: null },
      ],
      lookupsOf(data),
    );
    expect(lines).toEqual(["Globex · 2024-01-10 → 2026-03-01", "Acme · 2026-03-01 →"]);
  });

  it("laisse de côté un passage dans une entreprise dont la fiche n'existe plus", () => {
    const data = crm({ companies: [company("acme", "Acme")] });
    expect(
      careerLines(
        [
          { company: "fermee", from: "2024-01-10", to: "2026-03-01" },
          { company: "acme", from: "2026-03-01", to: null },
        ],
        lookupsOf(data),
      ),
    ).toEqual(["Acme · 2026-03-01 →"]);
  });
});
