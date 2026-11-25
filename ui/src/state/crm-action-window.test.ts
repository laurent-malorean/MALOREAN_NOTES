import { describe, expect, it } from "vitest";
import {
  action,
  company,
  crm,
  person,
  project,
  sample,
  TODAY,
} from "../../test-support/crm-fixture";
import type { CrmActionChangeItem } from "../bridge";
import {
  applyChange,
  blankFields,
  CHANNELS,
  draftOf,
  emailsToCopy,
  fieldsOf,
  newestFirst,
  PEOPLE_SEPARATOR,
  progress,
  segmentsOf,
  withTag,
} from "./crm-action-window";

const data = () => sample();
const devis = () => fieldsOf(data().actions[0] as ReturnType<typeof action>, data());
const change = (c: CrmActionChangeItem, fields = devis()) => applyChange(fields, c, data());

describe("canaux", () => {
  it("sont les sept canaux, dans l'ordre des menus, tels qu'écrits dans le fichier", () => {
    expect(CHANNELS).toEqual([
      "appel",
      "e-mail",
      "rendez-vous",
      "courrier",
      "salon",
      "réseau social",
      "autre",
    ]);
  });
});

describe("champs d'une action existante", () => {
  it("reprennent ce que Rust a lu", () => {
    expect(devis()).toEqual({
      ...{ title: "Demande de devis", status: "TODO", date: "2026-11-22", channel: null },
      ...{ project: "refonte", color: "violet", tags: ["urgent", "salon"] },
      ...{ linkedNotes: ["Cahier des charges"], description: "Pour 3 postes" },
      people: [{ person: "jean-dupont", company: "acme" }],
    });
  });

  it("laissent de côté une personne dont la fiche n'existe plus, gardent son entreprise d'alors", () => {
    const crmData = crm({
      people: [person("marie", "Marie", "globex")],
      actions: [
        action("a", {
          people: [
            { person: "disparu", company: null },
            { person: "marie", company: "acme" },
          ],
        }),
      ],
    });
    const fields = fieldsOf(crmData.actions[0] as ReturnType<typeof action>, crmData);
    expect(fields.people).toEqual([{ person: "marie", company: "acme" }]);
  });

  it("prennent une chaîne vide pour une action sans date", () => {
    const crmData = crm({ actions: [action("a")] });
    expect(fieldsOf(crmData.actions[0] as ReturnType<typeof action>, crmData).date).toBe("");
  });
});

describe("champs d'une nouvelle action", () => {
  it("prennent aujourd'hui, le statut TODO, aucune personne, un titre vide", () => {
    expect(blankFields({}, data())).toEqual({
      ...{ title: "", status: "TODO", date: TODAY, channel: null, project: null, color: null },
      ...{ tags: [], linkedNotes: [], people: [], description: "" },
    });
  });

  it("prennent le titre, le statut, le jour et la personne donnés", () => {
    const fields = blankFields(
      { title: "Relancer", status: "Progress", date: "2026-11-27", person: "jean-dupont" },
      data(),
    );
    expect(fields).toMatchObject({ title: "Relancer", status: "Progress", date: "2026-11-27" });
    expect(fields.people).toEqual([{ person: "jean-dupont", company: "acme" }]);
  });

  it("donnent à une personne de NODATA une entreprise vide, et ignorent une personne inconnue ou vide", () => {
    expect(blankFields({ person: "marie-durand" }, data()).people).toEqual([
      { person: "marie-durand", company: null },
    ]);
    expect(blankFields({ person: "inconnu" }, data()).people).toEqual([]);
    expect(blankFields({ person: "" }, data()).people).toEqual([]);
  });
});

describe("appliquer un geste aux champs", () => {
  it("change le titre, le statut, la date, le canal, le projet et la couleur", () => {
    expect(change({ kind: "title", title: "Autre" }).title).toBe("Autre");
    expect(change({ kind: "status", status: "Done" }).status).toBe("Done");
    expect(change({ kind: "date", date: "2026-12-01" }).date).toBe("2026-12-01");
    expect(change({ kind: "channel", channel: "appel" }).channel).toBe("appel");
    expect(change({ kind: "project", project: null }).project).toBeNull();
    expect(change({ kind: "color", color: "rouge" }).color).toBe("rouge");
  });

  it("change les étiquettes, les notes liées, la description", () => {
    expect(change({ kind: "tags", tags: ["a"] }).tags).toEqual(["a"]);
    expect(change({ kind: "linkedNotes", notes: ["N"] }).linkedNotes).toEqual(["N"]);
    expect(change({ kind: "body", change: { kind: "description", text: "x" } }).description).toBe(
      "x",
    );
  });

  it("donne une personne avec son entreprise de ce moment, sans doublon", () => {
    const fields = change({ kind: "addPerson", person: "marie-durand" });
    expect(fields.people).toEqual([
      { person: "jean-dupont", company: "acme" },
      { person: "marie-durand", company: null },
    ]);
    expect(change({ kind: "addPerson", person: "jean-dupont" }, fields)).toEqual(fields);
    expect(change({ kind: "addPerson", person: "inconnu" }, fields)).toEqual(fields);
  });

  it("retire une personne", () => {
    expect(change({ kind: "removePerson", person: "jean-dupont" }).people).toEqual([]);
    expect(change({ kind: "removePerson", person: "autre" }).people).toHaveLength(1);
  });

  it("laisse les champs tels quels pour un geste sur une liste ou un commentaire", () => {
    const fields = devis();
    expect(change({ kind: "body", change: { kind: "addComment", text: "x" } })).toEqual(fields);
  });
});

