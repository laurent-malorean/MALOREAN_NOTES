import { describe, expect, it, vi } from "vitest";
import { action, crm, person as personNamed, sample } from "../../test-support/crm-fixture";
import {
  buttonNamed,
  callsTo,
  column,
  dayColumn,
  mountCrm,
  press,
  type,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";
import { NOBODY } from "./crm-quick-add";

const title = () =>
  document.querySelector<HTMLInputElement>(".crm-quick-title") as HTMLInputElement;
const person = () =>
  document.querySelector<HTMLSelectElement>(".crm-quick-person") as HTMLSelectElement;
const open = (status: string) =>
  (column(status).querySelector(".crm-add-action") as HTMLButtonElement).click();
const enter = () =>
  title().form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

describe("CRM : ajout rapide", () => {
  it("propose « + Ajouter une action » au pied de chaque colonne ouverte, et pas des colonnes terminées", async () => {
    await mountCrm();
    for (const status of ["TODO", "Progress", "WaitingFor"])
      expect(column(status).querySelector(".crm-add-action")?.textContent).toBe(
        "+ Ajouter une action",
      );
    expect(column("Done").querySelector(".crm-add-action")).toBeNull();
    expect(column("Cancel").querySelector(".crm-add-action")).toBeNull();
  });

  it("ouvre une ligne : un champ, la liste Personne, le focus dans le champ", async () => {
    await mountCrm();
    open("Progress");
    expect(title().placeholder).toBe("Titre de l'action");
    expect(title().getAttribute("aria-label")).toBe("Titre de l'action");
    expect(document.activeElement).toBe(title());
    expect(column("Progress").contains(title())).toBe(true);
    expect(column("Progress").querySelector(".crm-add-action")).toBeNull();
  });

  it("liste « — Sans personne — » en tête, choisi d'office, puis chaque personne avec son entreprise", async () => {
    await mountCrm();
    open("TODO");
    expect([...person().options].map((o) => o.textContent)).toEqual([
      NOBODY,
      "Jean Dupont · Acme",
      "Marie Durand",
    ]);
    expect(person().value).toBe("");
    expect(NOBODY).toBe("— Sans personne —");
    expect(person().getAttribute("aria-label")).toBe("Personne");
  });

  it("Entrée crée l'action dans le statut de la colonne, aujourd'hui, et la ligne reste ouverte", async () => {
    const m = await mountCrm();
    open("Progress");
    type(title(), "  Rappeler  ");
    enter();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]).toEqual([
      "createCrmAction",
      "clients.md",
      {
        ...{ title: "Rappeler", status: "Progress", date: null, people: [], channel: null },
        ...{ project: null, color: null, tags: [], linkedNotes: [], description: "" },
      },
    ]);
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    expect(title().value).toBe("");
    expect(document.activeElement).toBe(title());
  });

  it("ne crée rien d'un titre vide ou fait d'espaces", async () => {
    const m = await mountCrm();
    open("TODO");
    enter();
    type(title(), "   ");
    enter();
    await new Promise((r) => setTimeout(r, 30));
    expect(callsTo(m, "createCrmAction")).toHaveLength(0);
  });

  it("Échap ferme la ligne et rend le bouton", async () => {
    await mountCrm();
    open("TODO");
    press(title(), "Escape");
    expect(document.querySelector(".crm-quick-add")).toBeNull();
    expect(column("TODO").querySelector(".crm-add-action")).not.toBeNull();
  });

  it("garde la ligne ouverte pour une autre touche qu'Échap", async () => {
    await mountCrm();
    open("TODO");
    press(title(), "a");
    expect(document.querySelector(".crm-quick-add")).not.toBeNull();
  });

  it("n'ouvre qu'une ligne à la fois", async () => {
    await mountCrm();
    open("TODO");
    open("Progress");
    expect(document.querySelectorAll(".crm-quick-add")).toHaveLength(1);
    expect(column("Progress").querySelector(".crm-quick-add")).not.toBeNull();
  });

  it("donne la personne choisie à l'action, et la garde pour la suivante", async () => {
    const m = await mountCrm();
    open("TODO");
    person().value = "marie-durand";
    person().dispatchEvent(new Event("change", { bubbles: true }));
    type(title(), "Un");
    enter();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]?.[2]).toMatchObject({ people: ["marie-durand"] });
    await vi.waitFor(() => expect(person().value).toBe("marie-durand"));
    press(title(), "Escape");
    open("Progress");
    expect(person().value).toBe("marie-durand");
  });

  it("revient à « Sans personne » quand la dernière personne choisie n'existe plus", async () => {
    const m = await mountCrm();
    open("TODO");
    person().value = "marie-durand";
    person().dispatchEvent(new Event("change", { bubbles: true }));
    press(title(), "Escape");
    m.disk.crm = crm({ people: [personNamed("autre", "Autre")], actions: [action("a")] });
    await m.view.reload();
    open("TODO");
    expect(person().value).toBe("");
  });

  it("donne à l'action le projet filtré, s'il n'y en a qu'un", async () => {
    const m = await mountCrm();
    buttonNamed("Refonte du site").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    open("TODO");
    type(title(), "Avec projet");
    enter();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]?.[2]).toMatchObject({ project: "refonte" });
  });

  it("ne donne pas de projet quand deux sont filtrés, ni quand aucun ne l'est", async () => {
    const data = sample();
    data.projects.push({
      ...(data.projects[0] as (typeof data.projects)[number]),
      name: "autre",
      title: "Autre",
    });
    const m = await mountCrm({ crm: data });
    buttonNamed("Refonte du site").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    buttonNamed("Autre").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(3));
    open("TODO");
    type(title(), "Deux");
    enter();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]?.[2]).toMatchObject({ project: null });
  });

  it("garde ce qui est tapé quand l'écran se redessine", async () => {
    const m = await mountCrm();
    open("TODO");
    type(title(), "En cours");
    title().setSelectionRange(2, 4);
    await m.view.reload();
    expect(title().value).toBe("En cours");
    expect(document.activeElement).toBe(title());
    expect([title().selectionStart, title().selectionEnd]).toEqual([2, 4]);
  });

  it("rend le titre tapé quand la création est refusée, et dit pourquoi", async () => {
    const m = await mountCrm();
    open("TODO");
    type(title(), "Refusé");
    m.fail.next = "disque plein";
    enter();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "disque plein" }]));
    await vi.waitFor(() => expect(title().value).toBe("Refusé"));
  });

  it("ne rend pas le titre refusé s'il a été remplacé entre-temps", async () => {
    const m = await mountCrm();
    open("TODO");
    type(title(), "Refusé");
    m.fail.next = "disque plein";
    m.delays.push(40);
    enter();
    type(title(), "Autre");
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
    await vi.waitFor(() => expect(title().value).toBe("Autre"));
  });
});

describe("CRM : ajout rapide dans Ma semaine", () => {
  it("propose « + Ajouter une action » au pied de chaque jour, pas de « En retard »", async () => {
    await mountCrm({ tab: "week" });
    expect(document.querySelectorAll(".crm-week .crm-add-action")).toHaveLength(7);
    expect(document.querySelector(".crm-column.late .crm-add-action")).toBeNull();
  });

  it("ouvre la fenêtre de l'action, sans ligne d'ajout rapide", async () => {
    await mountCrm({ tab: "week" });
    (dayColumn("2026-11-27").querySelector(".crm-add-action") as HTMLButtonElement).click();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
    expect(document.querySelector(".crm-quick-add")).toBeNull();
  });
});
