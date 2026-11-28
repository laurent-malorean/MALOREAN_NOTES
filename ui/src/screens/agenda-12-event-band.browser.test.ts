import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agenda12ClosingItem, Agenda12EventChangeItem } from "../bridge";
import { COUNTRIES, detailOf, eventItem, FRANCE } from "../../test-support/agenda-12-fixture";
import { createEventBand, type TrashedEvent } from "./agenda-12-event-band";
import "../theme.css";
import "../style.css";

afterEach(() => document.body.replaceChildren());

const PATH = "pro/salons/embedded.md";

type Detail = ReturnType<typeof detailOf>;

function mount(first: Detail = detailOf()) {
  const log: string[] = [];
  const errors: unknown[] = [];
  const opened: string[] = [];
  const trashed: TrashedEvent[] = [];
  const changes: Agenda12EventChangeItem[] = [];
  const state = {
    detail: first,
    fail: null as unknown,
    closing: "alone" as Agenda12ClosingItem | null,
    asked: [] as string[],
    readFails: false,
    flushHold: null as Promise<void> | null,
    hold: null as Promise<void> | null,
  };
  const band = createEventBand({
    path: PATH,
    error: (error) => errors.push(error),
    errorText: (error) => (error as { message: string }).message,
    flush: async () => {
      log.push("enregistrer");
      await state.flushHold;
    },
    followText: async () => void log.push("relire le texte"),
    open: async (path) => void opened.push(path),
    askClosing: async (title) => (state.asked.push(title), state.closing),
    trashEvent: async (event) => void trashed.push(event),
    backend: {
      readAgenda12Event: async (path) => {
        log.push(`lire ${path}`);
        if (state.readFails) throw { message: "Cet événement n'existe plus." };
        // Ce que Rust lisait à l'appel ; la réponse peut être retenue.
        const read = state.detail;
        await state.hold;
        return read;
      },
      changeAgenda12Event: async (_, change) => {
        changes.push(change);
        if (state.fail !== null) throw state.fail;
        return null;
      },
      closeAgenda12Event: async (path, closing) => {
        log.push(`clore ${path} ${closing}`);
        if (state.fail !== null) throw state.fail;
        return { closed: "pro/salons/archives/embedded.md", successor: null };
      },
      reopenAgenda12Event: async (path) => {
        log.push(`rouvrir ${path}`);
        return { path: "pro/salons/embedded-2.md" };
      },
      listCountries: async () => (log.push("pays"), COUNTRIES),
    },
  });
  const column = document.createElement("div");
  column.append(band.element);
  document.body.replaceChildren(column);
  return { band, log, errors, opened, trashed, changes, state };
}

const field = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement & HTMLSelectElement;
/** Un bouton de la bande, par son texte ou, pour une icône seule, par son nom. */
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".agenda-band button")].find(
    (b) => b.textContent === text || b.getAttribute("aria-label") === text,
  ) as HTMLButtonElement;
const message = () => document.querySelector(".agenda-band-message") as HTMLElement;

