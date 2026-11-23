// Recherche dans tout l'espace de travail : chaque frappe se voit ; la recherche part après une courte pause.
// Par les mots, ou par le sens (fiche 0042) : le mode se choisit sous le champ.
import type * as Bridge from "../bridge";
import type { Layout } from "../screens/layout";
import { timerScheduler } from "../state/autosave";
import { createDebouncer, SEARCH_DELAY_MS } from "../state/debounce";
import { noteOrder, searchable, searchAnswered, searchedQuery, searchTyped } from "../state/screen";
import type { CurrentScreen } from "./current-screen";
import { createMeaning, type Meaning, type MeaningDeps } from "./meaning";

export interface SearchDeps extends Pick<MeaningDeps, "show" | "run" | "columns"> {
  readonly backend: Pick<typeof Bridge, "searchNotes" | "searchNotesWithMeaning"> &
    MeaningDeps["backend"];
  readonly screen: CurrentScreen;
  readonly layout: Pick<Layout, "searchMode" | "confirmation">;
}

export interface Search {
  /** Chaque frappe montre la recherche ; elle part vers Rust après une courte pause, dès le seuil atteint. */
  type(query: string): void;
  /** Cherche tout de suite, et montre la réponse. */
  search(query: string): Promise<void>;
  /** Le sens : le mode de recherche, les modèles, le calcul, les notes proches. */
  readonly meaning: Meaning;
}

export function createSearch(deps: SearchDeps): Search {
  const later = createDebouncer(timerScheduler(SEARCH_DELAY_MS));
  const meaning: Meaning = createMeaning({ ...deps, searchAgain: () => again() });
  const search = (query: string) =>
    meaning.mode() === "meaning"
      ? deps.screen.answer(deps.backend.searchNotesWithMeaning(query), (now, found) =>
          searchAnswered(now, query, found.results, found.meaning),
        )
      : deps.screen.answer(
          deps.backend.searchNotes(query, noteOrder(deps.screen.get())),
          (now, answer) => searchAnswered(now, query, answer),
        );
  /** Refait la recherche en cours, le mode ou le sens ayant changé. */
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
