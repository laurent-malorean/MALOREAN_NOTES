import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { Agenda12EventChangeItem } from "../bridge";
import { detailOf, eventItem } from "../../test-support/agenda-12-fixture";
import { createEventBand } from "./agenda-12-event-band";
import "../theme.css";
import "../style.css";

// « Quand » de la bande d'un événement (spécification §§ 4.3 et 4.4) : la liste des années, le sélecteur de jour
// du début et de la fin, la cohérence de la fin avec le début. L'année en cours est injectée : 2026.

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

const control = (label: string) =>
  document.querySelector(`.agenda-band [aria-label="${label}"]`) as HTMLSelectElement;
const popup = () => document.querySelector<HTMLElement>(".agenda-day-popup");
const dayButton = (day: number) =>
  [...document.querySelectorAll<HTMLButtonElement>(".agenda-day")][day - 1] as HTMLButtonElement;
const message = () => document.querySelector(".agenda-band-message") as HTMLElement;
const note = () => document.querySelector(".agenda-end-note") as HTMLElement;
const box = (e: Element) => e.getBoundingClientRect();

/** Choisit un jour dans la grille du champ `label`. */
function pickDay(label: string, day: number) {
  control(label).click();
  dayButton(day).click();
}
function pickYear(value: string) {
  const select = control("Année");
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
const unavailable = (label: string) => {
  control(label).click();
  const days = [...document.querySelectorAll<HTMLButtonElement>(".agenda-day")];
  const closed = days.filter((b) => b.disabled).map((b) => Number(b.textContent));
  control(label).click();
  return closed;
};
const danger = () => {
  const probe = document.createElement("i");
  probe.style.color = "var(--danger)";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
};

describe("« Quand » : la liste des années", () => {
  it("propose « — », l'année en cours et les dix suivantes, l'année de l'événement choisie", async () => {
    await mounted(eventItem({ year: 2027 }));
    const year = control("Année");
    expect(year.tagName).toBe("SELECT");
    const options = [...year.options].map((o) => o.textContent);
    expect(options).toEqual(["—", ...Array.from({ length: 11 }, (_, i) => String(2026 + i))]);
    expect(year.options[0]?.value).toBe("");
    expect(year.value).toBe("2027");
  });

  it("sans année, « — » est choisi", async () => {
    await mounted(eventItem({ year: null, day: null, end: null }));
    expect(control("Année").value).toBe("");
    expect(control("Année").selectedOptions[0]?.textContent).toBe("—");
  });

  it("une année passée ou lointaine reste choisie : elle est ajoutée à la liste, sans geste", async () => {
    const past = await mounted(eventItem({ year: 2019 }));
    expect([...control("Année").options].map((o) => o.textContent).slice(0, 3)).toEqual([
      "—",
      "2019",
      "2026",
    ]);
    expect(control("Année").value).toBe("2019");
    expect(past.changes).toEqual([]);
    document.body.replaceChildren();
    const far = await mounted(eventItem({ year: 2040 }));
    const options = [...control("Année").options].map((o) => o.textContent);
    expect(options.slice(-2)).toEqual(["2036", "2040"]);
    expect(options).toHaveLength(13);
    expect(control("Année").value).toBe("2040");
    expect(far.changes).toEqual([]);
  });

  it("la liste suit l'année relue : l'année hors plage disparaît quand elle n'est plus écrite", async () => {
    const m = await mounted(eventItem({ year: 2019 }));
    m.state.detail = detailOf(eventItem({ year: 2030 }));
    await m.band.reload(true);
    expect(control("Année").options).toHaveLength(12);
    expect(control("Année").value).toBe("2030");
  });

  it("choisir une année, ou « — », est un geste", async () => {
    const m = await mounted(eventItem({ year: 2027 }));
    pickYear("2029");
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "year", year: 2029 }]));
    pickYear("");
    await vi.waitFor(() => expect(m.changes[1]).toEqual({ kind: "year", year: null }));
  });
});

describe("« Quand » : les jours du début et de la fin", () => {
  it("le champ du jour montre le jour, ou « — », et garde son nom", async () => {
    await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    expect(control("Jour").textContent).toBe("10");
    expect(control("Fin : jour").textContent).toBe("13");
    document.body.replaceChildren();
    await mounted(eventItem({ day: null, end: null }));
    expect(control("Jour").textContent).toBe("—");
    expect(control("Fin : jour").textContent).toBe("—");
  });

  it("choisir le jour de début est un geste, « Aucun jour » l'efface", async () => {
    const m = await mounted(eventItem({ end: null }));
    pickDay("Jour", 12);
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "day", day: 12 }]));
    control("Jour").click();
    (document.querySelector(".agenda-day-clear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(m.changes[1]).toEqual({ kind: "day", day: null }));
  });

  it("choisir le jour de fin garde le mois de fin ; « Aucun jour » efface la fin", async () => {
    const m = await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    pickDay("Fin : jour", 14);
    await vi.waitFor(() =>
      expect(m.changes).toEqual([{ kind: "end", end: { day: 14, month: 2 } }]),
    );
    control("Fin : jour").click();
    (document.querySelector(".agenda-day-clear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(m.changes[1]).toEqual({ kind: "end", end: null }));
  });

  it("les deux fenêtres portent leur nom ; le jour choisi y est en évidence", async () => {
    await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    control("Jour").click();
    expect(popup()?.getAttribute("aria-label")).toBe("Choisir le jour");
    expect(dayButton(10).getAttribute("aria-pressed")).toBe("true");
    control("Jour").click();
    control("Fin : jour").click();
    expect(popup()?.getAttribute("aria-label")).toBe("Choisir le jour de fin");
    expect(dayButton(13).getAttribute("aria-pressed")).toBe("true");
  });

  it("le mois de fin se change quand il y a une fin", async () => {
    const m = await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    control("Fin : mois").value = "3";
    control("Fin : mois").dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(m.changes).toEqual([{ kind: "end", end: { day: 13, month: 3 } }]),
    );
  });
});

