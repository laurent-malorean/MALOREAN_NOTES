import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agenda12Item } from "../bridge";
import { agendaItem, eventItem, plainEvent } from "../../test-support/agenda-12-fixture";
import { type Agenda12Backend, createAgenda12View } from "./agenda-12-view";
import "../theme.css";
import "../style.css";

afterEach(() => document.body.replaceChildren());

const PATH = "pro/salons.md";

const SALON = eventItem();
const AUDIT = plainEvent("pro/salons/audit.md", "Audit ISO", 1);
const DOMAINS = eventItem({
  ...{ path: "pro/salons/domaines.md", title: "Renouveler malorean.fr", month: 2 },
  ...{ day: null, year: 2029, end: null, country: null, city: null, tags: [] },
  line: {
    ...{ date: null, year: 2029, yearTone: "later", flag: null, city: null },
    ...{ title: "Renouveler malorean.fr", text: "[2029] – Renouveler malorean.fr" },
  },
});

function mount(data: () => Agenda12Item = () => agendaItem([SALON, DOMAINS, AUDIT])) {
  const container = document.createElement("div");
  container.style.cssText = "width:1200px;height:700px;display:flex;flex-direction:column";
  document.body.replaceChildren(container);
  const calls: string[] = [];
  const opened: string[] = [];
  const errors: unknown[] = [];
  const state = {
    ...{ data, failRead: false, failCreate: false, failColumns: false },
    hold: null as Promise<void> | null,
  };
  const backend: Agenda12Backend = {
    readAgenda12: async (path, tag) => {
      calls.push(`lire ${path} ${tag}`);
      if (state.failRead) throw { message: "Agenda illisible" };
      // Ce que Rust lisait à l'appel ; la réponse peut être retenue.
      const read = state.data();
      await state.hold;
      return read;
    },
    changeAgenda12Columns: async (path, columns) => {
      calls.push(`colonnes ${path} ${columns}`);
      if (state.failColumns) throw { message: "« 5 » colonnes : la grille a 3, 4 ou 6 colonnes." };
      return null;
    },
    createAgenda12Event: async (agenda, month) => {
      calls.push(`créer ${agenda} ${month}`);
      if (state.failCreate) throw { message: "« 13 » n'est pas un mois" };
      return { path: "pro/salons/sans-titre.md" };
    },
    reopenAgenda12Event: async (path) => {
      calls.push(`rouvrir ${path}`);
      return { path: "pro/salons/rouvert.md" };
    },
  };
  const view = createAgenda12View({
    backend,
    path: PATH,
    error: (error) => errors.push(error),
    open: (path, created) => opened.push(`${path} ${created}`),
  });
  container.append(view.element);
  return { view, calls, opened, errors, state, container };
}

const cell = (month: number) =>
  document.querySelector(`.agenda-cell[data-month="${month}"]`) as HTMLElement;
const lines = (month: number) =>
  [...cell(month).querySelectorAll(".agenda-line")].map((line) => line.textContent);
const columnButton = (count: number) =>
  document.querySelector(`.agenda-columns-choice[data-columns="${count}"]`) as HTMLButtonElement;
const filter = () => document.querySelector(".agenda-filter") as HTMLSelectElement;
const link = () => document.querySelector(".agenda-archives-link") as HTMLButtonElement;

