import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { Agenda12EventChangeItem } from "../bridge";
import { detailOf, eventItem } from "../../test-support/agenda-12-fixture";
import { createEventBand } from "./agenda-12-event-band";
import "../theme.css";
import "../style.css";

// « Quand » de la bande d'un événement (spécification §§ 4.3 et 4.4) : le sélecteur de période dans la bande, la
// cohérence de la fin avec le début, la mise en page « Quand » et « Où ». L'année en cours est injectée : 2026.

beforeAll(() => page.viewport(1000, 800));
afterEach(() => document.body.replaceChildren());

type Event = ReturnType<typeof eventItem>;

function mount(event: Event, width = "900px") {
  const changes: Agenda12EventChangeItem[] = [];
  const log: string[] = [];
  const state = { failAt: null as number | null, detail: detailOf(event) };
  const band = createEventBand({
    path: "pro/salons/embedded.md",
    currentYear: () => 2026,
    error: () => {},
    errorText: (error) => (error as { message: string }).message,
    flush: async () => void log.push("enregistrer"),
    followText: async () => void log.push("relire le texte"),
    open: async () => {},
    askClosing: async () => null,
    trashEvent: async () => {},
    backend: {
      readAgenda12Event: async () => (log.push("lire"), state.detail),
      changeAgenda12Event: async (_, change) => {
        changes.push(change);
        if (state.failAt === changes.length)
          throw { message: "Ce jour n'existe pas dans ce mois." };
        return null;
      },
      closeAgenda12Event: async () => ({ closed: "", successor: null }),
      reopenAgenda12Event: async () => ({ path: "" }),
      listCountries: async () => [],
    },
  });
  const column = document.createElement("div");
  column.style.cssText = `width:${width}`;
  column.append(band.element);
  document.body.replaceChildren(column);
  return { band, changes, log, state, column };
}

async function mounted(event: Event, width?: string) {
  const m = mount(event, width);
  await m.band.reload();
  return m;
}

const trigger = () => document.querySelector(".agenda-period-trigger") as HTMLButtonElement;
const popup = () => document.querySelector<HTMLElement>(".agenda-period-popup");
const month = (n: number) =>
  document.querySelector(`[data-grid="months"][data-n="${String(n)}"]`) as HTMLButtonElement;
const dayButton = (n: number) =>
  document.querySelector(`[data-grid="days"][data-n="${String(n)}"]`) as HTMLButtonElement;
const yearButton = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (o) => o.textContent === text,
  );
const message = () => document.querySelector(".agenda-band-message") as HTMLElement;
const note = () => document.querySelector(".agenda-end-note") as HTMLElement;
const box = (e: Element) => e.getBoundingClientRect();
const danger = () => {
  const probe = document.createElement("i");
  probe.style.color = "var(--danger)";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
};

describe("« Quand » : un seul champ de période", () => {
  it("la ligne « Quand » est un groupe qui porte un seul champ, nommé « Date », avec la date en toutes lettres", async () => {
    await mounted(eventItem({ day: 5, month: 10, year: 2026, end: { day: 11, month: 10 } }));
    const group = document.querySelector('[role="group"][aria-label="Quand"]') as HTMLElement;
    expect(group.querySelectorAll("button.agenda-period-trigger")).toHaveLength(1);
    expect(group.querySelectorAll("input, select")).toHaveLength(0);
    expect(group.querySelector(".agenda-field-label")?.textContent).toBe("Date");
    expect(trigger().textContent).toBe("5 – 11 octobre 2026");
    expect(document.querySelector(".agenda-summary")?.textContent).toBe(
      "5 – 11 octobre 2026 · Nuremberg, Allemagne",
    );
  });

  it("choisir une année dans la fenêtre est un geste, la bande relit l'événement", async () => {
    const m = await mounted(eventItem({}));
    trigger().click();
    (document.querySelector(".agenda-period-year") as HTMLElement).click();
    yearButton("2029")?.click();
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "year", year: 2029 }]));
    await vi.waitFor(() => expect(m.log.filter((l) => l === "lire")).toHaveLength(2));
  });

  it("choisir un jour de début sur un événement sans jour : un geste, la fenêtre attend la fin", async () => {
    const m = await mounted(eventItem({ day: null, end: null }));
    trigger().click();
    dayButton(13).click();
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "day", day: 13 }]));
    expect(popup()).not.toBeNull();
  });

  it("choisir la fin d'une plage : un geste de fin, la fenêtre se ferme", async () => {
    const m = await mounted(eventItem({ month: 10, day: 5, end: null }));
    trigger().click();
    dayButton(11).click();
    await vi.waitFor(() =>
      expect(m.changes).toEqual([{ kind: "end", end: { day: 11, month: 10 } }]),
    );
    expect(popup()).toBeNull();
  });

  it("recommencer une plage qui a une fin : la fin est effacée d'abord, puis le début change", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    m.log.length = 0;
    trigger().click();
    dayButton(14).click();
    await vi.waitFor(() => expect(m.log).toEqual(["enregistrer", "relire le texte", "lire"]));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "day", day: 14 },
    ]);
  });
});

