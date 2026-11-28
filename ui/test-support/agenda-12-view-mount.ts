// Un écran de grille d'agenda 12 monté avec un faux moteur, pour les tests d'écran (fiche 0104).
import type { Agenda12Item } from "../src/bridge";
import { type Agenda12Backend, createAgenda12View } from "../src/screens/agenda-12-view";
import { agendaItem, eventItem, plainEvent } from "./agenda-12-fixture";

export const PATH = "pro/salons.md";

export const SALON = eventItem();
export const AUDIT = plainEvent("pro/salons/audit.md", "Audit ISO", 1);
export const DOMAINS = eventItem({
  ...{ path: "pro/salons/domaines.md", title: "Renouveler malorean.fr", month: 2 },
  ...{ day: null, year: 2029, end: null, country: null, city: null, tags: [] },
  line: {
    ...{ date: null, year: 2029, yearTone: "later", flag: null, city: null },
    ...{ title: "Renouveler malorean.fr", text: "[2029] – Renouveler malorean.fr" },
  },
});

export function mount(data: () => Agenda12Item = () => agendaItem([SALON, DOMAINS, AUDIT])) {
  const container = document.createElement("div");
  container.style.cssText = "width:1200px;height:700px;display:flex;flex-direction:column";
  document.body.replaceChildren(container);
  const calls: string[] = [];
  const opened: string[] = [];
  const errors: unknown[] = [];
  const state = {
    ...{ data, failRead: false, failCreate: false, failColumns: false, failLayout: false },
    layout: "grid" as Agenda12Item["layout"],
    hold: null as Promise<void> | null,
  };
  const backend: Agenda12Backend = {
    readAgenda12: async (path, tag) => {
      calls.push(`lire ${path} ${tag}`);
      if (state.failRead) throw { message: "Agenda illisible" };
      // Ce que Rust lisait à l'appel ; la réponse peut être retenue.
      const read = { ...state.data(), layout: state.layout };
      await state.hold;
      return read;
    },
    changeAgenda12Columns: async (path, columns) => {
      calls.push(`colonnes ${path} ${columns}`);
      if (state.failColumns) throw { message: "« 5 » colonnes : la grille a 3, 4 ou 6 colonnes." };
      return null;
    },
    changeAgenda12Layout: async (path, layout) => {
      calls.push(`vue ${path} ${layout}`);
      if (state.failLayout) throw { message: "cette note n'est pas un agenda 12" };
      state.layout = layout;
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