describe("grille d'agenda 12 : les douze cases", () => {
  it("montre le titre, puis douze cases de janvier à décembre, une par mois", async () => {
    const m = mount();
    await m.view.reload();
    expect(document.querySelector(".agenda-title-bar")?.textContent).toBe("Salons");
    const names = [...document.querySelectorAll(".agenda-month")].map((n) => n.textContent);
    expect(names).toEqual([
      ...["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
      ...["Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
    ]);
    expect(m.calls).toEqual([`lire ${PATH} null`]);
  });

  it("range chaque événement dans la case de son mois, dans l'ordre que Rust donne, sans l'aplatir", async () => {
    const m = mount();
    await m.view.reload();
    expect(lines(1)).toEqual(["Audit ISO"]);
    expect(lines(2)).toEqual([
      "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World",
      "2029 – Renouveler malorean.fr",
    ]);
    expect(lines(3)).toEqual([]);
  });

  it("une ligne porte sa ligne entière en info-bulle et son chemin", async () => {
    const m = mount();
    await m.view.reload();
    const line = cell(2).querySelector<HTMLElement>(".agenda-line");
    expect(line?.title).toBe("10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World");
    expect(line?.dataset.path).toBe("pro/salons/embedded.md");
  });

  it("un clic sur une ligne ouvre la note de l'événement, sans curseur sur le titre", async () => {
    const m = mount();
    await m.view.reload();
    cell(1).querySelector<HTMLElement>(".agenda-line")?.click();
    expect(m.opened).toEqual(["pro/salons/audit.md false"]);
  });

  it("une case trop pleine défile ; les cases d'une ligne ont la même hauteur", async () => {
    const many = Array.from({ length: 40 }, (_, i) => plainEvent(`e${i}.md`, `Salon ${i}`, 3));
    const m = mount(() => agendaItem(many));
    await m.view.reload();
    const full = cell(3).querySelector(".agenda-events") as HTMLElement;
    expect(getComputedStyle(full).overflowY).toBe("auto");
    expect(full.scrollHeight).toBeGreaterThan(full.clientHeight);
    const row = [1, 2, 3, 4].map((month) => cell(month).getBoundingClientRect().height);
    expect(new Set(row.map(Math.round)).size).toBe(1);
  });
});

describe("grille d'agenda 12 : le nombre de colonnes", () => {
  it("montre 3, 4 et 6, le nombre de l'agenda 12 enfoncé, et dispose les cases sur ce nombre de colonnes", async () => {
    const m = mount(() => agendaItem([], { columns: 6 }));
    await m.view.reload();
    const pressed = [3, 4, 6].map((n) => columnButton(n).getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "false", "true"]);
    const grid = document.querySelector(".agenda-grid") as HTMLElement;
    const tops = new Set([...grid.children].map((c) => Math.round(c.getBoundingClientRect().top)));
    expect(tops.size).toBe(2);
    expect(grid.style.getPropertyValue("--agenda-columns")).toBe("6");
  });

  it("choisir un nombre le garde dans l'agenda 12, puis relit la grille", async () => {
    let columns = 4;
    const m = mount(() => agendaItem([], { columns }));
    await m.view.reload();
    columns = 3;
    columnButton(3).click();
    await vi.waitFor(() => expect(columnButton(3).getAttribute("aria-pressed")).toBe("true"));
    expect(m.calls).toEqual([`lire ${PATH} null`, `colonnes ${PATH} 3`, `lire ${PATH} null`]);
    expect(columnButton(4).getAttribute("aria-pressed")).toBe("false");
  });

  it("un refus du moteur est dit, et la grille est relue quand même", async () => {
    const m = mount();
    await m.view.reload();
    m.state.failColumns = true;
    columnButton(6).click();
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
    expect(m.errors[0]).toEqual({ message: "« 5 » colonnes : la grille a 3, 4 ou 6 colonnes." });
    await vi.waitFor(() => expect(m.calls).toHaveLength(3));
  });
});

describe("grille d'agenda 12 : le filtre par étiquette", () => {
  it("propose « Toutes » puis les étiquettes de l'agenda 12", async () => {
    const m = mount(() => agendaItem([SALON], { tags: ["domaine", "salon"] }));
    await m.view.reload();
    expect([...filter().options].map((o) => o.textContent)).toEqual(["Toutes", "domaine", "salon"]);
    expect(filter().value).toBe("");
  });

  it("choisir une étiquette relit la grille avec elle ; « Toutes » retire le filtre", async () => {
    const m = mount(() => agendaItem([SALON], { tags: ["domaine", "salon"] }));
    await m.view.reload();
    filter().value = "salon";
    filter().dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(m.calls).toContain(`lire ${PATH} salon`));
    await vi.waitFor(() => expect(filter().value).toBe("salon"));
    filter().value = "";
    filter().dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(m.calls.at(-1)).toBe(`lire ${PATH} null`));
  });

  it("une étiquette que plus aucun événement ne porte n'est plus un filtre : la grille est relue sans elle", async () => {
    let tags = ["salon"];
    const m = mount(() => agendaItem([SALON], { tags }));
    await m.view.reload();
    filter().value = "salon";
    filter().dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(m.calls).toContain(`lire ${PATH} salon`));
    tags = [];
    await m.view.reload();
    expect(m.calls.slice(-2)).toEqual([`lire ${PATH} salon`, `lire ${PATH} null`]);
    expect(filter().value).toBe("");
  });
});

describe("grille d'agenda 12 : créer un événement", () => {
  it("chaque case a un « + » nommé d'après son mois", async () => {
    const m = mount();
    await m.view.reload();
    const names = [...document.querySelectorAll(".agenda-add")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(names[0]).toBe("Ajouter un événement en janvier");
    expect(names[7]).toBe("Ajouter un événement en août");
    expect(names).toHaveLength(12);
  });

  it("le « + » crée l'événement du mois de sa case et l'ouvre, le curseur sur le titre", async () => {
    const m = mount();
    await m.view.reload();
    cell(8).querySelector<HTMLElement>(".agenda-add")?.click();
    await vi.waitFor(() => expect(m.opened).toEqual(["pro/salons/sans-titre.md true"]));
    expect(m.calls).toContain(`créer ${PATH} 8`);
  });

  it("un refus du moteur est dit, sans ouvrir de note, et la grille est relue", async () => {
    const m = mount();
    await m.view.reload();
    m.state.failCreate = true;
    cell(1).querySelector<HTMLElement>(".agenda-add")?.click();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "« 13 » n'est pas un mois" }]));
    expect(m.opened).toEqual([]);
    await vi.waitFor(() => expect(m.calls.at(-1)).toBe(`lire ${PATH} null`));
  });
});

