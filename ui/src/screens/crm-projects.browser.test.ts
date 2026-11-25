import { describe, expect, it, vi } from "vitest";
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

const item = (name: string) =>
  document.querySelector(`.crm-project[data-project="${name}"]`) as HTMLElement;
const names = () => [...document.querySelectorAll(".crm-project-name")].map((n) => n.textContent);
const rowText = (element: Element) =>
  (element.querySelector(".crm-project-row") as HTMLElement).innerText.replace(/\s+/g, " ").trim();
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const open = (options: Parameters<typeof mountCrm>[0] = {}) =>
  mountCrm({ crm: listsSample(), tab: "projects", ...options });

describe("onglet Projets : la liste", () => {
  it("montre pour chaque projet sa pastille, son nom, ses actions ouvertes et en retard", async () => {
    await open();
    expect(names()).toEqual(["Refonte du site", "Salon"]);
    expect(rowText(item("refonte"))).toBe(
      "▸ Refonte du site 1 ouverte 1 en retard Renommer Supprimer",
    );
    expect(rowText(item("salon"))).toBe("▸ Salon 0 ouverte Renommer Supprimer");
    const swatch = item("refonte").querySelector(".crm-swatch") as HTMLElement;
    expect(swatch.getAttribute("aria-label")).toBe("Changer la couleur de Refonte du site (bleu)");
    expect(swatch.style.getPropertyValue("--label-color")).toBe("var(--palette-bleu)");
    expect(item("salon").querySelector(".crm-badge")).toBeNull();
  });

  it("dit qu'il n'y a aucun projet", async () => {
    await open({ crm: crm() });
    expect(text(document, ".crm-list-empty")).toBe("Aucun projet.");
  });

  it("déplie un projet sur ses actions ouvertes, avec les personnes et les entreprises, sans le projet", async () => {
    const m = await open();
    (item("refonte").querySelector(".crm-unfold") as HTMLElement).click();
    expect(
      [...item("refonte").querySelectorAll(".crm-line")].map((line) => line.textContent),
    ).toEqual(["22 nov. · TODO · Jean Dupont · Acme · Demande de devis"]);
    expect(m.kept).toEqual(['["projects:refonte"]']);
    (item("refonte").querySelector(".crm-line") as HTMLElement).click();
    expect(m.hooked).toEqual([["onOpenAction", "devis", "clients.md"]]);
  });

  it("dit « Aucune action ouverte. » d'un projet déplié sans action", async () => {
    await open({ unfolded: '["projects:salon"]' });
    expect(text(item("salon"), ".crm-list-empty")).toBe("Aucune action ouverte.");
  });
});

describe("onglet Projets : voir les actions", () => {
  it("ouvre le Kanban filtré sur ce seul projet", async () => {
    const m = await open();
    m.disk.crm = listsSample();
    const show = item("refonte").querySelector(".crm-project-show") as HTMLElement;
    expect(show.getAttribute("aria-label")).toBe("Voir les actions de Refonte du site");
    expect(show.title).toBe("Voir les actions de Refonte du site");
    const before = callsTo(m, "readCrm").length;
    show.click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm").length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(document.querySelector(".crm-board")).not.toBeNull());
    expect(tabNamed("Kanban").getAttribute("aria-selected")).toBe("true");
    expect(m.stored).toEqual(["kanban"]);
    const read = callsTo(m, "readCrm").at(-1) as readonly unknown[];
    expect(read[2]).toEqual({
      search: "",
      person: null,
      company: null,
      projects: ["refonte"],
      tags: [],
    });
    expect(document.querySelector('.crm-pill[aria-pressed="true"]')?.textContent).toBe(
      "Refonte du site",
    );
    expect(document.querySelector(".crm-board")).not.toBeNull();
  });

  it("remet à zéro les autres filtres", async () => {
    const m = await open();
    tabNamed("Kanban").click();
    type(document.querySelector(".crm-search") as HTMLInputElement, "devis");
    await vi.waitFor(() =>
      expect(callsTo(m, "readCrm").at(-1)?.[2]).toMatchObject({ search: "devis" }),
    );
    tabNamed("Projets").click();
    const before = callsTo(m, "readCrm").length;
    (item("refonte").querySelector(".crm-project-show") as HTMLElement).click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm").length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(document.querySelector(".crm-board")).not.toBeNull());
    expect((document.querySelector(".crm-search") as HTMLInputElement).value).toBe("");
  });
});

describe("onglet Projets : Nouveau projet", () => {
  it("crée le projet au nom tapé", async () => {
    const m = await open();
    buttonNamed("Nouveau projet").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Nom du projet");
    type(input, " Nouvelle usine ");
    input.form?.requestSubmit();
    await settle();
    expect(callsTo(m, "createCrmProject")).toEqual([
      ["createCrmProject", "clients.md", "Nouvelle usine"],
    ]);
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });

  it("ne crée rien avec un nom vide ; Échap ferme", async () => {
    const m = await open();
    buttonNamed("Nouveau projet").click();
    const input = document.querySelector(".crm-new-name") as HTMLInputElement;
    input.form?.requestSubmit();
    expect(callsTo(m, "createCrmProject")).toEqual([]);
    press(input, "Escape");
    expect(document.querySelector(".crm-new-name")).toBeNull();
  });
});

