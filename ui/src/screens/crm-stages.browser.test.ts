import { beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  buttonNamed,
  callsTo,
  column,
  drag,
  inside,
  mountCrm,
  type MountedCrm,
  press,
  type,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";

const field = () =>
  document.querySelector<HTMLInputElement>(".crm-stage-input") as HTMLInputElement;
const stages = (m: MountedCrm) => callsTo(m, "changeCrmStages").map((call) => call[2]);

// Les colonnes ont 272 points au moins : le cadre doit être assez large pour que le pointeur les atteigne.
beforeAll(() => page.viewport(1600, 900));

describe("CRM : étapes", () => {
  it("n'offre « × » et le renommage qu'aux étapes, pas à TODO, Done et Cancel", async () => {
    await mountCrm();
    expect(document.querySelectorAll(".crm-stage-remove")).toHaveLength(2);
    expect(column("Progress").querySelector(".crm-stage-remove")?.getAttribute("aria-label")).toBe(
      "Retirer l'étape Progress",
    );
    for (const status of ["TODO", "Done", "Cancel"]) {
      expect(column(status).querySelector(".crm-stage-remove")).toBeNull();
      expect(column(status).querySelector(".crm-stage-name")).toBeNull();
    }
    expect(column("Progress").querySelector(".crm-stage-name")?.textContent).toBe("Progress");
  });

  it("place « + Ajouter une étape » entre la dernière étape et « Done »", async () => {
    await mountCrm();
    const board = [...(document.querySelector(".crm-board") as HTMLElement).children];
    expect(board.map((c) => (c as HTMLElement).dataset.status ?? "tuile")).toEqual([
      "TODO",
      "Progress",
      "WaitingFor",
      "tuile",
      "Done",
      "Cancel",
    ]);
    expect(buttonNamed("+ Ajouter une étape")).toBeDefined();
  });

  it("ajoute une étape : le champ « Nom de l'étape » s'ouvre, Entrée la crée", async () => {
    const m = await mountCrm();
    buttonNamed("+ Ajouter une étape").click();
    expect(field().getAttribute("aria-label")).toBe("Nom de l'étape");
    expect(document.activeElement).toBe(field());
    type(field(), "  Devis ");
    press(field(), "Enter");
    await vi.waitFor(() => expect(stages(m)).toEqual([{ kind: "add", name: "Devis" }]));
    await vi.waitFor(() => expect(document.querySelector(".crm-stage-input")).toBeNull());
    expect(buttonNamed("+ Ajouter une étape")).toBeDefined();
  });

  it("annule l'ajout par Échap, sans rien demander à Rust", async () => {
    const m = await mountCrm();
    buttonNamed("+ Ajouter une étape").click();
    type(field(), "Devis");
    press(field(), "Escape");
    expect(document.querySelector(".crm-stage-input")).toBeNull();
    expect(stages(m)).toEqual([]);
  });

  it("annule le champ quand l'utilisateur le quitte", async () => {
    const m = await mountCrm();
    buttonNamed("+ Ajouter une étape").click();
    field().blur();
    expect(document.querySelector(".crm-stage-input")).toBeNull();
    expect(stages(m)).toEqual([]);
  });

  it("ne perd pas le champ quand l'écran se redessine, ni sa saisie", async () => {
    const m = await mountCrm();
    buttonNamed("+ Ajouter une étape").click();
    type(field(), "Dev");
    await m.view.reload();
    await new Promise((r) => setTimeout(r, 30));
    expect(field().value).toBe("Dev");
    expect(document.activeElement).toBe(field());
  });

  it("refuse un nom : le message s'affiche, le champ reste pour le corriger", async () => {
    const m = await mountCrm();
    buttonNamed("+ Ajouter une étape").click();
    type(field(), "Done");
    m.fail.next = "« Done » est déjà une colonne.";
    press(field(), "Enter");
    await vi.waitFor(() =>
      expect(m.errors).toEqual([{ message: "« Done » est déjà une colonne." }]),
    );
    await vi.waitFor(() => expect(field().value).toBe("Done"));
  });

  it("renomme une étape en cliquant son nom : Entrée change le nom", async () => {
    const m = await mountCrm();
    (column("Progress").querySelector(".crm-stage-name") as HTMLElement).click();
    expect(field().value).toBe("Progress");
    expect(column("Progress").contains(field())).toBe(true);
    type(field(), "En cours");
    press(field(), "Enter");
    await vi.waitFor(() =>
      expect(stages(m)).toEqual([{ kind: "rename", from: "Progress", to: "En cours" }]),
    );
  });

  it("ne demande rien à Rust quand le nom n'a pas changé, et Échap annule le renommage", async () => {
    const m = await mountCrm();
    (column("Progress").querySelector(".crm-stage-name") as HTMLElement).click();
    press(field(), "Enter");
    expect(document.querySelector(".crm-stage-input")).toBeNull();
    (column("Progress").querySelector(".crm-stage-name") as HTMLElement).click();
    type(field(), "Autre");
    press(field(), "Escape");
    expect(document.querySelector(".crm-stage-input")).toBeNull();
    expect(stages(m)).toEqual([]);
    expect(column("Progress").querySelector(".crm-stage-name")?.textContent).toBe("Progress");
  });

  it("retire une étape qui a des actions après confirmation : ses actions repartent en « TODO »", async () => {
    const m = await mountCrm();
    (column("Progress").querySelector(".crm-stage-remove") as HTMLElement).click();
    await vi.waitFor(() => expect(stages(m)).toEqual([{ kind: "remove", name: "Progress" }]));
    expect(m.questions).toEqual([
      "Retirer l'étape « Progress » ? Ses 1 action repartent en « TODO ».",
    ]);
  });

  it("met « actions » au pluriel, et n'accepte pas sans réponse positive", async () => {
    const m = await mountCrm();
    const progress = m.disk.crm.columns.find((c) => c.status === "Progress");
    if (progress) progress.count = 3;
    await m.view.reload();
    m.answer.value = false;
    (column("Progress").querySelector(".crm-stage-remove") as HTMLElement).click();
    await vi.waitFor(() => expect(m.questions).toHaveLength(1));
    expect(m.questions[0]).toBe(
      "Retirer l'étape « Progress » ? Ses 3 actions repartent en « TODO ».",
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(stages(m)).toEqual([]);
  });

  it("retire une étape sans action sans rien demander", async () => {
    const m = await mountCrm();
    m.disk.crm.columns = m.disk.crm.columns.map((c) =>
      c.status === "WaitingFor" ? { ...c, count: 0 } : c,
    );
    await m.view.reload();
    (column("WaitingFor").querySelector(".crm-stage-remove") as HTMLElement).click();
    await vi.waitFor(() => expect(stages(m)).toEqual([{ kind: "remove", name: "WaitingFor" }]));
    expect(m.questions).toEqual([]);
  });

  it("déplace une étape en glissant son en-tête : elle prend la place où elle est lâchée", async () => {
    const m = await mountCrm();
    const header = column("Progress").querySelector(".crm-column-header") as HTMLElement;
    const { x } = inside(column("WaitingFor"), 0.5);
    const right = x + column("WaitingFor").getBoundingClientRect().width / 2 - 5;
    const mark = drag(header, { x: right, y: inside(column("WaitingFor"), 0.5).y });
    expect(column("WaitingFor").classList.contains("drop-stage-after")).toBe(true);
    expect(column("Progress").classList.contains("dragging")).toBe(true);
    expect(document.querySelector(".crm-ghost")).not.toBeNull();
    mark.drop();
    expect(document.querySelector(".crm-ghost")).toBeNull();
    await vi.waitFor(() => expect(stages(m)).toEqual([{ kind: "move", name: "Progress", to: 1 }]));
  });

  it("place l'étape avant l'autre quand on la lâche à gauche de son milieu", async () => {
    const m = await mountCrm();
    const header = column("WaitingFor").querySelector(".crm-column-header") as HTMLElement;
    const left = column("Progress").getBoundingClientRect().left + 20;
    const mark = drag(header, { x: left, y: inside(column("Progress"), 0.5).y });
    expect(column("Progress").classList.contains("drop-stage-before")).toBe(true);
    mark.drop();
    await vi.waitFor(() =>
      expect(stages(m)).toEqual([{ kind: "move", name: "WaitingFor", to: 0 }]),
    );
  });

  it("ne change rien quand l'étape est lâchée là où elle est, et un glissé n'est pas un clic de renommage", async () => {
    const m = await mountCrm();
    const name = column("Progress").querySelector(".crm-stage-name") as HTMLElement;
    const here = inside(column("Progress"), 0.5);
    const mark = drag(name, here);
    expect(document.querySelector(".drop-stage-before, .drop-stage-after")).toBeNull();
    mark.drop();
    name.click();
    expect(document.querySelector(".crm-stage-input")).toBeNull();
    expect(stages(m)).toEqual([]);
  });

  it("ne glisse pas TODO, Done ni Cancel", async () => {
    await mountCrm();
    const header = column("TODO").querySelector(".crm-column-header") as HTMLElement;
    const mark = drag(header, inside(column("WaitingFor"), 0.5));
    expect(document.querySelector(".crm-ghost")).toBeNull();
    mark.drop();
  });

  it("ne glisse pas l'étape quand on appuie sur « × » ou dans le champ", async () => {
    await mountCrm();
    const remove = column("Progress").querySelector(".crm-stage-remove") as HTMLElement;
    drag(remove, inside(column("WaitingFor"), 0.5)).drop();
    expect(document.querySelector(".crm-ghost")).toBeNull();
  });
});
