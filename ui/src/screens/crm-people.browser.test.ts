import { describe, expect, it } from "vitest";
import { crm } from "../../test-support/crm-fixture";
import { listsSample } from "../../test-support/crm-lists-fixture";
import {
  buttonNamed,
  callsTo,
  mountCrm,
  press,
  tabNamed,
  text,
  type,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";
import { PEOPLE_COLUMNS } from "./crm-people";

const rows = () => [...document.querySelectorAll<HTMLElement>(".crm-row")];
const cells = (row: Element) => [...row.querySelectorAll("td")].map((c) => c.textContent);
const search = () => document.querySelector(".crm-list-search") as HTMLInputElement;
const lines = (scope: ParentNode) =>
  [...scope.querySelectorAll(".crm-line")].map((l) => l.textContent);

async function open(options: Parameters<typeof mountCrm>[0] = {}) {
  const m = await mountCrm({ crm: listsSample(), tab: "people", ...options });
  return m;
}

describe("onglet Personnes : le tableau", () => {
  it("dit nom, fonction, entreprise et actions ouvertes, dans l'ordre", async () => {
    await open();
    expect(PEOPLE_COLUMNS).toEqual(["Nom", "Fonction", "Entreprise", "Actions ouvertes"]);
    expect([...document.querySelectorAll("th")].map((th) => th.textContent)).toEqual([
      ...PEOPLE_COLUMNS,
    ]);
    expect(rows().map((row) => cells(row))).toEqual([
      ["▸Jean Dupont", "Responsable maintenance", "Acme", "2"],
      ["▸Marie Durand", "", "NODATA", "1"],
      ["▸Paul Martin", "", "Acme", "1"],
    ]);
  });

  it("dit NODATA pour une personne dont l'entreprise n'existe plus", async () => {
    const data = listsSample();
    data.companies = data.companies.filter((c) => c.name !== "acme");
    await open({ crm: data });
    expect(cells(rows()[0] as Element)[2]).toBe("NODATA");
  });

  it("dit qu'il n'y a aucune personne dans un CRM sans personne", async () => {
    await open({ crm: crm() });
    expect(text(document, ".crm-list-empty")).toBe("Aucune personne.");
    expect(document.querySelector(".crm-table")).toBeNull();
  });

  it("ouvre la fiche de la personne au clic sur son nom", async () => {
    const m = await open();
    (rows()[0]?.querySelector(".crm-name") as HTMLElement).click();
    expect(m.opened).toEqual(["clients/personnes/jean-dupont.md"]);
  });
});

describe("onglet Personnes : la recherche", () => {
  it("cherche par nom sans compter majuscules ni accents, et le dit quand rien ne correspond", async () => {
    await open();
    expect(search().placeholder).toBe("Rechercher une personne");
    type(search(), "DURAND");
    expect(rows().map((row) => cells(row)[0])).toEqual(["▸Marie Durand"]);
    type(search(), "zzz");
    expect(rows()).toHaveLength(0);
    expect(text(document, ".crm-list-empty")).toBe("Aucune personne ne correspond.");
    type(search(), "");
    expect(rows()).toHaveLength(3);
  });

  it("garde le curseur dans le champ pendant la frappe", async () => {
    await open();
    search().focus();
    type(search(), "du");
    expect(document.activeElement).toBe(search());
    expect(search().value).toBe("du");
  });
});

describe("onglet Personnes : déplier", () => {
  it("montre les actions ouvertes d'abord, puis les terminées, avec le projet et sans les personnes", async () => {
    const m = await open();
    const unfold = rows()[0]?.querySelector(".crm-unfold") as HTMLElement;
    expect(unfold.getAttribute("aria-expanded")).toBe("false");
    unfold.click();
    const sub = document.querySelector(".crm-sub") as HTMLElement;
    expect(lines(sub)).toEqual([
      "22 nov. · TODO · Refonte du site · Demande de devis",
      "25 nov. · Progress · Appeler Jean",
      "20 nov. · Done · Contrat signé",
    ]);
    expect(
      (document.querySelector(".crm-unfold") as HTMLElement).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(m.kept).toEqual(['["people:jean-dupont"]']);
    (document.querySelector(".crm-unfold") as HTMLElement).click();
    expect(document.querySelector(".crm-sub")).toBeNull();
    expect(m.kept[1]).toBe("[]");
  });

  it("dit « Aucune action. » d'une personne qui n'en a pas", async () => {
    const data = listsSample();
    data.people = data.people.map((p) => ({ ...p, openActions: [], closedActions: [] }));
    const m = await open({ crm: data, unfolded: '["people:jean-dupont"]' });
    expect(text(document, ".crm-sub .crm-list-empty")).toBe("Aucune action.");
    expect(m.errors).toEqual([]);
  });

  it("retrouve ce qui était déplié", async () => {
    await open({ unfolded: '["people:marie-durand"]' });
    expect(document.querySelectorAll(".crm-sub")).toHaveLength(1);
    expect(lines(document.querySelector(".crm-sub") as HTMLElement)).toEqual([
      "25 nov. · Progress · Appeler Jean",
    ]);
  });

  it("ouvre la fenêtre de l'action au clic sur une ligne", async () => {
    const m = await open({ unfolded: '["people:jean-dupont"]' });
    (document.querySelector('.crm-line[data-action="appel"]') as HTMLElement).click();
    expect(m.hooked).toEqual([["onOpenAction", "appel", "clients.md"]]);
  });
});

describe("onglet Personnes : Nouvelle personne", () => {
  it("ouvre un champ qui a le curseur, et Entrée crée la personne sans entreprise", async () => {
    const m = await open();
    expect(document.querySelector(".crm-new-name")).toBeNull();
    buttonNamed("Nouvelle personne").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Nom de la personne");
    type(input, "  Léa Roy ");
    input.form?.requestSubmit();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callsTo(m, "createCrmPerson")).toEqual([
      ["createCrmPerson", "clients.md", "Léa Roy", null],
    ]);
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });

  it("ne crée rien avec un nom vide, et Échap ferme le champ", async () => {
    const m = await open();
    buttonNamed("Nouvelle personne").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    type(input, "   ");
    input.form?.requestSubmit();
    expect(callsTo(m, "createCrmPerson")).toEqual([]);
    press(input, "Escape");
    expect(document.querySelector(".crm-new-name")).toBeNull();
    buttonNamed("Nouvelle personne").click();
    expect((document.querySelector(".crm-new-name") as HTMLInputElement).value).toBe("");
  });

  it("garde le nom tapé et dit pourquoi quand Rust le refuse", async () => {
    const m = await open();
    buttonNamed("Nouvelle personne").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    type(input, "Jean Dupont");
    m.fail.next = "Une personne porte déjà ce nom.";
    input.form?.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.errors).toEqual([{ message: "Une personne porte déjà ce nom." }]);
    expect((document.querySelector(".crm-new-name") as HTMLInputElement).value).toBe("Jean Dupont");
  });

  it("ferme le champ en changeant d'onglet", async () => {
    await open();
    buttonNamed("Nouvelle personne").click();
    tabNamed("Entreprises").click();
    tabNamed("Personnes").click();
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });
});
