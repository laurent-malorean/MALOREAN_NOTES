import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceScreen, recordedScreen } from "../../test-support/app-fixture";
import {
  fakeMeaning,
  meaningLayout,
  overviewOf,
  withDownloaded,
} from "../../test-support/meaning-fixture";
import type { SearchResultItem } from "../bridge";
import { SEARCH_DELAY_MS } from "../state/debounce";
import type { NoteOrder } from "../state/note-order";
import { searchTyped } from "../state/screen";
import { createSearch } from "./search";

const found = (path: string): SearchResultItem => ({
  path,
  title: path,
  folder: "",
  contentType: "note",
  container: null,
  containerTitle: null,
  node: null,
  modified: 0,
  excerpt: [],
});

function setup(start = workspaceScreen(), overview = overviewOf()) {
  const { screen, shown } = recordedScreen(start);
  const queries: string[] = [];
  const orders: NoteOrder[] = [];
  const errors: unknown[] = [];
  const meaning = fakeMeaning(overview);
  const search = createSearch({
    backend: {
      ...meaning.backend,
      searchNotes: async (query, order) => {
        queries.push(query);
        orders.push(order);
        return [found(`${query}.md`)];
      },
    },
    screen,
    layout: meaningLayout(),
    columns: { panes: () => new Map() },
    show: () => {},
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const shownSearch = () => {
    const now = screen.get();
    return now.kind === "workspace" ? now.search : undefined;
  };
  return { search, screen, shown, queries, orders, shownSearch, meaning, errors };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("recherche dans l'espace de travail", () => {
  it("montre chaque frappe, et cherche après une courte pause", async () => {
    const { search, queries, shownSearch } = setup();
    search.type("cou");
    expect(shownSearch()).toEqual({ query: "cou", results: null });
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(queries).toEqual([]);
    search.type("cour");
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(queries).toEqual(["cour"]);
    await vi.waitFor(() =>
      expect(shownSearch()).toEqual({
        query: "cour",
        results: [found("cour.md")],
        ideas: { results: [], meaning: { kind: "used" } },
      }),
    );
  });

  it("range les notes trouvées selon le tri de la liste", async () => {
    const t = setup(workspaceScreen([], (screen) => ({ ...screen, order: "title" })));
    t.screen.show(searchTyped(t.screen.get(), "pain"));
    await t.search.search("pain");
    expect(t.orders).toEqual(["title"]);
  });

  it("sous le seuil, la recherche prévue ne part pas", () => {
    const { search, queries, shownSearch } = setup();
    search.type("cou");
    search.type("co");
    expect(shownSearch()).toEqual({ query: "co", results: null });
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(queries).toEqual([]);
  });

  it("cherche tout de suite sur demande", async () => {
    const { search, screen, queries, shownSearch } = setup();
    search.type("cou");
    await search.search("cou");
    expect(queries).toEqual(["cou"]);
    expect(shownSearch()).toEqual({
      query: "cou",
      results: [found("cou.md")],
      ideas: { results: [], meaning: { kind: "used" } },
    });
    expect(screen.get().kind).toBe("workspace");
  });
});

describe("recherche par le sens, dans la même recherche", () => {
  const ready = withDownloaded(overviewOf(), { "e5-small": true });
  const used = { kind: "used" } as const;

  it("lance les deux recherches pour les mêmes mots, chacune remplit sa colonne", async () => {
    const t = setup(workspaceScreen(), ready);
    const meaning = { kind: "notComputed", model: "e5-small", message: "Pas fini." } as const;
    t.meaning.answerWith({ results: [found("sens.md")], meaning });
    t.screen.show(searchTyped(t.screen.get(), "dessert"));
    await t.search.search("dessert");
    expect(t.queries).toEqual(["dessert"]);
    expect(t.meaning.calls).toContain("chercher par le sens dessert");
    expect(t.shownSearch()).toEqual({
      query: "dessert",
      results: [found("dessert.md")],
      ideas: { results: [found("sens.md")], meaning },
    });
  });

  it("dit dans la réponse du sens que le modèle manque, sans empêcher les mots de répondre", async () => {
    const t = setup();
    const meaning = { kind: "modelMissing", model: "e5-small", message: "Pas de modèle." } as const;
    t.meaning.answerWith({ results: [], meaning });
    t.screen.show(searchTyped(t.screen.get(), "dessert"));
    await t.search.search("dessert");
    expect(t.shownSearch()?.results).toEqual([found("dessert.md")]);
    expect(t.shownSearch()?.ideas?.meaning).toEqual(meaning);
  });

  it("refait la recherche en cours quand le calcul du sens finit", async () => {
    const t = setup(workspaceScreen(), ready);
    await vi.waitFor(() => expect(t.meaning.calls).toEqual(["aperçu"]));
    t.screen.show(searchTyped(t.screen.get(), "dessert"));
    t.meaning.answerWith({ results: [found("sens.md")], meaning: used });
    t.meaning.computing({ kind: "finished", model: "e5-small" });
    await vi.waitFor(() => expect(t.shownSearch()?.ideas?.results).toEqual([found("sens.md")]));
    expect(t.queries).toEqual(["dessert"]);
  });

  it("ne refait rien quand le calcul finit sans recherche, ou sous le seuil", async () => {
    const t = setup(workspaceScreen(), ready);
    await vi.waitFor(() => expect(t.meaning.calls).toEqual(["aperçu"]));
    t.meaning.computing({ kind: "finished", model: "e5-small" });
    t.screen.show(searchTyped(t.screen.get(), "de"));
    t.meaning.computing({ kind: "finished", model: "e5-small" });
    await Promise.resolve();
    expect(t.queries).toEqual([]);
    expect(t.meaning.calls).not.toContain("chercher par le sens de");
  });
});