describe("grille d'agenda 12 : les archives", () => {
  const closed = eventItem({
    ...{ path: "pro/salons/archives/rotterdam.md", title: "Salon de Rotterdam" },
    closedOn: "2026-11-27",
    line: { ...SALON.line, title: "Salon de Rotterdam" },
  });
  const lonely = plainEvent("pro/salons/archives/vieux.md", "Vieux salon", 5);

  it("le lien « Archives » montre les événements clos avec leur ligne et leur jour de clôture, « Grille » revient", async () => {
    const m = mount(() => agendaItem([SALON], { archives: [closed, lonely] }));
    await m.view.reload();
    expect(link().textContent).toBe("Archives");
    link().click();
    expect(link().textContent).toBe("Grille");
    expect(document.querySelector(".agenda-grid")).toBeNull();
    const rows = [...document.querySelectorAll(".agenda-archives .agenda-event")];
    expect(rows.map((r) => r.querySelector(".agenda-line")?.textContent)).toEqual([
      "10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon de Rotterdam",
      "Vieux salon",
    ]);
    expect(rows[0]?.querySelector(".agenda-closed")?.textContent).toBe("clos le 27/11/2026");
    expect(rows[1]?.querySelector(".agenda-closed")?.textContent).toBe("");
    // Les archives n'ont ni filtre ni colonnes.
    expect(filter().hidden).toBe(true);
    expect(document.querySelector<HTMLElement>(".agenda-columns")?.hidden).toBe(true);
    link().click();
    expect(document.querySelector(".agenda-grid")).not.toBeNull();
    expect(filter().hidden).toBe(false);
  });

  it("un clic sur un événement clos ouvre sa note", async () => {
    const m = mount(() => agendaItem([], { archives: [closed] }));
    await m.view.reload();
    link().click();
    document.querySelector<HTMLElement>(".agenda-archives .agenda-line")?.click();
    expect(m.opened).toEqual(["pro/salons/archives/rotterdam.md false"]);
  });

  it("« Rouvrir » remet l'événement dans la grille, qui est relue", async () => {
    let archives = [closed];
    const m = mount(() => agendaItem([], { archives }));
    await m.view.reload();
    link().click();
    archives = [];
    document.querySelector<HTMLElement>(".agenda-reopen")?.click();
    await vi.waitFor(() => expect(document.querySelector(".agenda-empty")).not.toBeNull());
    expect(m.calls).toContain("rouvrir pro/salons/archives/rotterdam.md");
    expect(document.querySelector(".agenda-empty")?.textContent).toBe("Aucun événement clos.");
  });

  it("le bouton « Rouvrir » nomme l'événement pour les lecteurs d'écran", async () => {
    const m = mount(() => agendaItem([], { archives: [closed] }));
    await m.view.reload();
    link().click();
    expect(document.querySelector(".agenda-reopen")?.getAttribute("aria-label")).toBe(
      "Rouvrir « Salon de Rotterdam »",
    );
  });
});

describe("grille d'agenda 12 : événements illisibles, erreurs, relectures", () => {
  it("signale chaque événement illisible, et un clic ouvre sa note", async () => {
    const m = mount(() => agendaItem([], { unreadable: ["pro/salons/casse.md"] }));
    await m.view.reload();
    const notice = document.querySelector(".agenda-unreadable") as HTMLElement;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe("Événement illisible : pro/salons/casse.md");
    notice.querySelector("button")?.click();
    expect(m.opened).toEqual(["pro/salons/casse.md false"]);
  });

  it("sans événement illisible, rien n'est signalé", async () => {
    const m = mount();
    await m.view.reload();
    expect((document.querySelector(".agenda-unreadable") as HTMLElement).hidden).toBe(true);
  });

  it("une lecture refusée est dite, jamais passée sous silence", async () => {
    const m = mount();
    m.state.failRead = true;
    await m.view.reload();
    expect(m.errors).toEqual([{ message: "Agenda illisible" }]);
  });

  it("une réponse arrivée après une relecture plus récente est ignorée", async () => {
    let release = () => {};
    const m = mount(() => agendaItem([], { title: "Ancien" }));
    m.state.hold = new Promise((resolve) => (release = resolve));
    const slow = m.view.reload();
    m.state.hold = null;
    m.state.data = () => agendaItem([], { title: "Récent" });
    await m.view.reload();
    release();
    await slow;
    expect(document.querySelector(".agenda-title-bar")?.textContent).toBe("Récent");
  });

  it("détruite, la grille quitte l'écran", async () => {
    const m = mount();
    await m.view.reload();
    m.view.destroy();
    expect(document.querySelector(".agenda")).toBeNull();
  });

  it("les couleurs de la pastille viennent du thème : jamais en dur", async () => {
    const m = mount();
    await m.view.reload();
    const tones = [...document.querySelectorAll<HTMLElement>(".agenda-year")].map(
      (pill) => [pill.dataset.tone, getComputedStyle(pill).backgroundColor] as const,
    );
    expect(tones.map(([tone]) => tone)).toEqual(["next", "later"]);
    expect(tones[0]?.[1]).not.toBe(tones[1]?.[1]);
  });
});
