import { describe, expect, it } from "vitest";
import { crm } from "../../test-support/crm-fixture";
import { listsSample } from "../../test-support/crm-lists-fixture";
import {
  buttonNamed,
  callsTo,
  mountCrm,
  press,
  text,
  type,
} from "../../test-support/crm-view-fixture";
import { field } from "../../test-support/crm-window-fixture";
import "../theme.css";
import "../style.css";

const names = () =>
  [...document.querySelectorAll(".crm-node-company > .crm-node-row .crm-name")].map(
    (n) => n.textContent,
  );
const company = (key: string) =>
  document.querySelector(`.crm-node-company[data-company="${key}"]`) as HTMLElement;
const rowText = (element: Element) =>
  (element.querySelector(":scope > .crm-node-row") as HTMLElement).innerText
    .replace(/\s+/g, " ")
    .trim();
const search = () => document.querySelector(".crm-list-search") as HTMLInputElement;
const lines = (scope: ParentNode) =>
  [...scope.querySelectorAll(".crm-line")].map((l) => l.textContent);

const open = (options: Parameters<typeof mountCrm>[0] = {}) =>
  mountCrm({ crm: listsSample(), tab: "companies", ...options });

describe("onglet Entreprises : l'arbre", () => {
  it("montre NODATA d'abord, puis les entreprises dans l'ordre de Rust", async () => {
    await open();
    expect(names()).toEqual(["NODATA", "Acme", "Globex"]);
    expect(document.querySelector(".crm-name.nodata")?.tagName).toBe("SPAN");
  });

  it("dit pour chaque ligne le nombre de personnes, le retard, le jour et les actions ouvertes, même repliée", async () => {
    await open();
    expect(rowText(company("nodata"))).toBe("▸ NODATA 1 personne 1 à faire aujourd'hui 1 ouverte");
    expect(rowText(company("acme"))).toBe(
      "▸ Acme 2 personnes 1 en retard 1 à faire aujourd'hui 3 ouvertes",
    );
    expect(rowText(company("globex"))).toBe("▸ Globex 0 personne 0 ouverte");
    const late = company("acme").querySelector(".crm-badge.late") as HTMLElement;
    expect(getComputedStyle(late).backgroundColor).not.toBe(
      getComputedStyle(document.body).backgroundColor,
    );
    expect(company("acme").querySelector(".crm-badge.today")).not.toBeNull();
    expect(company("globex").querySelector(".crm-badge")).toBeNull();
  });

  it("déplie une entreprise sur ses personnes, et une personne sur ses actions ouvertes, sans les personnes", async () => {
    const m = await open();
    (company("acme").querySelector(".crm-unfold") as HTMLElement).click();
    const people = [...company("acme").querySelectorAll(".crm-node-person")] as HTMLElement[];
    expect(people.map((p) => p.dataset.person)).toEqual(["jean-dupont", "paul-martin"]);
    expect(rowText(people[0] as HTMLElement)).toBe(
      "▸ Jean Dupont 1 en retard 1 à faire aujourd'hui 2 ouvertes",
    );
    expect(m.kept).toEqual(['["acme"]']);
    (people[0]?.querySelector(".crm-unfold") as HTMLElement).click();
    expect(lines(company("acme"))).toEqual([
      "22 nov. · TODO · Refonte du site · Demande de devis",
      "25 nov. · Progress · Appeler Jean",
    ]);
    expect(m.kept[1]).toBe('["acme","member:acme:jean-dupont"]');
  });

  it("déplie NODATA sur les personnes sans entreprise", async () => {
    await open();
    (company("nodata").querySelector(".crm-unfold") as HTMLElement).click();
    expect(
      [...company("nodata").querySelectorAll(".crm-node-person")].map(
        (p) => (p as HTMLElement).dataset.person,
      ),
    ).toEqual(["marie-durand"]);
  });

  it("dit « Aucune personne. » d'une entreprise dépliée sans personne, et « Aucune action ouverte. » d'une personne sans action", async () => {
    const data = listsSample();
    data.people = data.people.map((p) => ({ ...p, openActions: [] }));
    await open({ crm: data, unfolded: '["globex","acme","member:acme:paul-martin"]' });
    expect(text(company("globex"), ".crm-list-empty")).toBe("Aucune personne.");
    expect(text(company("acme"), ".crm-node-person .crm-list-empty")).toBe(
      "Aucune action ouverte.",
    );
  });

  it("laisse de côté une personne dont la fiche n'existe plus", async () => {
    const data = listsSample();
    data.companies[0] = { ...(data.companies[0] as (typeof data.companies)[0]), people: ["parti"] };
    await open({ crm: data, unfolded: '["acme"]' });
    expect(company("acme").querySelectorAll(".crm-node-person")).toHaveLength(0);
    expect(text(company("acme"), ".crm-list-empty")).toBe("Aucune personne.");
  });

  it("ouvre la fenêtre de l'action au clic sur une ligne", async () => {
    await open({ unfolded: '["acme","member:acme:paul-martin"]' });
    (document.querySelector('.crm-line[data-action="relance"]') as HTMLElement).click();
    expect((field("title") as HTMLInputElement).value).toBe("Relancer Paul");
  });

  it("ouvre la fiche d'une entreprise et celle d'une personne au clic sur leur nom", async () => {
    const m = await open({ unfolded: '["acme"]' });
    (company("acme").querySelector(".crm-name") as HTMLElement).click();
    (company("acme").querySelector(".crm-node-person .crm-name") as HTMLElement).click();
    expect(m.fiches).toEqual(["clients/entreprises/acme.md", "clients/personnes/jean-dupont.md"]);
  });
});

describe("onglet Entreprises : la recherche", () => {
  it("cherche par nom sans majuscules ni accents, et masque NODATA pendant la recherche", async () => {
    await open();
    expect(search().placeholder).toBe("Rechercher une entreprise");
    type(search(), "ACM");
    expect(names()).toEqual(["Acme"]);
    type(search(), "  ");
    expect(names()).toEqual(["NODATA", "Acme", "Globex"]);
    type(search(), "zzz");
    expect(names()).toEqual([]);
  });

  it("garde le curseur dans le champ pendant la frappe", async () => {
    await open();
    search().focus();
    type(search(), "gl");
    expect(document.activeElement).toBe(search());
  });
});

describe("onglet Entreprises : Nouvelle entreprise", () => {
  it("crée l'entreprise au nom tapé, sans espaces autour", async () => {
    const m = await open();
    buttonNamed("Nouvelle entreprise").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Nom de l'entreprise");
    type(input, " Initech ");
    input.form?.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(callsTo(m, "createCrmCompany")).toEqual([["createCrmCompany", "clients.md", "Initech"]]);
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });

  it("ne crée rien avec un nom vide ; Échap ferme", async () => {
    const m = await open();
    buttonNamed("Nouvelle entreprise").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    input.form?.requestSubmit();
    expect(callsTo(m, "createCrmCompany")).toEqual([]);
    press(input, "Escape");
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });

  it("montre NODATA même sans entreprise", async () => {
    await open({ crm: crm() });
    expect(names()).toEqual(["NODATA"]);
  });
});