describe("« Quand » : les jours impossibles sont grisés", () => {
  it("jours du début : 31 février, 29 février d'une année non bissextile, 31 avril", async () => {
    await mounted(eventItem({ month: 2, year: 2027, day: 10, end: null }));
    expect(unavailable("Jour")).toEqual([29, 30, 31]);
    document.body.replaceChildren();
    await mounted(eventItem({ month: 2, year: 2028, day: 10, end: null }));
    expect(unavailable("Jour")).toEqual([30, 31]);
    document.body.replaceChildren();
    await mounted(eventItem({ month: 4, year: null, day: 10, end: null }));
    expect(unavailable("Jour")).toEqual([31]);
    document.body.replaceChildren();
    await mounted(eventItem({ month: 1, year: 2027, day: 10, end: null }));
    expect(unavailable("Jour")).toEqual([]);
  });

  it("sans année, le 29 février est permis, le 30 non", async () => {
    await mounted(eventItem({ month: 2, year: null, day: 10, end: null }));
    expect(unavailable("Jour")).toEqual([30, 31]);
  });

  it("jours de fin, le même mois : ceux avant le jour de début sont grisés, pas le jour de début", async () => {
    await mounted(eventItem({ month: 2, year: 2028, day: 10, end: { day: 13, month: 2 } }));
    expect(unavailable("Fin : jour")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 30, 31]);
  });

  it("jours de fin, un autre mois : seuls ceux qui n'existent pas sont grisés", async () => {
    await mounted(eventItem({ month: 1, year: 2027, day: 30, end: { day: 2, month: 2 } }));
    expect(unavailable("Fin : jour")).toEqual([29, 30, 31]);
    document.body.replaceChildren();
    await mounted(eventItem({ month: 12, year: 2027, day: 30, end: { day: 2, month: 2 } }));
    expect(unavailable("Fin : jour")).toEqual([30, 31]);
  });

  it("sans jour de début, aucun jour de fin n'est grisé par le début", async () => {
    await mounted(eventItem({ month: 3, year: null, day: null, end: null }));
    expect(unavailable("Fin : jour")).toEqual([]);
  });
});

describe("« Quand » : changer le début au-delà de la fin ramène la fin au début", () => {
  const NOTICE = "La fin a été ramenée au début.";

  it("un jour de début après le jour de fin : la fin est effacée d'abord, puis le jour change, avec un message", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    m.log.length = 0;
    pickDay("Jour", 14);
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "day", day: 14 },
    ]);
    expect(m.log).toEqual(["enregistrer", "relire le texte", "lire"]);
    expect(message().hidden).toBe(false);
    expect(message().dataset.tone).toBe("notice");
  });

  it("un jour de début qui ne dépasse pas la fin ne touche pas à la fin et ne dit rien", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    pickDay("Jour", 13);
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "day", day: 13 }]));
    expect(message().hidden).toBe(true);
  });

  it("le mois de début qui rejoint le mois de fin avec un jour plus petit : la fin est ramenée", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    control("Mois").value = "3";
    control("Mois").dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "month", month: 3 },
    ]);
  });

  it("le mois de début au-delà du mois de fin : la fin ne passe pas à l'année suivante sans l'avoir voulu", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 2, month: 3 } }));
    control("Mois").value = "4";
    control("Mois").dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "month", month: 4 },
    ]);
  });

  it("une fin du même mois suit le mois de début : rien à ramener", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    control("Mois").value = "5";
    control("Mois").dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "month", month: 5 }]));
    expect(message().hidden).toBe(true);
  });

  it("une année qui retire le 29 février de la fin ramène la fin", async () => {
    const m = await mounted(
      eventItem({ month: 12, day: 30, year: 2027, end: { day: 29, month: 2 } }),
    );
    pickYear("2026");
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    expect(m.changes).toEqual([
      { kind: "end", end: null },
      { kind: "year", year: 2026 },
    ]);
  });

  it("sans fin, le début change sans rien d'autre", async () => {
    const m = await mounted(eventItem({ day: 10, end: null }));
    pickDay("Jour", 20);
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "day", day: 20 }]));
    expect(message().hidden).toBe(true);
  });

  it("si le moteur refuse le changement, son message est dit, pas celui de la fin ramenée", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    m.state.failAt = 2;
    pickDay("Jour", 14);
    await vi.waitFor(() =>
      expect(message().textContent).toBe("Ce jour n'existe pas dans ce mois."),
    );
    expect(message().dataset.tone).toBe("error");
    expect(m.changes).toHaveLength(2);
  });

  it("le message de la fin ramenée s'efface au geste suivant", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    pickDay("Jour", 14);
    await vi.waitFor(() => expect(message().textContent).toBe(NOTICE));
    m.state.detail = detailOf(eventItem({ month: 2, day: 14, end: null }));
    await m.band.reload(true);
    pickDay("Jour", 15);
    await vi.waitFor(() => expect(message().hidden).toBe(true));
  });
});

