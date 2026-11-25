import { beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { action, crm, sample } from "../../test-support/crm-fixture";
import {
  buttonNamed,
  callsTo,
  card,
  cardsOf,
  dayColumn,
  drag,
  inside,
  mountCrm as mountAt,
  type MountOptions,
  text,
} from "../../test-support/crm-view-fixture";

// Huit colonnes : la page est assez large pour les montrer toutes.
const mountCrm = (options: MountOptions = {}) => mountAt({ width: 2400, ...options });
import "../theme.css";
import "../style.css";

// Huit colonnes de 272 points au moins : le cadre doit être assez large pour que le pointeur les atteigne.
beforeAll(() => page.viewport(2400, 900));

const headers = () =>
  [...document.querySelectorAll(".crm-week .crm-column-name")].map((e) => e.textContent);
const date = (m: Awaited<ReturnType<typeof mountCrm>>) =>
  callsTo(m, "changeCrmAction").map((call) => call.slice(2));

describe("CRM : Ma semaine", () => {
  it("montre huit colonnes : « En retard » puis lundi à dimanche, même vides", async () => {
    await mountCrm({ crm: crm(), tab: "week" });
    expect(headers()).toEqual([
      ...["En retard", "Lundi 23", "Mardi 24", "Mercredi 25", "Jeudi 26"],
      ...["Vendredi 27", "Samedi 28", "Dimanche 29"],
    ]);
  });

  it("range les actions ouvertes par jour, et celles d'avant le lundi en retard", async () => {
    await mountCrm({ tab: "week" });
    expect(cardsOf(document.querySelector(".crm-column.late") as HTMLElement)).toEqual(["devis"]);
    expect(cardsOf(dayColumn("2026-11-25"))).toEqual(["appel"]);
    expect(cardsOf(dayColumn("2026-11-27"))).toEqual(["relance"]);
    expect(cardsOf(dayColumn("2026-11-23"))).toEqual([]);
    expect(text(card("devis"), ".crm-card-title")).toBe("Demande de devis");
  });

  it("met aujourd'hui en évidence, et lui seul", async () => {
    await mountCrm({ tab: "week" });
    expect(dayColumn("2026-11-25").classList.contains("today")).toBe(true);
    expect(document.querySelectorAll(".crm-column.today")).toHaveLength(1);
    expect(getComputedStyle(dayColumn("2026-11-25")).outlineStyle).toBe("solid");
    expect(getComputedStyle(dayColumn("2026-11-24")).outlineStyle).toBe("none");
  });

  it("dit les dates de la semaine dans son titre", async () => {
    await mountCrm({ tab: "week" });
    expect(text(document, ".crm-week-title")).toBe("Semaine du 23 nov. au 29 nov.");
  });

  it("passe à la semaine suivante et précédente par leur lundi, et « Aujourd'hui » revient à celle en cours", async () => {
    const m = await mountCrm({ tab: "week" });
    buttonNamed("Semaine suivante").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm").at(-1)?.[3]).toBe("2026-11-30"));
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    buttonNamed("Semaine précédente").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm").at(-1)?.[3]).toBe("2026-11-16"));
    buttonNamed("Aujourd'hui").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm").at(-1)?.[3]).toBeNull());
    expect(buttonNamed("Semaine suivante").textContent).toBe("›");
    expect(buttonNamed("Semaine précédente").textContent).toBe("‹");
  });

  it("garde la semaine regardée quand le CRM est relu", async () => {
    const m = await mountCrm({ tab: "week" });
    buttonNamed("Semaine suivante").click();
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(2));
    await m.view.reload();
    expect(callsTo(m, "readCrm").at(-1)?.[3]).toBe("2026-11-30");
  });

  it("glisser une carte sur un jour change sa date, reçue n'importe où sur la colonne", async () => {
    const m = await mountCrm({ tab: "week" });
    const target = dayColumn("2026-11-28");
    const gesture = drag(card("appel"), inside(target, 0.95));
    expect(target.classList.contains("drop-target")).toBe(true);
    expect(card("appel").classList.contains("dragging")).toBe(true);
    gesture.drop();
    await vi.waitFor(() =>
      expect(date(m)).toEqual([["appel", { kind: "date", date: "2026-11-28" }]]),
    );
    expect(document.querySelector(".drop-target")).toBeNull();
  });

  it("reçoit aussi une carte d'« En retard » sur l'en-tête d'un jour", async () => {
    const m = await mountCrm({ tab: "week" });
    const header = dayColumn("2026-11-26").querySelector(".crm-column-header") as HTMLElement;
    drag(card("devis"), inside(header, 0.5)).drop();
    await vi.waitFor(() =>
      expect(date(m)).toEqual([["devis", { kind: "date", date: "2026-11-26" }]]),
    );
  });

  it("ne dépose pas dans « En retard », ni sur le jour où est déjà la carte", async () => {
    const m = await mountCrm({ tab: "week" });
    const late = document.querySelector(".crm-column.late") as HTMLElement;
    const gesture = drag(card("appel"), inside(late, 0.5));
    expect(late.classList.contains("drop-target")).toBe(false);
    gesture.drop();
    drag(card("appel"), inside(dayColumn("2026-11-25"), 0.9)).drop();
    await new Promise((r) => setTimeout(r, 30));
    expect(date(m)).toEqual([]);
  });

  it("ne range pas les cartes d'un jour à la main : pas de trait entre cartes", async () => {
    const data = sample();
    data.actions.push(action("autre", { title: "Autre", date: "2026-11-25" }));
    data.week.days[2]?.cards.push("autre");
    await mountCrm({ crm: data, tab: "week" });
    drag(card("appel"), inside(card("autre"), 0.1));
    expect(document.querySelector(".drop-before")).toBeNull();
  });

  it("filtrée, la semaine ne montre que les cartes que Rust rend", async () => {
    const data = sample();
    data.week.days = data.week.days.map((d) => ({ ...d, cards: [] }));
    data.week.late = [];
    await mountCrm({ crm: data, tab: "week" });
    expect(document.querySelectorAll(".crm-week .crm-card")).toHaveLength(0);
  });
});
