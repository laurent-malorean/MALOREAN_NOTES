import { describe, expect, it } from "vitest";
import { action, company, person } from "../../test-support/crm-fixture";
import { listsSample, mountFiche } from "../../test-support/crm-lists-fixture";
import { press, type } from "../../test-support/crm-view-fixture";
import { field as windowField } from "../../test-support/crm-window-fixture";
import "../theme.css";
import "../style.css";
import { GONE_TEXT } from "./crm-fiche-view";

const q = (selector: string) => document.querySelector(selector) as HTMLElement;
const field = (key: string) => q(`.crm-fiche-field[data-field="${key}"]`);
const lines = (scope: ParentNode) =>
  [...scope.querySelectorAll(".crm-line")].map((l) => l.textContent);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const calls = (m: Awaited<ReturnType<typeof mountFiche>>, name: string) =>
  m.calls.filter((c) => c[0] === name);

/** Une entreprise Acme avec deux personnes, et une ancienne personne passée par elle. */
function withFormer() {
  const data = listsSample();
  data.people.push({
    ...person("luc-ancien", "Luc Ancien", "globex"),
    career: [
      { company: "acme", from: "2020-01-01", to: "2022-01-01" },
      { company: "globex", from: "2022-01-01", to: null },
    ],
  });
  data.actions.push(
    action("vieux", {
      ...{ title: "Ancien échange", status: "Done", open: false, date: "2021-05-01" },
      people: [{ person: "luc-ancien", company: "acme" }],
    }),
    action("ailleurs", {
      ...{ title: "Chez Globex", date: "2023-05-01" },
      people: [{ person: "luc-ancien", company: "globex" }],
    }),
  );
  data.companies = [
    { ...(data.companies[0] as (typeof data.companies)[0]) },
    { ...company("globex", "Globex"), people: ["luc-ancien"] },
  ];
  return data;
}

