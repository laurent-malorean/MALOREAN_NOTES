import { describe, expect, it } from "vitest";
import { company } from "../../test-support/crm-fixture";
import { listsSample, mountFiche } from "../../test-support/crm-lists-fixture";
import { press, type } from "../../test-support/crm-view-fixture";
import { field as windowField } from "../../test-support/crm-window-fixture";
import "../theme.css";
import "../style.css";

const q = (selector: string) => document.querySelector(selector) as HTMLElement;
const field = (key: string) => q(`.crm-fiche-field[data-field="${key}"]`);
const lines = (scope: ParentNode) =>
  [...scope.querySelectorAll(".crm-line")].map((l) => l.textContent);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const calls = (m: Awaited<ReturnType<typeof mountFiche>>, name: string) =>
  m.calls.filter((c) => c[0] === name);
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

describe("fiche de personne : les champs", () => {
  it("montre le nom, les quatre champs, l'entreprise et le parcours", async () => {
    await mountFiche("person", "jean-dupont");
    expect(q(".crm-fiche-title").textContent).toBe("Jean Dupont");
    expect(["fonction", "email", "telephone", "linkedin"].map((k) => field(k).textContent)).toEqual(
      [
        "FonctionResponsable maintenance",
        "E-mailjean@acme.fr",
        "Téléphone06 12 34 56 78",
        "LinkedIn—",
      ],
    );
    expect(q(".crm-fiche-company").textContent).toBe("EntrepriseAcmeChanger d'entreprise");
    expect([...document.querySelectorAll(".crm-career li")].map((l) => l.textContent)).toEqual([
      "Acme · 2026-03-01 →",
    ]);
  });

  it("n'a pas de parcours à montrer sans passage", async () => {
    await mountFiche("person", "paul-martin");
    expect(document.querySelector(".crm-career")).toBeNull();
  });

  it("modifie un champ en cliquant dessus", async () => {
    const m = await mountFiche("person", "jean-dupont");
    (field("linkedin").querySelector("button") as HTMLElement).click();
    type(
      field("linkedin").querySelector("input") as HTMLInputElement,
      "https://linkedin.com/in/jean",
    );
    press(field("linkedin").querySelector("input") as HTMLElement, "Enter");
    await settle();
    expect(calls(m, "changeCrmPerson")).toEqual([
      [
        "changeCrmPerson",
        "clients.md",
        "jean-dupont",
        { kind: "field", field: "linkedin", value: "https://linkedin.com/in/jean" },
      ],
    ]);
    expect(calls(m, "crmEmailIsKnown")).toEqual([]);
  });

  it("renomme la personne", async () => {
    const m = await mountFiche("person", "jean-dupont");
    q(".crm-fiche-title").click();
    type(q(".crm-fiche-input") as HTMLInputElement, "Jean-Paul Dupont");
    press(q(".crm-fiche-input"), "Enter");
    await settle();
    expect(calls(m, "changeCrmPerson")[0]?.[3]).toEqual({
      kind: "rename",
      name: "Jean-Paul Dupont",
    });
  });

  it("enregistre ses notes en quittant le champ", async () => {
    const m = await mountFiche("person", "jean-dupont");
    q(".crm-fiche-notes").focus();
    type(q(".crm-fiche-notes") as HTMLInputElement, "Rappeler");
    q(".crm-fiche-notes").blur();
    await settle();
    expect(calls(m, "changeCrmPerson")[0]?.[3]).toEqual({ kind: "notes", notes: "Rappeler" });
  });
});