describe("« Quand » : changer le début au-delà de la fin ramène la fin au début", () => {
  const NOTICE = "La fin a été ramenée au début.";

  it("le mois de début qui rejoint le mois de fin avec un jour plus petit : la fin est ramenée, avec un message", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    m.log.length = 0;
    trigger().click();
    month(3).click();
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "month", month: 3 },
    ]);
    expect(m.log).toEqual(["enregistrer", "relire le texte", "lire"]);
    expect(message().hidden).toBe(false);
    expect(message().dataset.tone).toBe("notice");
  });

  it("le mois de début au-delà du mois de fin : la fin ne passe pas à l'année suivante sans l'avoir voulu", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    trigger().click();
    month(4).click();
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "month", month: 4 },
    ]);
  });

  it("une fin du même mois suit le mois de début : rien à ramener, rien à dire", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    trigger().click();
    month(5).click();
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "month", month: 5 }]));
    expect(message().hidden).toBe(true);
  });

  it("une année qui retire le 29 février de la fin ramène la fin", async () => {
    const m = await mounted(
      eventItem({ month: 12, day: 30, year: 2027, end: { day: 29, month: 2 } }),
    );
    trigger().click();
    (document.querySelector('[aria-label="Année précédente"]') as HTMLElement).click();
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "year", year: 2026 },
    ]);
  });

  it("un mois où le jour n'existe pas : le jour est retiré avec son message", async () => {
    const m = await mounted(eventItem({ month: 1, day: 31, year: 2027, end: null }));
    trigger().click();
    month(4).click();
    await vi.waitFor(() =>
      expect(message().textContent).toBe("Ce jour n'existe pas dans ce mois : il a été retiré."),
    );
    expect(m.changes).toEqual([
      { kind: "day", day: null },
      { kind: "month", month: 4 },
    ]);
  });

  it("si le moteur refuse un geste, son message est dit, pas celui de la fin ramenée", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    m.state.failAt = 2;
    trigger().click();
    month(3).click();
    await vi.waitFor(() =>
      expect(message().textContent).toBe("Ce jour n'existe pas dans ce mois."),
    );
    expect(message().dataset.tone).toBe("error");
    expect(m.changes).toHaveLength(2);
  });

  it("le message de la fin ramenée s'efface au geste suivant", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    trigger().click();
    month(3).click();
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    m.state.detail = detailOf(eventItem({ month: 3, day: 10, end: null }));
    await m.band.reload(true);
    month(5).click();
    await vi.waitFor(() => expect(message().hidden).toBe(true));
  });
});

describe("« Quand » : une fin incohérente ou qui passe l'année est montrée, jamais corrigée en silence", () => {
  it("une fin avant le début : état d'erreur sur le champ, texte d'aide, aucun geste", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 5, month: 2 } }));
    expect(trigger().getAttribute("aria-invalid")).toBe("true");
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe("La fin est avant le début.");
    expect(note().dataset.tone).toBe("error");
    expect(trigger().getAttribute("aria-describedby")).toBe(note().id);
    expect(getComputedStyle(trigger()).borderTopColor).toBe(danger());
    expect(m.changes).toEqual([]);
  });

  it("une fin cohérente n'a ni erreur ni aide, et l'erreur disparaît quand l'événement relu est cohérent", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    expect(trigger().hasAttribute("aria-invalid")).toBe(false);
    expect(trigger().hasAttribute("aria-describedby")).toBe(false);
    expect(note().hidden).toBe(true);
    m.state.detail = detailOf(eventItem({ month: 2, day: 10, end: { day: 5, month: 2 } }));
    await m.band.reload(true);
    expect(note().hidden).toBe(false);
    m.state.detail = detailOf(eventItem({ month: 2, day: 10, end: { day: 12, month: 2 } }));
    await m.band.reload(true);
    expect(note().hidden).toBe(true);
    expect(trigger().hasAttribute("aria-invalid")).toBe(false);
  });

  it("une fin dans un mois antérieur : valide, signalée « Fin l'année suivante. », résumé avec les deux années", async () => {
    const m = await mounted(
      eventItem({
        month: 9,
        day: 13,
        year: 2026,
        end: { day: 23, month: 6 },
        city: null,
        country: null,
      }),
    );
    expect(note().textContent).toBe("Fin l'année suivante.");
    expect(note().dataset.tone).toBe("hint");
    expect(trigger().hasAttribute("aria-invalid")).toBe(false);
    expect(trigger().textContent).toBe("13 septembre 2026 – 23 juin 2027");
    expect(document.querySelector(".agenda-summary")?.textContent).toBe(
      "13 septembre 2026 – 23 juin 2027",
    );
    expect(m.changes).toEqual([]);
  });
});

describe("« Quand » et « Où » : un même gabarit", () => {
  const place = () => document.querySelector(".agenda-place-fields") as HTMLElement;

  it("le champ de période et les champs du lieu ont la même hauteur et la même largeur totale", async () => {
    await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    expect(box(trigger()).height).toBe(36);
    for (const label of ["Ville", "Pays"]) {
      const field = document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
      expect(box(field).height).toBe(36);
    }
    expect(Math.round(box(trigger()).left)).toBe(Math.round(box(place()).left));
    expect(Math.round(box(trigger()).width)).toBe(Math.round(box(place()).width));
    expect(Math.round(box(trigger()).right)).toBe(Math.round(box(place()).right));
  });

  it("dans une colonne de 420 points : rien ne déborde, la période a la largeur du lieu, la fenêtre reste dans la colonne", async () => {
    const m = await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }), "420px");
    const band = document.querySelector(".agenda-band") as HTMLElement;
    const edge = box(m.column).right;
    const beyond = [...band.querySelectorAll("input, select, button, p, span")].filter(
      (element) => box(element).right > edge + 0.5,
    );
    expect(beyond.map((e) => e.className)).toEqual([]);
    expect(band.scrollWidth).toBeLessThanOrEqual(band.clientWidth);
    expect(Math.round(box(trigger()).width)).toBe(Math.round(box(place()).width));
    trigger().click();
    const p = box(popup() as HTMLElement);
    const column = box(m.column);
    expect(p.left).toBeGreaterThanOrEqual(column.left);
    expect(p.right).toBeLessThanOrEqual(column.right + 0.5);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(Math.round(p.width)).toBeGreaterThanOrEqual(340);
  });
});
