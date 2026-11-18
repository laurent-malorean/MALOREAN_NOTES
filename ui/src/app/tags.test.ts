import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  workspaceScreen,
  listed,
  recordedScreen,
  settle,
} from "../../test-support/app-fixture";
import { activeNote, columnsStarted, noteOpened } from "../state/columns";
import { activeTag, type Screen, selectedNote, tagSelected, welcome } from "../state/screen";
import { createTags } from "./tags";

function setup(start: Screen = workspaceScreen()) {
  const { screen, shown } = recordedScreen(start);
  const columns = fakeColumns(noteOpened(columnsStarted, "b.md"));
  const log: string[] = [];
  columns.panes.set(columns.columns().active, fakePane("b.md", log));
  const errors: unknown[] = [];
  const tags = createTags({
    backend: {
      listTaggedNotes: async (tag, order) => (
        log.push(`notes #${tag}${order === "modified" ? "" : ` par ${order}`}`),
        [listed(`${tag}/a.md`)]
      ),
      listNotes: async (folder, order) => (
        log.push(`notes de «${folder}»${order === "modified" ? "" : ` par ${order}`}`),
        [listed("x.md")]
      ),
    },
    screen,
    columns: columns.open,
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  return { tags, screen, shown, columns, log, errors };
}

describe("filtre par étiquette", () => {
  it("choisir une étiquette enregistre ce qui est tapé, montre ses notes et ouvre la première", async () => {
    const t = setup();
    await t.tags.select("perso");
    expect(t.log).toEqual(["enregistrer b.md", "notes #perso"]);
    expect(activeTag(t.screen.get())).toBe("perso");
    expect(selectedNote(t.screen.get())).toBe("perso/a.md");
    expect(t.columns.log).toEqual(["montrer perso/a.md"]);
    expect(activeNote(t.columns.columns())).toBe("perso/a.md");
  });

  it("les notes de l'étiquette, puis celles du dossier, suivent le tri de la liste", async () => {
    const t = setup(workspaceScreen([], (screen) => ({ ...screen, order: "title" })));
    await t.tags.select("perso");
    t.tags.clear();
    await settle();
    expect(t.log).toEqual(["enregistrer b.md", "notes #perso par title", "notes de «» par title"]);
  });

  it("rechoisir l'étiquette du filtre ne relit rien", async () => {
    const t = setup(tagSelected(workspaceScreen(), "perso", []));
    await t.tags.select("perso");
    expect(t.log).toEqual([]);
    expect(t.shown).toEqual([]);
  });

  it("retirer le filtre ramène les notes du dossier ; sans filtre, rien ne se passe", async () => {
    const t = setup(tagSelected(workspaceScreen(), "perso", []));
    expect(t.tags.clear()).toBe(true);
    await settle();
    expect(t.log).toEqual(["notes de «»"]);
    expect(activeTag(t.screen.get())).toBeNull();
    const now = t.screen.get();
    expect(now.kind === "workspace" && now.notes).toEqual([listed("x.md")]);
    expect(t.columns.log).toEqual([]);
    expect(t.tags.clear()).toBe(false);
    await settle();
    expect(t.log).toEqual(["notes de «»"]);
  });

  it("sur l'accueil, retirer le filtre ne fait rien", () => {
    const t = setup(welcome);
    expect(t.tags.clear()).toBe(false);
    expect(t.errors).toEqual([]);
  });
});
