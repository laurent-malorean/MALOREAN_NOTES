// Recherche dans tout l'espace de travail : chaque frappe se voit ; la recherche part après une courte pause.
// Une seule saisie lance les deux recherches, par les mots et par le sens (fiche 0051) : leurs réponses
// remplissent chacune sa colonne de la fenêtre de recherche.
import type * as Bridge from "../bridge";
import type { Layout } from "../screens/layout";
import { timerScheduler } from "../state/autosave";
import { createDebouncer, SEARCH_DELAY_MS } from "../state/debounce";
import {
  ideasAnswered,
  noteOrder,
  searchable,
  searchAnswered,
  searchedQuery,
  searchTyped,
} from "../state/screen";
import type { CurrentScreen } from "./current-screen";
import { createMeaning, type Meaning, type MeaningDeps } from "./meaning";

export interface SearchDeps extends Pick<MeaningDeps, "show" | "run" | "columns"> {
  readonly backend: Pick<typeof Bridge, "searchNotes" | "searchNotesByMeaning"> &
    MeaningDeps["backend"];
  readonly screen: CurrentScreen;
  readonly layout: Pick<Layout, "ideasCompute" | "confirmation">;
}

export interface Search {
  /** Chaque frappe montre la recherche ; elle part vers Rust après une courte pause, dès le seuil atteint. */
  type(query: string): void;
  /** Cherche tout de suite, par les mots et par le sens, et montre les deux réponses. */
  search(query: string): Promise<void>;
  /** Le sens : les modèles, le calcul, les notes proches. */
  readonly meaning: Meaning;
}

export function createSearch(deps: SearchDeps): Search {
  const later = createDebouncer(timerScheduler(SEARCH_DELAY_MS));
  const meaning: Meaning = createMeaning({ ...deps, searchAgain: () => again() });
  const search = async (query: string) => {
    const words = deps.screen.answer(
      deps.backend.searchNotes(query, noteOrder(deps.screen.get())),
      (now, answer) => searchAnswered(now, query, answer),
    );
    const ideas = deps.screen.answer(deps.backend.searchNotesByMeaning(query), (now, answer) =>
      ideasAnswered(now, query, answer),
    );
    await Promise.all([words, ideas]);
  };
  /** Refait la recherche en cours, le sens ayant changé. */
  const again = () => {
    const query = searchedQuery(deps.screen.get());
    if (query !== null) deps.run(search(query));
  };
  meaning.start();
  return {
    search,
    meaning,
    type: (query) => {
      deps.screen.show(searchTyped(deps.screen.get(), query));
      if (!searchable(query)) return later.cancel();
      later(() => deps.run(search(query)));
    },
  };
}