describe("brouillon à envoyer à Rust", () => {
  it("reprend les champs, les personnes par leur référence, le titre sans espaces autour", () => {
    const fields = { ...devis(), title: "  Demande  " };
    expect(draftOf(fields)).toEqual({
      ...{ title: "Demande", status: "TODO", date: "2026-11-22", people: ["jean-dupont"] },
      ...{ channel: null, project: "refonte", color: "violet", tags: ["urgent", "salon"] },
      linkedNotes: ["Cahier des charges"],
      description: "Pour 3 postes",
    });
  });

  it("n'envoie pas de date vide (aujourd'hui par défaut côté Rust)", () => {
    expect(draftOf({ ...devis(), date: "" }).date).toBeNull();
  });
});

describe("e-mails à copier", () => {
  const withEmails = crm({
    people: [
      { ...person("a", "A"), email: "a@x.fr" },
      { ...person("b", "B"), email: null },
      { ...person("c", "C"), email: "" },
      { ...person("d", "D"), email: "d@x.fr" },
    ],
    companies: [company("acme", "Acme")],
    projects: [project("p", "P")],
  });
  const of = (...names: string[]) =>
    emailsToCopy(
      names.map((name) => ({ person: name, company: null })),
      withEmails,
    );

  it("sépare les e-mails des personnes qui en ont par « , »", () => {
    expect(PEOPLE_SEPARATOR).toBe(", ");
    expect(of("a", "b", "c", "d")).toBe("a@x.fr, d@x.fr");
  });

  it("rend rien quand aucune personne n'a d'e-mail", () => {
    expect(of("b", "c")).toBe("");
    expect(of()).toBe("");
    expect(of("inconnu")).toBe("");
  });
});

describe("avancement d'une liste à cocher", () => {
  const list = (...done: boolean[]) => ({
    name: "L",
    done: done.filter(Boolean).length,
    items: done.map((d) => ({ done: d, text: "x" })),
  });

  it("est le pourcentage d'éléments cochés, arrondi", () => {
    expect(progress(list(true, false))).toBe(50);
    expect(progress(list(true, false, false))).toBe(33);
    expect(progress(list(true, true, false))).toBe(67);
    expect(progress(list(true, true))).toBe(100);
  });

  it("est zéro sans élément ou sans rien de coché", () => {
    expect(progress(list())).toBe(0);
    expect(progress(list(false))).toBe(0);
  });
});

describe("commentaires, le plus récent d'abord", () => {
  it("garde la place de chacun dans l'ordre écrit", () => {
    const comments = [
      { at: "2026-11-20 09:00", text: "a" },
      { at: "2026-11-21 09:00", text: "b" },
    ];
    expect(newestFirst(comments)).toEqual([
      { index: 1, comment: comments[1] },
      { index: 0, comment: comments[0] },
    ]);
    expect(newestFirst([])).toEqual([]);
  });
});

describe("étiquettes", () => {
  it("ajoute une étiquette sans espaces autour", () => {
    expect(withTag(["a"], "  b ")).toEqual(["a", "b"]);
  });

  it("refuse une étiquette vide ou déjà là, la casse ne comptant pas", () => {
    expect(withTag(["a"], "   ")).toEqual(["a"]);
    expect(withTag(["Salon"], "salon")).toEqual(["Salon"]);
  });
});

describe("adresses dans un commentaire", () => {
  const text = (t: string) => ({ kind: "text", text: t });
  const link = (t: string, url: string) => ({ kind: "link", text: t, url });

  it("laisse un texte sans adresse tel quel", () => {
    expect(segmentsOf("Rappelé, pas de réponse.")).toEqual([text("Rappelé, pas de réponse.")]);
    expect(segmentsOf("")).toEqual([]);
  });

  it("reconnaît une adresse seule, sans la ponctuation qui la suit", () => {
    expect(segmentsOf("Voir https://acme.fr/devis.")).toEqual([
      text("Voir "),
      link("https://acme.fr/devis", "https://acme.fr/devis"),
      text("."),
    ]);
    expect(segmentsOf("http://a.fr, puis (https://b.fr)")).toEqual([
      link("http://a.fr", "http://a.fr"),
      text(", puis ("),
      link("https://b.fr", "https://b.fr"),
      text(")"),
    ]);
  });

  it("reconnaît une adresse entre « < » et « > »", () => {
    expect(segmentsOf("a <https://acme.fr> b")).toEqual([
      text("a "),
      link("https://acme.fr", "https://acme.fr"),
      text(" b"),
    ]);
  });

  it("reconnaît [texte](adresse) et montre le texte", () => {
    expect(segmentsOf("Voir [le site](https://acme.fr/x?a=1) ici")).toEqual([
      text("Voir "),
      link("le site", "https://acme.fr/x?a=1"),
      text(" ici"),
    ]);
  });

  it("ne reconnaît que les adresses internet", () => {
    expect(segmentsOf("[x](javascript:alert(1)) et <mailto:a@b.fr> et ftp://a.fr")).toEqual([
      text("[x](javascript:alert(1)) et <mailto:a@b.fr> et ftp://a.fr"),
    ]);
  });

  it("garde les retours à la ligne dans le texte", () => {
    expect(segmentsOf("a\nhttps://x.fr\nb")).toEqual([
      text("a\n"),
      link("https://x.fr", "https://x.fr"),
      text("\nb"),
    ]);
  });
});