describe("onglet Projets : renommer", () => {
  const rename = () => document.querySelector(".crm-project-rename") as HTMLInputElement;

  it("remplace le nom par un champ qui a le curseur, Entrée le change", async () => {
    const m = await open();
    buttonNamed("Renommer Refonte du site").click();
    expect(rename().value).toBe("Refonte du site");
    expect(document.activeElement).toBe(rename());
    type(rename(), "  Refonte 2  ");
    press(rename(), "Enter");
    await settle();
    expect(callsTo(m, "changeCrmProject")).toEqual([
      ["changeCrmProject", "clients.md", "refonte", { kind: "rename", name: "Refonte 2" }],
    ]);
    expect(document.querySelector(".crm-project-rename")).toBeNull();
  });

  it("n'appelle pas Rust pour un nom vide ou inchangé", async () => {
    const m = await open();
    buttonNamed("Renommer Refonte du site").click();
    type(rename(), "   ");
    press(rename(), "Enter");
    await settle();
    buttonNamed("Renommer Refonte du site").click();
    press(rename(), "Enter");
    await settle();
    expect(callsTo(m, "changeCrmProject")).toEqual([]);
    expect(document.querySelector(".crm-project-rename")).toBeNull();
  });

  it("abandonne par Échap et en quittant le champ", async () => {
    const m = await open();
    buttonNamed("Renommer Salon").click();
    type(rename(), "Autre");
    press(rename(), "Escape");
    expect(document.querySelector(".crm-project-rename")).toBeNull();
    expect(names()).toEqual(["Refonte du site", "Salon"]);
    buttonNamed("Renommer Salon").click();
    rename().blur();
    expect(document.querySelector(".crm-project-rename")).toBeNull();
    expect(callsTo(m, "changeCrmProject")).toEqual([]);
  });

  it("garde le champ ouvert et dit pourquoi quand le nom est refusé", async () => {
    const m = await open();
    buttonNamed("Renommer Salon").click();
    type(rename(), "Refonte du site");
    m.fail.next = "Un projet porte déjà ce nom.";
    press(rename(), "Enter");
    await settle();
    expect(m.errors).toEqual([{ message: "Un projet porte déjà ce nom." }]);
    expect(rename().value).toBe("Refonte du site");
  });
});

describe("onglet Projets : couleur", () => {
  const swatches = () => [...document.querySelectorAll<HTMLElement>(".crm-palette-color")];

  it("ouvre les 10 couleurs de la palette dans l'ordre, grise celles des autres projets, marque la couleur du projet", async () => {
    await open();
    expect(document.querySelector(".crm-palette")).toBeNull();
    (item("refonte").querySelector(".crm-swatch") as HTMLElement).click();
    expect(swatches().map((s) => s.dataset.color)).toEqual([
      ...["rouge", "orange", "jaune", "vert", "turquoise"],
      ...["bleu", "violet", "rose", "marron", "ardoise"],
    ]);
    expect(
      swatches()
        .filter((s) => s.classList.contains("taken"))
        .map((s) => s.dataset.color),
    ).toEqual(["rouge"]);
    expect(
      swatches()
        .filter((s) => s.getAttribute("aria-pressed") === "true")
        .map((s) => s.dataset.color),
    ).toEqual(["bleu"]);
    expect(swatches()[0]?.getAttribute("aria-label")).toBe("rouge (déjà prise)");
    expect(swatches()[1]?.getAttribute("aria-label")).toBe("orange");
    expect(getComputedStyle(swatches()[0] as HTMLElement).opacity).toBe("0.3");
    expect(getComputedStyle(swatches()[1] as HTMLElement).opacity).toBe("1");
  });

  it("choisit même une couleur prise, et referme le choix", async () => {
    const m = await open();
    (item("refonte").querySelector(".crm-swatch") as HTMLElement).click();
    swatches()[0]?.click();
    await settle();
    expect(callsTo(m, "changeCrmProject")).toEqual([
      ["changeCrmProject", "clients.md", "refonte", { kind: "color", color: "rouge" }],
    ]);
    expect(document.querySelector(".crm-palette")).toBeNull();
  });

  it("referme le choix au second clic sur la pastille, et n'en ouvre qu'un à la fois", async () => {
    await open();
    (item("refonte").querySelector(".crm-swatch") as HTMLElement).click();
    expect(item("refonte").querySelector(".crm-swatch")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    (item("salon").querySelector(".crm-swatch") as HTMLElement).click();
    expect(document.querySelectorAll(".crm-palette")).toHaveLength(1);
    expect(item("salon").querySelector(".crm-palette")).not.toBeNull();
    (item("salon").querySelector(".crm-swatch") as HTMLElement).click();
    expect(document.querySelector(".crm-palette")).toBeNull();
  });
});

describe("onglet Projets : supprimer", () => {
  it("demande confirmation en disant ce que deviennent les actions, puis supprime", async () => {
    const m = await open();
    buttonNamed("Supprimer Refonte du site").click();
    await settle();
    expect(m.questions).toEqual([
      "Supprimer le projet « Refonte du site » ? Son action passe à « Sans projet ».",
    ]);
    expect(callsTo(m, "deleteCrmProject")).toEqual([["deleteCrmProject", "clients.md", "refonte"]]);
  });

  it("ne dit rien des actions d'un projet qui n'en a pas, et met le pluriel dès 2", async () => {
    const m = await open();
    buttonNamed("Supprimer Salon").click();
    await settle();
    expect(m.questions).toEqual(["Supprimer le projet « Salon » ?"]);
    const data = listsSample();
    data.actions = data.actions.map((a) => ({ ...a, project: "salon" }));
    const second = await open({ crm: data });
    buttonNamed("Supprimer Salon").click();
    await settle();
    expect(second.questions[0]).toBe(
      "Supprimer le projet « Salon » ? Ses 4 actions passent à « Sans projet ».",
    );
  });

  it("ne supprime rien si l'utilisateur refuse", async () => {
    const m = await open();
    m.answer.value = false;
    buttonNamed("Supprimer Salon").click();
    await settle();
    expect(callsTo(m, "deleteCrmProject")).toEqual([]);
  });
});