describe("fiche d'entreprise : les champs", () => {
  it("montre le nom, les quatre champs et leurs valeurs, « — » quand il n'y en a pas", async () => {
    const data = listsSample();
    data.companies[0] = {
      ...(data.companies[0] as (typeof data.companies)[0]),
      site: "https://acme.fr",
    };
    await mountFiche("company", "acme", data);
    expect(q(".crm-fiche-title").textContent).toBe("Acme");
    expect(["site", "secteur", "adresse", "telephone"].map((k) => field(k).textContent)).toEqual([
      "Sitehttps://acme.fr",
      "Secteur—",
      "Adresse—",
      "Téléphone—",
    ]);
    expect(field("secteur").querySelector(".empty")).not.toBeNull();
    expect(field("site").querySelector(".empty")).toBeNull();
  });

  it("modifie un champ en cliquant dessus : Entrée l'enregistre", async () => {
    const m = await mountFiche("company", "acme");
    (field("secteur").querySelector("button") as HTMLElement).click();
    const input = field("secteur").querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    type(input, "  Industrie ");
    press(input, "Enter");
    await settle();
    expect(calls(m, "changeCrmCompany")).toEqual([
      [
        "changeCrmCompany",
        "clients.md",
        "acme",
        { kind: "field", field: "secteur", value: "Industrie" },
      ],
    ]);
    expect(document.querySelector(".crm-fiche-input")).toBeNull();
  });

  it("enregistre en quittant le champ", async () => {
    const m = await mountFiche("company", "acme");
    (field("adresse").querySelector("button") as HTMLElement).click();
    const input = field("adresse").querySelector("input") as HTMLInputElement;
    type(input, "12 rue des Lilas");
    input.blur();
    await settle();
    expect(calls(m, "changeCrmCompany")).toHaveLength(1);
  });

  it("n'appelle rien pour une valeur inchangée, et Échap abandonne", async () => {
    const m = await mountFiche("company", "acme");
    (field("site").querySelector("button") as HTMLElement).click();
    press(field("site").querySelector("input") as HTMLElement, "Enter");
    await settle();
    (field("site").querySelector("button") as HTMLElement).click();
    const input = field("site").querySelector("input") as HTMLInputElement;
    type(input, "https://x.fr");
    press(input, "Escape");
    expect(document.querySelector(".crm-fiche-input")).toBeNull();
    expect(calls(m, "changeCrmCompany")).toEqual([]);
  });

  it("efface un champ vidé, mais un nom vidé reprend sa valeur", async () => {
    const data = listsSample();
    data.companies[0] = {
      ...(data.companies[0] as (typeof data.companies)[0]),
      site: "https://acme.fr",
    };
    const m = await mountFiche("company", "acme", data);
    (field("site").querySelector("button") as HTMLElement).click();
    const input = field("site").querySelector("input") as HTMLInputElement;
    type(input, "");
    press(input, "Enter");
    await settle();
    expect(calls(m, "changeCrmCompany")[0]?.[3]).toEqual({
      kind: "field",
      field: "site",
      value: "",
    });
    q(".crm-fiche-title").click();
    const name = q(".crm-fiche-input") as HTMLInputElement;
    expect(name.value).toBe("Acme");
    type(name, "  ");
    press(name, "Enter");
    await settle();
    expect(calls(m, "changeCrmCompany")).toHaveLength(1);
  });

  it("renomme l'entreprise en cliquant sur son nom", async () => {
    const m = await mountFiche("company", "acme");
    q(".crm-fiche-title").click();
    type(q(".crm-fiche-input") as HTMLInputElement, "Acme SA");
    press(q(".crm-fiche-input"), "Enter");
    await settle();
    expect(calls(m, "changeCrmCompany")).toEqual([
      ["changeCrmCompany", "clients.md", "acme", { kind: "rename", name: "Acme SA" }],
    ]);
  });

  it("garde ce qui est tapé quand l'écran est relu pendant la saisie", async () => {
    const m = await mountFiche("company", "acme");
    (field("secteur").querySelector("button") as HTMLElement).click();
    type(field("secteur").querySelector("input") as HTMLInputElement, "Indus");
    await m.view.reload();
    const input = field("secteur").querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Indus");
    expect(document.activeElement).toBe(input);
  });

  it("dit pourquoi quand Rust refuse, et relit", async () => {
    const m = await mountFiche("company", "acme");
    q(".crm-fiche-title").click();
    type(q(".crm-fiche-input") as HTMLInputElement, "Globex");
    m.fail.next = "Une entreprise porte déjà ce nom.";
    press(q(".crm-fiche-input"), "Enter");
    await settle();
    expect(m.errors).toEqual([{ message: "Une entreprise porte déjà ce nom." }]);
    expect(q(".crm-fiche-title").textContent).toBe("Acme");
  });
});

describe("fiche d'entreprise : les notes", () => {
  it("s'enregistrent en quittant le champ, seulement si elles ont changé", async () => {
    const m = await mountFiche("company", "acme");
    const notes = q(".crm-fiche-notes") as HTMLTextAreaElement;
    expect(notes.placeholder).toBe("Notes libres");
    notes.focus();
    notes.blur();
    await settle();
    expect(calls(m, "changeCrmCompany")).toEqual([]);
    q(".crm-fiche-notes").focus();
    type(q(".crm-fiche-notes") as HTMLInputElement, "Client depuis 2020");
    (q(".crm-fiche-notes") as HTMLElement).blur();
    await settle();
    expect(calls(m, "changeCrmCompany")).toEqual([
      ["changeCrmCompany", "clients.md", "acme", { kind: "notes", notes: "Client depuis 2020" }],
    ]);
  });

  it("gardent le texte tapé si Rust refuse", async () => {
    const m = await mountFiche("company", "acme");
    q(".crm-fiche-notes").focus();
    type(q(".crm-fiche-notes") as HTMLInputElement, "À garder");
    m.fail.next = "Disque plein";
    (q(".crm-fiche-notes") as HTMLElement).blur();
    await settle();
    expect((q(".crm-fiche-notes") as HTMLTextAreaElement).value).toBe("À garder");
    expect(m.errors).toHaveLength(1);
  });
});

