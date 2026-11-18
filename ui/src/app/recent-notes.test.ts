import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  listed,
  recordedScreen,
} from "../../test-support/app-fixture";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { workspaceOpened, recentOn, type Screen, selectedNote, welcome } from "../state/screen";
import { createRecentNotes } from "./recent-notes";

function memoryStorage(values: Record<string, string> = {}) {
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => void (values[key] = value),
    removeItem: (key: string) => void Reflect.deleteProperty(values, key),
  };
}

const KEY = "malorean.recent:/lib";

function setup(start: Screen = workspaceScreen(), stored: Record<string, string> = {}) {
  const { screen } = recordedScreen(start);
  const columns = fakeColumns(noteOpened(columnsStarted, "b.md"));
  const log: string[] = [];
  columns.panes.set(columns.columns().active, fakePane("b.md", log));
  const storage = memoryStorage(stored);
  const existing = new Set(["a.md", "b.md", "Travail/c.md"]);
  const recent = createRecentNotes({
    backend: {
      listRecentNotes: async (paths) => {
        log.push(`récentes ${paths.join(" ")}`);
        await Promise.resolve();
        return paths.filter((path) => existing.has(path)).map((path) => listed(path));
      },
    },
    screen,
    columns: columns.open,
    storage,
  });
  const visit = (path: string) => recent.visited(noteOpened(columnsStarted, path));
  return { recent, screen, columns, log, storage, visit };
}

describe("notes récentes de l'espace de travail", () => {
  it("la note montrée par la colonne active passe en tête, et c'est gardé pour l'espace de travail", () => {
    const t = setup();
    t.visit("a.md");
    t.visit("Travail/c.md");
    t.visit("a.md");
    t.recent.visited(columnsStarted);
    expect(t.recent.paths()).toEqual(["a.md", "Travail/c.md"]);
    expect(t.storage.values).toEqual({ [KEY]: '["a.md","Travail/c.md"]' });
  });

  it("au relancement, reprennent celles gardées pour l'espace de travail ouvert", () => {
    const t = setup(workspaceScreen(), { [KEY]: '["b.md","a.md"]' });
    expect(t.recent.paths()).toEqual(["b.md", "a.md"]);
  });

  it("chaque espace de travail a les siennes ; l'accueil n'en a pas", () => {
    const t = setup(welcome, { [KEY]: '["b.md"]' });
    t.visit("a.md");
    expect(t.recent.paths()).toEqual([]);
    expect(t.storage.values).toEqual({ [KEY]: '["b.md"]' });
    t.screen.show(workspaceOpened({ name: "Autre", path: "/autre" }, [], []));
    t.visit("a.md");
    t.screen.show(workspaceScreen());
    expect(t.recent.paths()).toEqual(["b.md"]);
    expect(t.storage.values["malorean.recent:/autre"]).toBe('["a.md"]');
  });

  it("une note renommée ou déplacée reste, sous son nouveau chemin", () => {
    const t = setup(workspaceScreen(), { [KEY]: '["b.md","a.md"]' });
    t.recent.moved((path) => (path === "b.md" ? "Travail/b.md" : path));
    expect(t.recent.paths()).toEqual(["Travail/b.md", "a.md"]);
    expect(t.storage.values).toEqual({ [KEY]: '["Travail/b.md","a.md"]' });
  });

  it("les relire rend les notes dans leur ordre et oublie celles parties, pas celle ouverte entre-temps", async () => {
    const t = setup(workspaceScreen(), { [KEY]: '["b.md","partie.md","a.md"]' });
    const answer = t.recent.list();
    t.visit("Travail/c.md");
    expect((await answer).map((note) => note.path)).toEqual(["b.md", "a.md"]);
    expect(t.log).toEqual(["récentes b.md partie.md a.md"]);
    expect(t.recent.paths()).toEqual(["Travail/c.md", "b.md", "a.md"]);
  });

  it("une réponse arrivée après un changement d'espace de travail ne touche pas aux notes du nouveau", async () => {
    const t = setup(workspaceScreen(), { [KEY]: '["partie.md"]' });
    const answer = t.recent.list();
    t.screen.show(workspaceOpened({ name: "Autre", path: "/autre" }, [], []));
    t.visit("partie.md");
    await answer;
    expect(t.recent.paths()).toEqual(["partie.md"]);
    expect(t.storage.values[KEY]).toBe('["partie.md"]');
  });

  it("Récentes enregistre ce qui est tapé, montre les notes récentes et ouvre la première", async () => {
    const t = setup(workspaceScreen(), { [KEY]: '["a.md","b.md"]' });
    await t.recent.show();
    expect(t.log).toEqual(["enregistrer b.md", "récentes a.md b.md"]);
    expect(recentOn(t.screen.get())).toBe(true);
    expect(selectedNote(t.screen.get())).toBe("a.md");
    expect(t.columns.log).toEqual(["montrer a.md"]);
    expect(activeNote(t.columns.columns())).toBe("a.md");
  });
});