describe("« Quand » : une fin incohérente ou qui passe l'année est montrée, jamais corrigée en silence", () => {
  it("une fin avant le début : état d'erreur sur le champ de fin, texte d'aide, aucun geste", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 5, month: 2 } }));
    for (const label of ["Fin : jour", "Fin : mois"])
      expect(control(label).getAttribute("aria-invalid")).toBe("true");
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe("La fin est avant le début.");
    expect(note().dataset.tone).toBe("error");
    expect(control("Fin : jour").getAttribute("aria-describedby")).toBe(note().id);
    expect(getComputedStyle(control("Fin : jour")).borderTopColor).toBe(danger());
    expect(control("Fin : jour").textContent).toBe("5");
    expect(m.changes).toEqual([]);
    expect(control("Jour").getAttribute("aria-invalid")).toBeNull();
  });

  it("une fin cohérente n'a ni erreur ni aide", async () => {
    await mounted(eventItem({ month: 2, day: 10, end: { day: 13, month: 2 } }));
    expect(control("Fin : jour").hasAttribute("aria-invalid")).toBe(false);
    expect(control("Fin : jour").hasAttribute("aria-describedby")).toBe(false);
    expect(note().hidden).toBe(true);
    expect(note().textContent).toBe("");
  });

  it("l'erreur disparaît quand l'événement relu est cohérent", async () => {
    const m = await mounted(eventItem({ month: 2, day: 10, end: { day: 5, month: 2 } }));
    m.state.detail = detailOf(eventItem({ month: 2, day: 10, end: { day: 12, month: 2 } }));
    await m.band.reload(true);
    expect(note().hidden).toBe(true);
    expect(control("Fin : jour").hasAttribute("aria-invalid")).toBe(false);
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
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe("Fin l'année suivante.");
    expect(note().dataset.tone).toBe("hint");
    expect(control("Fin : jour").hasAttribute("aria-invalid")).toBe(false);
    expect(document.querySelector(".agenda-summary")?.textContent).toBe(
      "13 septembre 2026 – 23 juin 2027",
    );
    expect(m.changes).toEqual([]);
    const months = [...control("Fin : mois").options];
    expect(months.every((o) => !o.disabled)).toBe(true);
  });
});

describe("« Quand » : la mise en page", () => {
  it("garde le jour, le mois et l'année sur une ligne, et rien ne déborde, dans une colonne de 420 points", async () => {
    const m = await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }), "420px");
    const band = document.querySelector(".agenda-band") as HTMLElement;
    const edge = box(m.column).right;
    const tops = ["Jour", "Mois", "Année"].map((label) => Math.round(box(control(label)).top));
    expect(new Set(tops).size).toBe(1);
    const beyond = [...band.querySelectorAll("input, select, button, p, span")].filter(
      (element) => box(element).right > edge + 0.5,
    );
    expect(beyond.map((e) => `${e.className} ${String(box(e).right)} ${String(edge)}`)).toEqual([]);
    expect(band.scrollWidth).toBeLessThanOrEqual(band.clientWidth);
  });

  it("le champ du jour et la liste des années ont la hauteur des autres champs", async () => {
    await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }));
    for (const label of ["Jour", "Mois", "Année", "Fin : jour", "Fin : mois", "Ville"])
      expect(box(control(label)).height).toBe(36);
  });

  it("la liste des années a l'aspect de la liste des mois, pas de la pastille d'année d'une ligne", async () => {
    await mounted(eventItem({}));
    const look = (label: string) => {
      const style = getComputedStyle(control(label));
      return [style.color, style.backgroundColor, style.borderTopColor];
    };
    expect(look("Année")).toEqual(look("Mois"));
  });

  it("la fenêtre des jours de fin reste dans la colonne étroite", async () => {
    const m = await mounted(eventItem({ day: 10, end: { day: 13, month: 2 } }), "420px");
    control("Fin : jour").click();
    const p = box(popup() as HTMLElement);
    const column = box(m.column);
    expect(p.left).toBeGreaterThanOrEqual(column.left);
    expect(p.right).toBeLessThanOrEqual(column.right + 0.5);
    expect(p.right).toBeLessThanOrEqual(window.innerWidth);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
  });
});