describe("fiche d'entreprise : les personnes", () => {
  it("liste les personnes dans l'ordre de Rust, chacune avec ses actions du plus récent au plus ancien", async () => {
    await mountFiche("company", "acme");
    const blocks = [...document.querySelectorAll<HTMLElement>(".crm-fiche-person")];
    expect(blocks.map((b) => b.dataset.person)).toEqual(["jean-dupont", "paul-martin"]);
    expect(lines(blocks[0] as HTMLElement)).toEqual([
      "25 nov. · Progress · Appeler Jean",
      "22 nov. · TODO · Refonte du site · Demande de devis",
      "20 nov. · Done · Contrat signé",
    ]);
    expect(blocks[0]?.querySelector(".crm-fiche-role")?.textContent).toBe(
      "Responsable maintenance",
    );
  });

  it("ne montre que les 10 dernières actions d'une personne", async () => {
    const data = listsSample();
    const many = Array.from({ length: 12 }, (_, i) =>
      action(`a${String(i).padStart(2, "0")}`, {
        ...{ title: `Action ${String(i)}`, date: `2026-10-${String(i + 1).padStart(2, "0")}` },
        people: [{ person: "paul-martin", company: "acme" }],
      }),
    );
    data.actions = many;
    data.people = data.people.map((p) =>
      p.name === "paul-martin"
        ? { ...p, openActions: many.map((a) => a.name), closedActions: [] }
        : p,
    );
    await mountFiche("company", "acme", data);
    const block = q('.crm-fiche-person[data-person="paul-martin"]');
    expect(lines(block)).toHaveLength(10);
    expect(lines(block)[0]).toContain("Action 11");
  });

  it("ouvre la fiche de la personne par son nom et par « Toutes les actions »", async () => {
    const m = await mountFiche("company", "acme");
    const block = q('.crm-fiche-person[data-person="jean-dupont"]');
    (block.querySelector(".crm-name") as HTMLElement).click();
    (block.querySelector(".crm-fiche-all") as HTMLElement).click();
    expect(m.opened).toEqual([
      "clients/personnes/jean-dupont.md",
      "clients/personnes/jean-dupont.md",
    ]);
    expect(block.querySelector(".crm-fiche-all")?.getAttribute("aria-label")).toBe(
      "Toutes les actions de Jean Dupont",
    );
  });

  it("ouvre la fenêtre de l'action au clic sur une ligne", async () => {
    await mountFiche("company", "acme");
    q('.crm-line[data-action="relance"]').click();
    expect((windowField("title") as HTMLInputElement).value).toBe("Relancer Paul");
  });

  it("dit « Aucune personne. » d'une entreprise sans personne, « Aucune action. » d'une personne sans action", async () => {
    await mountFiche("company", "globex");
    expect(q(".crm-list-empty").textContent).toBe("Aucune personne.");
    const data = listsSample();
    data.people = data.people.map((p) => ({ ...p, openActions: [], closedActions: [] }));
    await mountFiche("company", "acme", data);
    expect(q(".crm-fiche-person .crm-list-empty").textContent).toBe("Aucune action.");
  });

  it("laisse de côté une personne dont la fiche n'existe plus", async () => {
    const data = listsSample();
    data.companies[0] = { ...(data.companies[0] as (typeof data.companies)[0]), people: ["parti"] };
    await mountFiche("company", "acme", data);
    expect(document.querySelectorAll(".crm-fiche > .crm-fiche-person")).toHaveLength(0);
    expect(q(".crm-list-empty").textContent).toBe("Aucune personne.");
  });

  it("crée une personne déjà rattachée à l'entreprise", async () => {
    const m = await mountFiche("company", "acme");
    (document.querySelector(".crm-fiche-section-head .crm-new-button") as HTMLElement).click();
    const input = q(".crm-new-name") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Nom de la personne");
    type(input, " Léa Roy ");
    input.form?.requestSubmit();
    await settle();
    expect(calls(m, "createCrmPerson")).toEqual([
      ["createCrmPerson", "clients.md", "Léa Roy", "acme"],
    ]);
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });

  it("ne crée rien avec un nom vide ; Échap ferme ; un nom refusé reste dans le champ", async () => {
    const m = await mountFiche("company", "acme");
    const open = () =>
      (document.querySelector(".crm-fiche-section-head .crm-new-button") as HTMLElement).click();
    open();
    q(".crm-new-name").closest("form")?.requestSubmit();
    expect(calls(m, "createCrmPerson")).toEqual([]);
    press(q(".crm-new-name"), "Escape");
    expect(document.querySelector(".crm-new-name")).toBeNull();
    open();
    type(q(".crm-new-name") as HTMLInputElement, "Jean Dupont");
    m.fail.next = "Une personne porte déjà ce nom.";
    q(".crm-new-name").closest("form")?.requestSubmit();
    await settle();
    expect((q(".crm-new-name") as HTMLInputElement).value).toBe("Jean Dupont");
    expect(m.errors).toHaveLength(1);
  });
});

