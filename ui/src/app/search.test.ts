import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordedScreen } from "../../test-support/app-fixture";
import type { SearchResultItem } from "../bridge";
import { SEARCH_DELAY_MS } from "../state/debounce";
import { createSearch } from "./search";

const found = (path: string): SearchResultItem => ({
  path,
  title: path,
  folder: "",
  modified: 0,
  excerpt: [],
});

function setup() {
  const { screen, shown } = recordedScreen();
  const queries: string[] = [];
  const errors: unknown[] = [];
  const search = createSearch({
    backend: {
      searchNotes: async (query) => {
        queries.push(query);
        return [found(`${query}.md`)];
      },
    },
    screen,
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const shownSearch = () => {
    const now = screen.get();
    return now.kind === "library" ? now.search : undefined;
  };
  return { search, screen, shown, queries, shownSearch };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("recherche dans la bibliothèque", () => {
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
      expect(shownSearch()).toEqual({ query: "cour", results: [found("cour.md")] }),
    );
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
    expect(shownSearch()).toEqual({ query: "cou", results: [found("cou.md")] });
    expect(screen.get().kind).toBe("library");
  });
});
