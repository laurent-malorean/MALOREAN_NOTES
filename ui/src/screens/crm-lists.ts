// Les trois listes du CRM (fiche 0063, §§ 7.3 à 7.5) : Personnes, Entreprises, Projets. Ce qu'on y
// saisit (recherche, nom à créer, nom à changer) et ce qui est déplié sont gardés d'un dessin à
// l'autre ; Rust rend tout le reste.
import type { CrmItem } from "../bridge";
import { lookupsOf } from "../state/crm-card";
import { parseUnfolded, serializeUnfolded } from "../state/crm-lists";
import { companiesTab } from "./crm-companies";
import {
  type ListsActions,
  type ListsBackend,
  type ListsContext,
  type ListsState,
} from "./crm-lists-ui";
import { peopleTab } from "./crm-people";
import { projectsTab } from "./crm-projects";
import "./crm-lists.css";

/** Les onglets qui sont des listes. */
export type ListTab = "people" | "companies" | "projects";

/** Un onglet est-il une des trois listes ? */
export const isListTab = (tab: string): tab is ListTab =>
  tab === "people" || tab === "companies" || tab === "projects";

/** Ce que les listes gardent sur ce Mac : ce qui est déplié. */
export interface UnfoldedMemory {
  load(): string | null;
  store(raw: string): void;
}

const UNFOLDED_KEY = "crm-unfolded:";

/** Ce qui est déplié dans les listes du CRM `path`, gardé sur ce Mac (jamais dans le fichier). */
export function storedUnfolded(path: string): UnfoldedMemory {
  return {
    load() {
      try {
        return localStorage.getItem(UNFOLDED_KEY + path);
      } catch {
        return null;
      }
    },
    store(raw) {
      try {
        localStorage.setItem(UNFOLDED_KEY + path, raw);
      } catch {
        // Le stockage est refusé : ce qui est déplié n'est pas gardé.
      }
    },
  };
}

export interface ListsDeps {
  readonly path: string;
  readonly backend: ListsBackend;
  readonly memory: UnfoldedMemory;
  readonly act: Omit<ListsActions, "remember">;
}

export interface Lists {
  /** Ce que montre l'onglet `tab` pour ce CRM. */
  render(tab: ListTab, crm: CrmItem): HTMLElement;
}

export function createLists(deps: ListsDeps): Lists {
  const state: ListsState = {
    ...{ people: "", companies: "", adding: null, name: "", renaming: null, palette: null },
    ...{ tagDrafts: new Map<string, string>(), unfolded: parseUnfolded(deps.memory.load()) },
  };
  const act: ListsActions = {
    ...deps.act,
    remember: () => deps.memory.store(serializeUnfolded(state.unfolded)),
  };
  return {
    render(tab, crm) {
      const ctx: ListsContext = {
        ...{ crm, path: deps.path, lookups: lookupsOf(crm), state, backend: deps.backend, act },
      };
      // Le champ de nom ouvert ne passe pas d'une liste à l'autre.
      const own = { people: "person", companies: "company", projects: "project" }[tab];
      if (state.adding !== null && state.adding !== own) {
        state.adding = null;
        state.name = "";
      }
      return { people: peopleTab, companies: companiesTab, projects: projectsTab }[tab](ctx);
    },
  };
}
