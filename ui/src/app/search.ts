// Recherche dans tout l'espace de travail : chaque frappe se voit ; la recherche part après une courte pause.
import type * as Bridge from "../bridge";
import { timerScheduler } from "../state/autosave";
import { createDebouncer, SEARCH_DELAY_MS } from "../state/debounce";
import { noteOrder, searchable, searchAnswered, searchTyped } from "../state/screen";
import type { CurrentScreen } from "./current-screen";

export interface SearchDeps {
  readonly backend: Pick<typeof Bridge, "searchNotes">;
  readonly screen: CurrentScreen;
  run(action: Promise<unknown>): void;
}

export interface Search {
  /** Chaque frappe montre la recherche ; elle part vers Rust après une courte pause, dès le seuil atteint. */
  type(query: string): void;
  /** Cherche tout de suite, et montre la réponse. */
  search(query: string): Promise<void>;
}

export function createSearch(deps: SearchDeps): Search {
  const later = createDebouncer(timerScheduler(SEARCH_DELAY_MS));
  const search = (query: string) =>
    deps.screen.answer(
      deps.backend.searchNotes(query, noteOrder(deps.screen.get())),
      (now, answer) => searchAnswered(now, query, answer),
    );
  return {
    search,
    type: (query) => {
      deps.screen.show(searchTyped(deps.screen.get(), query));
      if (!searchable(query)) return later.cancel();
      later(() => deps.run(search(query)));
    },
  };
}