describe("fiche d'entreprise : anciennes personnes", () => {
  it("montre, repliée, la section des personnes passées par l'entreprise avec leurs actions d'alors", async () => {
    await mountFiche("company", "acme", withFormer());
    const former = q(".crm-former") as HTMLDetailsElement;
    expect(former.open).toBe(false);
    expect(former.querySelector("summary")?.textContent).toBe("Anciennes personnes (1)");
    expect(lines(former)).toEqual(["1 mai 2021 · Done · Ancien échange"]);
    expect(former.querySelector(".crm-fiche-person")?.getAttribute("data-person")).toBe(
      "luc-ancien",
    );
  });

  it("n'existe pas sans ancienne personne", async () => {
    await mountFiche("company", "acme");
    expect(document.querySelector(".crm-former")).toBeNull();
  });
});

describe("fiche d'entreprise : supprimer", () => {
  it("demande confirmation en disant que les personnes passent à NODATA, puis supprime", async () => {
    const m = await mountFiche("company", "acme");
    q(".crm-fiche-delete").click();
    await settle();
    expect(q(".crm-fiche-delete").textContent).toBe("Supprimer l'entreprise");
    expect(m.questions).toEqual([
      "Supprimer l'entreprise « Acme » ? Ses 2 personnes passent à NODATA.",
    ]);
    expect(calls(m, "deleteCrmCompany")).toEqual([["deleteCrmCompany", "clients.md", "acme"]]);
  });

  it("ne dit rien des personnes d'une entreprise qui n'en a pas, et ne supprime rien si on refuse", async () => {
    const m = await mountFiche("company", "globex");
    m.answer.value = false;
    q(".crm-fiche-delete").click();
    await settle();
    expect(m.questions).toEqual(["Supprimer l'entreprise « Globex » ?"]);
    expect(calls(m, "deleteCrmCompany")).toEqual([]);
  });

  it("dit que la fiche n'existe plus quand l'entreprise a disparu", async () => {
    const m = await mountFiche("company", "acme");
    m.disk.crm.companies = [];
    await m.view.reload();
    expect(q(".crm-fiche-gone").textContent).toBe(GONE_TEXT);
    expect(GONE_TEXT).toBe("Cette fiche n'existe plus.");
  });

  it("ne dessine plus rien une fois détruite", async () => {
    const m = await mountFiche("company", "acme");
    m.view.destroy();
    expect(document.querySelector(".crm-fiche")).toBeNull();
    const before = m.calls.length;
    await m.view.reload();
    expect(m.calls.length).toBe(before + 1);
    expect(document.querySelector(".crm-fiche")).toBeNull();
  });
});