function enter(label: string, value: string) {
  const control = field(label);
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("bande d'un événement : sa présentation", () => {
  it("l'en-tête porte le retour, le résumé et les actions ; le titre vient dessous, puis « Quand » et « Où »", async () => {
    const m = mount();
    await m.band.reload();
    const head = document.querySelector(".agenda-band-head") as HTMLElement;
    expect(head.querySelector(".agenda-back")?.textContent).toBe("← Salons");
    expect(head.querySelector(".agenda-summary")?.textContent).toBe(
      "10 – 13 février 2027 · Nuremberg, Allemagne",
    );
    expect(head.querySelectorAll(".agenda-band-actions button")).toHaveLength(3);
    const fields = [...(document.querySelector(".agenda-fields") as HTMLElement).children];
    expect(fields.map((e) => e.className.split(" ")[0])).toEqual([
      "agenda-title-input",
      "agenda-group",
      "agenda-group",
    ]);
  });

  it("« Quand » réunit le jour, le mois et l'année, puis « au », le jour et le mois de la fin ; « Où », le pays et la ville", async () => {
    const m = mount();
    await m.band.reload();
    const group = (name: string) =>
      document.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement;
    const labels = (name: string) =>
      [...group(name).querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label"));
    expect(labels("Quand")).toEqual(["Jour", "Mois", "Année", "Fin : jour", "Fin : mois"]);
    expect(group("Quand").querySelector(".agenda-range-to")?.textContent).toBe("au");
    expect(labels("Où")).toEqual(["Pays", "Retirer le pays", "Liste des pays", "Ville"]);
    expect(group("Où").querySelector(".agenda-group-label")?.textContent).toBe("Où");
  });

  it("le résumé suit l'événement relu", async () => {
    const m = mount(detailOf(eventItem({ day: null, year: null, end: null, city: null })));
    await m.band.reload();
    expect(document.querySelector(".agenda-summary")?.textContent).toBe("février · Allemagne");
    m.state.detail = detailOf(eventItem({ day: 3, end: null }));
    await m.band.reload(true);
    expect(document.querySelector(".agenda-summary")?.textContent).toBe(
      "3 février 2027 · Nuremberg, Allemagne",
    );
  });

  it("« Clore » est l'action principale (pleine), la corbeille une icône seule nommée", async () => {
    const m = mount();
    await m.band.reload();
    const fill = (b: HTMLElement) => getComputedStyle(b).backgroundColor;
    const transparent = "rgba(0, 0, 0, 0)";
    expect(fill(button("Clore"))).not.toBe(transparent);
    expect(fill(button("Rouvrir"))).not.toBe(fill(button("Clore")));
    const trash = button("Placer dans la corbeille");
    expect(trash.textContent).toBe("");
    expect(trash.title).toBe("Placer dans la corbeille");
    expect(trash.querySelector("svg")).not.toBeNull();
  });

  it("le titre est un champ sans cadre, grand, dont le cadre paraît au focus", async () => {
    const m = mount();
    await m.band.reload();
    const title = field("Titre");
    expect(getComputedStyle(title).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(24);
    title.focus();
    expect(getComputedStyle(title).borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});

describe("bande d'un événement : ce qu'elle montre", () => {
  it("montre chaque champ de l'événement, et le lien vers l'agenda 12", async () => {
    const m = mount();
    await m.band.reload();
    expect(field("Titre").value).toBe("Salon Embedded World");
    expect(field("Mois").value).toBe("2");
    expect(field("Jour").value).toBe("10");
    expect(field("Année").value).toBe("2027");
    expect(field("Fin : jour").value).toBe("13");
    expect(field("Fin : mois").value).toBe("2");
    expect(field("Pays").value).toBe("🇩🇪 Allemagne");
    expect(field("Ville").value).toBe("Nuremberg");
    expect(button("← Salons")).toBeDefined();
    expect(m.log).toEqual([`lire ${PATH}`]);
  });

  it("les mois s'écrivent en toutes lettres, de janvier à décembre", async () => {
    const m = mount();
    await m.band.reload();
    const names = [...field("Mois").options].map((o) => o.textContent);
    expect(names[0]).toBe("Janvier");
    expect(names[11]).toBe("Décembre");
    expect(names).toHaveLength(12);
  });

  it("un événement sans jour, année, fin, pays ni ville a des champs vides, et le mois de fin est grisé", async () => {
    const m = mount(
      detailOf(
        eventItem({ day: null, year: null, end: null, country: null, city: null, month: 5 }),
      ),
    );
    await m.band.reload();
    for (const label of ["Jour", "Année", "Fin : jour", "Pays", "Ville"])
      expect(field(label).value).toBe("");
    expect(field("Fin : mois").value).toBe("5");
    expect(field("Fin : mois").disabled).toBe(true);
    expect(field("Mois").value).toBe("5");
  });

  it("une fin sur un autre mois montre ce mois", async () => {
    const m = mount(detailOf(eventItem({ end: { day: 2, month: 3 } })));
    await m.band.reload();
    expect(field("Fin : mois").value).toBe("3");
    expect(field("Fin : mois").disabled).toBe(false);
  });

  it("ouvert : « Clore » et « Placer dans la corbeille », pas « Rouvrir »", async () => {
    const m = mount();
    await m.band.reload();
    expect(button("Clore").hidden).toBe(false);
    expect(button("Rouvrir").hidden).toBe(true);
    expect(button("Placer dans la corbeille").hidden).toBe(false);
    expect((document.querySelector(".agenda-closed-on") as HTMLElement).hidden).toBe(true);
    expect((document.querySelector(".agenda-band") as HTMLElement).dataset.closed).toBe("false");
  });

  it("clos : le jour de clôture, « Rouvrir » et « Placer dans la corbeille », pas « Clore »", async () => {
    const m = mount(detailOf(eventItem({ closedOn: "2026-11-27" }), true));
    await m.band.reload();
    expect(button("Clore").hidden).toBe(true);
    expect(button("Rouvrir").hidden).toBe(false);
    const closed = document.querySelector(".agenda-closed-on") as HTMLElement;
    expect(closed.hidden).toBe(false);
    expect(closed.textContent).toBe("Clos le 27/11/2026");
    expect((document.querySelector(".agenda-band") as HTMLElement).dataset.closed).toBe("true");
  });

  it("clos sans jour de clôture retenu : seulement « Clos »", async () => {
    const m = mount(detailOf(eventItem({ closedOn: null }), true));
    await m.band.reload();
    expect(document.querySelector(".agenda-closed-on")?.textContent).toBe("Clos");
  });

  it("une saisie en cours n'est pas écrasée par une relecture, sauf si on la force", async () => {
    const m = mount();
    await m.band.reload();
    const city = field("Ville");
    city.focus();
    city.value = "Hanovre";
    await m.band.reload();
    expect(city.value).toBe("Hanovre");
    await m.band.reload(true);
    expect(city.value).toBe("Nuremberg");
  });

  it("une lecture refusée est dite", async () => {
    const m = mount();
    m.state.readFails = true;
    await m.band.reload();
    expect(m.errors).toEqual([{ message: "Cet événement n'existe plus." }]);
  });

  it("une réponse arrivée après une relecture plus récente est ignorée", async () => {
    const m = mount(detailOf(eventItem({ city: "Ancienne" })));
    let release = () => {};
    m.state.hold = new Promise((resolve) => (release = resolve));
    const slow = m.band.reload();
    m.state.hold = null;
    m.state.detail = detailOf(eventItem({ city: "Récente" }));
    await m.band.reload();
    release();
    await slow;
    expect(field("Ville").value).toBe("Récente");
  });

  it("la bande détruite quitte l'écran", async () => {
    const m = mount();
    await m.band.reload();
    m.band.destroy();
    expect(document.querySelector(".agenda-band")).toBeNull();
  });

  it("met le curseur sur le titre, sélectionné", async () => {
    const m = mount();
    await m.band.reload();
    m.band.focusTitle();
    expect(document.activeElement).toBe(field("Titre"));
    expect(field("Titre").selectionStart).toBe(0);
    expect(field("Titre").selectionEnd).toBe("Salon Embedded World".length);
  });
});

describe("bande d'un événement : chaque champ est un geste", () => {
  async function gesture(label: string, value: string) {
    const m = mount();
    await m.band.reload();
    m.log.length = 0;
    enter(label, value);
    await vi.waitFor(() => expect(m.changes).toHaveLength(1));
    await vi.waitFor(() => expect(m.log.filter((l) => l.startsWith("lire"))).toHaveLength(1));
    return m;
  }

  it("le titre", async () => {
    const m = await gesture("Titre", "Embedded World 2027");
    expect(m.changes).toEqual([{ kind: "title", title: "Embedded World 2027" }]);
  });

  it("le mois", async () => {
    expect((await gesture("Mois", "3")).changes).toEqual([{ kind: "month", month: 3 }]);
  });

  it("le jour", async () => {
    expect((await gesture("Jour", " 12 ")).changes).toEqual([{ kind: "day", day: 12 }]);
  });

  it("effacer le jour", async () => {
    expect((await gesture("Jour", "")).changes).toEqual([{ kind: "day", day: null }]);
  });

  it("l'année", async () => {
    expect((await gesture("Année", "2028")).changes).toEqual([{ kind: "year", year: 2028 }]);
  });

  it("effacer l'année", async () => {
    expect((await gesture("Année", "")).changes).toEqual([{ kind: "year", year: null }]);
  });

  it("le jour de fin, avec le mois de fin montré", async () => {
    expect((await gesture("Fin : jour", "14")).changes).toEqual([
      { kind: "end", end: { day: 14, month: 2 } },
    ]);
  });

  it("le mois de fin", async () => {
    expect((await gesture("Fin : mois", "3")).changes).toEqual([
      { kind: "end", end: { day: 13, month: 3 } },
    ]);
  });

  it("effacer le jour de fin efface la fin", async () => {
    expect((await gesture("Fin : jour", "")).changes).toEqual([{ kind: "end", end: null }]);
  });

  it("la ville, sans les espaces autour", async () => {
    expect((await gesture("Ville", "  Hanovre ")).changes).toEqual([
      { kind: "city", city: "Hanovre" },
    ]);
  });

  it("effacer la ville", async () => {
    expect((await gesture("Ville", "  ")).changes).toEqual([{ kind: "city", city: null }]);
  });

  it("le pays, choisi dans la liste des pays lue une seule fois", async () => {
    const m = mount();
    await m.band.reload();
    const input = field("Pays");
    input.focus();
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".agenda-country-option")).toHaveLength(3),
    );
    document.querySelector<HTMLElement>(`[data-code="${FRANCE.code}"]`)?.click();
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "country", country: "FR" }]));
    input.blur();
    input.focus();
    await vi.waitFor(() => expect(document.querySelector(".agenda-country-list")).not.toBeNull());
    expect(m.log.filter((l) => l === "pays")).toHaveLength(1);
  });

  it("retirer le pays", async () => {
    const m = mount();
    await m.band.reload();
    document.querySelector<HTMLElement>(".agenda-country-clear")?.click();
    await vi.waitFor(() => expect(m.changes).toEqual([{ kind: "country", country: null }]));
  });

  it("enregistre le texte d'abord, écrit la clé, relit le texte puis la bande, dans cet ordre", async () => {
    const m = mount();
    await m.band.reload();
    m.log.length = 0;
    enter("Ville", "Hanovre");
    await vi.waitFor(() =>
      expect(m.log).toEqual(["enregistrer", "relire le texte", `lire ${PATH}`]),
    );
  });

  it("un nombre mal écrit est refusé dans la bande, sans aller à Rust", async () => {
    const m = mount();
    await m.band.reload();
    enter("Jour", "douze");
    expect(message().hidden).toBe(false);
    expect(message().textContent).toBe("Un nombre entier est attendu.");
    expect(message().getAttribute("role")).toBe("alert");
    enter("Année", "20x7");
    enter("Fin : jour", "1,5");
    expect(m.changes).toEqual([]);
  });

  it("le refus du moteur est montré tel quel dans la bande, les champs retrouvent ce qui est écrit, le message s'efface au geste suivant", async () => {
    const m = mount();
    await m.band.reload();
    m.state.fail = { message: "Ce jour n'existe pas dans ce mois." };
    enter("Jour", "31");
    await vi.waitFor(() =>
      expect(message().textContent).toBe("Ce jour n'existe pas dans ce mois."),
    );
    expect(message().hidden).toBe(false);
    expect(field("Jour").value).toBe("10");
    m.state.fail = null;
    enter("Jour", "11");
    await vi.waitFor(() => expect(message().hidden).toBe(true));
    expect(message().textContent).toBe("");
  });
});