describe("fiche de personne : e-mail déjà connu", () => {
  const setEmail = async (m: Awaited<ReturnType<typeof mountFiche>>, value: string) => {
    (field("email").querySelector("button") as HTMLElement).click();
    type(field("email").querySelector("input") as HTMLInputElement, value);
    press(field("email").querySelector("input") as HTMLElement, "Enter");
    await settle();
    return m;
  };

  it("est signalé à la saisie sans bloquer l'enregistrement", async () => {
    const m = await mountFiche("person", "jean-dupont");
    m.disk.crm.people[0] = {
      ...(m.disk.crm.people[0] as (typeof m.disk.crm.people)[0]),
      email: "connu@acme.fr",
    };
    await setEmail(m, "connu@acme.fr");
    expect(calls(m, "crmEmailIsKnown")).toEqual([
      ["crmEmailIsKnown", "clients.md", "connu@acme.fr", "jean-dupont"],
    ]);
    expect(calls(m, "changeCrmPerson")).toHaveLength(1);
    expect(q(".crm-fiche-warning").textContent).toBe(
      "Cet e-mail est déjà connu d'une autre personne du CRM.",
    );
  });

  it("ne dit rien d'un e-mail inconnu, ni d'un e-mail vidé", async () => {
    const m = await mountFiche("person", "jean-dupont");
    await setEmail(m, "nouveau@acme.fr");
    expect(document.querySelector(".crm-fiche-warning")).toBeNull();
    await setEmail(m, "");
    expect(calls(m, "crmEmailIsKnown")).toHaveLength(1);
    expect(calls(m, "changeCrmPerson")).toHaveLength(2);
    expect(document.querySelector(".crm-fiche-warning")).toBeNull();
  });
});

describe("fiche de personne : l'entreprise", () => {
  it("ouvre la fiche de l'entreprise, ou dit NODATA sans lien", async () => {
    const m = await mountFiche("person", "jean-dupont");
    q(".crm-fiche-company .crm-name").click();
    expect(m.opened).toEqual(["clients/entreprises/acme.md"]);
    await mountFiche("person", "marie-durand");
    expect(q(".crm-fiche-company .crm-name").tagName).toBe("SPAN");
    expect(q(".crm-fiche-company .crm-name").textContent).toBe("NODATA");
  });

  it("change d'entreprise : NODATA en tête, le jour d'aujourd'hui d'office, « Valider » appelle Rust", async () => {
    const data = listsSample();
    data.companies.push(company("initech", "Initech"));
    const m = await mountFiche("person", "jean-dupont", data);
    button("Changer d'entreprise").click();
    const select = q(".crm-career-form select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "NODATA",
      "Acme",
      "Globex",
      "Initech",
    ]);
    expect(select.value).toBe("acme");
    const day = q(".crm-career-form input") as HTMLInputElement;
    expect(day.value).toBe("2026-11-25");
    expect(day.getAttribute("aria-label")).toBe("Jour du changement");
    select.value = "initech";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    day.value = "2026-12-01";
    day.dispatchEvent(new Event("input", { bubbles: true }));
    button("Valider").click();
    await settle();
    expect(calls(m, "changeCrmPerson")).toEqual([
      [
        "changeCrmPerson",
        "clients.md",
        "jean-dupont",
        { kind: "company", company: "initech", day: "2026-12-01" },
      ],
    ]);
    expect(document.querySelector(".crm-career-form")).toBeNull();
  });

  it("choisit NODATA : aucune entreprise", async () => {
    const m = await mountFiche("person", "jean-dupont");
    button("Changer d'entreprise").click();
    const select = q(".crm-career-form select") as HTMLSelectElement;
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    button("Valider").click();
    await settle();
    expect(calls(m, "changeCrmPerson")[0]?.[3]).toMatchObject({ kind: "company", company: null });
  });

  it("propose NODATA d'office à une personne qui n'a pas d'entreprise", async () => {
    await mountFiche("person", "marie-durand");
    button("Changer d'entreprise").click();
    expect((q(".crm-career-form select") as HTMLSelectElement).value).toBe("");
  });

  it("annule sans rien changer ; un jour vidé ne change rien ; un refus garde le formulaire", async () => {
    const m = await mountFiche("person", "jean-dupont");
    button("Changer d'entreprise").click();
    button("Annuler").click();
    expect(document.querySelector(".crm-career-form")).toBeNull();
    button("Changer d'entreprise").click();
    const day = q(".crm-career-form input") as HTMLInputElement;
    day.value = "";
    day.dispatchEvent(new Event("input", { bubbles: true }));
    button("Valider").click();
    await settle();
    expect(calls(m, "changeCrmPerson")).toEqual([]);
    day.value = "2026-12-01";
    day.dispatchEvent(new Event("input", { bubbles: true }));
    m.fail.next = "Jour invalide";
    button("Valider").click();
    await settle();
    expect(q(".crm-career-form")).not.toBeNull();
    expect(m.errors).toHaveLength(1);
  });
});

