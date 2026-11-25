import { describe, expect, it } from "vitest";
import { action, crm, sample, TODAY } from "../../test-support/crm-fixture";
import { cardView, lateText, lookupsOf, PEOPLE_SHOWN } from "./crm-card";
import { tagColor } from "./tag-field";

const view = (name: string, data = sample()) => {
  const found = data.actions.find((a) => a.name === name);
  if (found === undefined) throw new Error(name);
  return cardView(found, lookupsOf(data), TODAY);
};

describe("pastille de retard", () => {
  it("dit « de 1 jour » le lendemain, « de N jours » ensuite", () => {
    expect(lateText(1)).toBe("En retard de 1 jour");
    expect(lateText(2)).toBe("En retard de 2 jours");
    expect(lateText(30)).toBe("En retard de 30 jours");
  });
});

describe("carte du Kanban", () => {
  it("montre la pastille de retard à la place de la date", () => {
    expect(view("devis").when).toEqual({ kind: "late", text: "En retard de 3 jours" });
  });

  it("montre la pastille du jour à la place de la date", () => {
    expect(view("appel").when).toEqual({ kind: "today", text: "À faire aujourd'hui" });
  });

  it("montre la date courte d'une action qui n'est ni en retard ni du jour", () => {
    expect(view("relance").when).toEqual({ kind: "date", text: "27 nov." });
    expect(view("fini").when).toEqual({ kind: "date", text: "20 nov." });
  });

  it("ne montre rien d'une action sans date", () => {
    expect(cardView(action("a"), lookupsOf(crm()), TODAY).when).toBeNull();
  });

  it("montre le projet avec sa couleur, rien sans projet", () => {
    expect(view("devis").project).toEqual({ title: "Refonte du site", color: "bleu" });
    expect(view("relance").project).toBeNull();
  });

  it("ignore un projet dont la fiche n'existe plus", () => {
    const data = crm({ actions: [action("a", { project: "disparu" })] });
    expect(view("a", data).project).toBeNull();
  });

  it("écrit chaque personne « Nom (entreprise) », sans parenthèses pour NODATA", () => {
    expect(view("devis").people).toEqual(["Jean Dupont (Acme)"]);
    expect(view("appel").people).toEqual(["Marie Durand"]);
    expect(view("relance").people).toEqual([]);
    expect(view("relance").morePeople).toBe(0);
  });

  it("garde les deux premières personnes puis dit « +N »", () => {
    expect(PEOPLE_SHOWN).toBe(2);
    const data = sample();
    const names = ["jean-dupont", "marie-durand", "jean-dupont", "marie-durand", "jean-dupont"];
    const many = action("many", { people: names.map((person) => ({ person, company: null })) });
    const shown = cardView(many, lookupsOf(data), TODAY);
    expect(shown.people).toEqual(["Jean Dupont", "Marie Durand"]);
    expect(shown.morePeople).toBe(3);
    const two = action("two", {
      people: names.slice(0, 2).map((person) => ({ person, company: null })),
    });
    expect(cardView(two, lookupsOf(data), TODAY).morePeople).toBe(0);
  });

  it("laisse de côté une personne ou une entreprise dont la fiche n'existe plus", () => {
    const data = sample();
    const old = action("a", {
      people: [
        { person: "disparu", company: null },
        { person: "jean-dupont", company: "fermee" },
      ],
    });
    expect(cardView(old, lookupsOf(data), TODAY).people).toEqual(["Jean Dupont"]);
  });

  it("donne à chaque étiquette sa couleur", () => {
    expect(view("devis").tags).toEqual([
      { name: "urgent", color: "orange" },
      { name: "salon", color: tagColor("salon") },
    ]);
  });

  it("dit ce qu'elle contient : description, éléments cochés, commentaires, notes liées", () => {
    const full = view("devis");
    expect(full).toMatchObject({
      hasDescription: true,
      checklist: "1/2",
      comments: 1,
      linkedNotes: 1,
    });
    const empty = view("relance");
    expect(empty).toMatchObject({
      hasDescription: false,
      checklist: null,
      comments: 0,
      linkedNotes: 0,
    });
  });

  it("additionne les éléments de toutes ses listes à cocher", () => {
    const lists = [
      {
        name: "A",
        done: 2,
        items: [
          { done: true, text: "a" },
          { done: true, text: "b" },
        ],
      },
      { name: "B", done: 0, items: [{ done: false, text: "c" }] },
    ];
    const data = crm({ actions: [action("a", { checklists: lists })] });
    expect(view("a", data).checklist).toBe("2/3");
  });

  it("ne montre pas de repère pour une liste à cocher sans élément ni pour une description blanche", () => {
    const data = crm({
      actions: [
        action("a", { checklists: [{ name: "Vide", done: 0, items: [] }], description: " \n" }),
      ],
    });
    expect(view("a", data)).toMatchObject({ checklist: null, hasDescription: false });
  });

  it("garde la couleur d'action de la palette, et une couleur inconnue n'en est pas une", () => {
    expect(view("devis").color).toBe("violet");
    const data = crm({ actions: [action("a", { color: "fluo" })] });
    expect(view("a", data).color).toBeNull();
  });

  it("teinte le fond selon le retard ou le jour, seulement sans couleur d'action", () => {
    expect(view("devis").tone).toBeNull();
    expect(view("appel").tone).toBe("today");
    const late = action("l", { urgency: { kind: "late", days: 1 } });
    expect(cardView(late, lookupsOf(crm()), TODAY).tone).toBe("late");
    expect(view("relance").tone).toBeNull();
  });
});