describe("bande d'un événement : les gestes se suivent", () => {
  it("un geste lancé pendant un autre attend sa fin, et la bande est occupée entre-temps", async () => {
    const m = mount();
    await m.band.reload();
    let release = () => {};
    m.state.flushHold = new Promise((resolve) => (release = resolve));
    const element = document.querySelector(".agenda-band") as HTMLElement;
    enter("Ville", "Hanovre");
    enter("Jour", "12");
    expect(element.getAttribute("aria-busy")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Le premier geste n'a pas fini d'enregistrer le texte : rien n'est encore écrit.
    expect(m.changes).toEqual([]);
    m.state.flushHold = null;
    release();
    await vi.waitFor(() => expect(m.changes).toHaveLength(2));
    expect(m.changes).toEqual([
      { kind: "city", city: "Hanovre" },
      { kind: "day", day: 12 },
    ]);
    await vi.waitFor(() => expect(element.hasAttribute("aria-busy")).toBe(false));
  });
});

describe("bande d'un événement : clore, rouvrir, supprimer, revenir", () => {
  it("« Clore » demande par le titre, clôt seul, puis ouvre la grille de l'agenda 12", async () => {
    const m = mount();
    await m.band.reload();
    m.log.length = 0;
    button("Clore").click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons.md"]));
    expect(m.state.asked).toEqual(["Salon Embedded World"]);
    expect(m.log).toEqual(["enregistrer", `clore ${PATH} alone`]);
  });

  it("« Clore et préparer le suivant » clôt avec sa copie", async () => {
    const m = mount();
    await m.band.reload();
    m.state.closing = "withSuccessor";
    button("Clore").click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons.md"]));
    expect(m.log).toContain(`clore ${PATH} withSuccessor`);
  });

  it("« Annuler » ne clôt rien et n'ouvre rien", async () => {
    const m = mount();
    await m.band.reload();
    m.state.closing = null;
    button("Clore").click();
    await vi.waitFor(() => expect(m.state.asked).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.opened).toEqual([]);
    expect(m.log.some((l) => l.startsWith("clore"))).toBe(false);
  });

  it("un refus de la clôture est montré dans la bande, et la bande est relue", async () => {
    const m = mount();
    await m.band.reload();
    m.state.fail = { message: "Cet événement est déjà clos." };
    button("Clore").click();
    await vi.waitFor(() => expect(message().textContent).toBe("Cet événement est déjà clos."));
    expect(m.opened).toEqual([]);
  });

  it("« Rouvrir » remet l'événement dans la grille et ouvre sa note sous son nouveau chemin", async () => {
    const m = mount(detailOf(eventItem({ closedOn: "2026-11-27" }), true));
    await m.band.reload();
    button("Rouvrir").click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons/embedded-2.md"]));
    expect(m.log).toContain(`rouvrir ${PATH}`);
  });

  it("« Placer dans la corbeille » donne la note, le titre et l'agenda 12", async () => {
    const m = mount();
    await m.band.reload();
    button("Placer dans la corbeille").click();
    await vi.waitFor(() =>
      expect(m.trashed).toEqual([
        { path: PATH, title: "Salon Embedded World", agenda: "pro/salons.md" },
      ]),
    );
  });

  it("le lien « ← Salons » ouvre la grille de l'agenda 12, après avoir enregistré le texte", async () => {
    const m = mount();
    await m.band.reload();
    m.log.length = 0;
    button("← Salons").click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons.md"]));
    expect(m.log).toEqual(["enregistrer"]);
  });

  it("avant la première lecture, les boutons qui visent l'événement ne font rien", async () => {
    const m = mount();
    document.querySelector<HTMLElement>(".agenda-back")?.click();
    button("Clore").click();
    button("Placer dans la corbeille").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.opened).toEqual([]);
    expect(m.trashed).toEqual([]);
    expect(m.state.asked).toEqual([]);
  });
});
