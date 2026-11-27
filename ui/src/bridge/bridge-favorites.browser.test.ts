import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as bridge from "./index";

interface Call {
  readonly command: string;
  readonly args: unknown;
}

function recordCalls(answer: unknown = null): Call[] {
  const calls: Call[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return answer;
  });
  return calls;
}

afterEach(() => clearMocks());

describe("pont vers Rust : les favoris (fiche 0102)", () => {
  it("lit, choisit, crée et abandonne la note des favoris", async () => {
    const calls = recordCalls(null);
    expect(await bridge.favoritesNote()).toBeNull();
    await bridge.chooseFavoritesNote("Favoris.md");
    await bridge.createFavoritesNote("Favoris", "");
    await bridge.stopUsingFavoritesNote();
    expect(calls).toEqual([
      { command: "favorites_note", args: {} },
      { command: "choose_favorites_note", args: { path: "Favoris.md" } },
      { command: "create_favorites_note", args: { title: "Favoris", folder: "" } },
      { command: "stop_using_favorites_note", args: {} },
    ]);
  });

  it("lit l'étoile d'un contenu, l'ajoute, la retire et annule le retrait", async () => {
    const calls = recordCalls(false);
    expect(await bridge.isFavorite("a.md")).toBe(false);
    await bridge.addFavorite("a.md");
    await bridge.removeFavorite("a.md");
    await bridge.restoreFavorites([{ index: 2, text: "- [[A]]\n" }]);
    expect(calls).toEqual([
      { command: "is_favorite", args: { path: "a.md" } },
      { command: "add_favorite", args: { path: "a.md" } },
      { command: "remove_favorite", args: { path: "a.md" } },
      { command: "restore_favorites", args: { removed: [{ index: 2, text: "- [[A]]\n" }] } },
    ]);
  });
});