describe("fiche de personne : ses actions", () => {
  it("montre les ouvertes puis les terminées, du plus récent au plus ancien, avec leur nombre", async () => {
    await mountFiche("person", "jean-dupont");
    const groups = [...document.querySelectorAll<HTMLElement>(".crm-fiche-actions")];
    expect(groups.map((g) => g.querySelector("h3")?.textContent)).toEqual([
      "Ouvertes (2)",
      "Terminées (1)",
    ]);
    expect(lines(groups[0] as HTMLElement)).toEqual([
      "25 nov. · Progress · Appeler Jean",
      "22 nov. · TODO · Refonte du site · Demande de devis",
    ]);
    expect(lines(groups[1] as HTMLElement)).toEqual(["20 nov. · Done · Contrat signé"]);
  });

  it("dit quand il n'y en a pas", async () => {
    await mountFiche("person", "paul-martin");
    const empties = [...document.querySelectorAll(".crm-fiche-actions .crm-list-empty")];
    expect(empties.map((e) => e.textContent)).toEqual(["Aucune action terminée."]);
    const data = listsSample();
    data.people = data.people.map((p) => ({ ...p, openActions: [] }));
    await mountFiche("person", "paul-martin", data);
    expect(document.querySelector(".crm-fiche-actions .crm-list-empty")?.textContent).toBe(
      "Aucune action ouverte.",
    );
  });

  it("ouvre la fenêtre de l'action au clic, et celle d'une nouvelle action pour cette personne", async () => {
    await mountFiche("person", "jean-dupont");
    q('.crm-line[data-action="appel"]').click();
    expect((windowField("title") as HTMLInputElement).value).toBe("Appeler Jean");
    button("Nouvelle action").click();
    expect(document.querySelectorAll(".crm-aw")).toHaveLength(1);
    expect(q(".crm-aw-heading").textContent).toBe("Nouvelle action");
    expect((windowField("title") as HTMLInputElement).value).toBe("");
    expect(q(".crm-aw-people").textContent).toContain("Jean Dupont");
  });
});

describe("fiche de personne : supprimer", () => {
  it("demande confirmation en disant que les actions restent, puis supprime", async () => {
    const m = await mountFiche("person", "jean-dupont");
    q(".crm-fiche-delete").click();
    await settle();
    expect(q(".crm-fiche-delete").textContent).toBe("Supprimer la personne");
    expect(m.questions).toEqual([
      "Supprimer la personne « Jean Dupont » ? Elle est retirée de ses 3 actions, qui restent.",
    ]);
    expect(calls(m, "deleteCrmPerson")).toEqual([["deleteCrmPerson", "clients.md", "jean-dupont"]]);
  });

  it("ne dit rien des actions d'une personne qui n'en a pas, et ne supprime rien si on refuse", async () => {
    const data = listsSample();
    data.people = data.people.map((p) => ({ ...p, openActions: [] }));
    const m = await mountFiche("person", "paul-martin", data);
    m.answer.value = false;
    q(".crm-fiche-delete").click();
    await settle();
    expect(m.questions).toEqual(["Supprimer la personne « Paul Martin » ?"]);
    expect(calls(m, "deleteCrmPerson")).toEqual([]);
  });

  it("met le singulier pour une seule action", async () => {
    const m = await mountFiche("person", "paul-martin");
    q(".crm-fiche-delete").click();
    await settle();
    expect(m.questions[0]).toBe(
      "Supprimer la personne « Paul Martin » ? Elle est retirée de son action, qui reste.",
    );
  });
});
