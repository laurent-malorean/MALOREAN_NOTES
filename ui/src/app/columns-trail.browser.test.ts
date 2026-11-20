import { describe, expect, it } from "vitest";
import { fakePane, recordedScreen, settle, workspaceScreen } from "../../test-support/app-fixture";
import { activeNote, noteFollowed, type Tab } from "../state/columns";
import { type NotePosition, trailOf } from "../state/trail";
import { createOpenColumns } from "./columns";
import "../theme.css";
import "../style.css";

const at = (anchor: number): NotePosition => ({ anchor, head: anchor, top: anchor, offset: 0 });

function mount() {
  const container = document.createElement("div");
  container.className = "columns";
  const outline = document.createElement("nav");
  document.body.replaceChildren(container, outline);
  const { screen } = recordedScreen(workspaceScreen());
  const panes: ReturnType<typeof fakePane>[] = [];
  const errors: unknown[] = [];
  const columns = createOpenColumns({
    ...{ container, outline, screen, changed: () => {} },
    newPane: () => {
      const pane = fakePane();
      panes.push(pane);
      return pane;
    },
    ...{ printNote: () => {}, copyNote: () => {}, copyMarkdown: () => {}, showHistory: () => {} },
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const pane = () => panes[0] as ReturnType<typeof fakePane>;
  const trail = () => trailOf(columns.current().list[0]?.tabs[0] as Tab);
  const arrows = () => [...container.querySelectorAll<HTMLButtonElement>(".trail-step")];
  return { container, columns, pane, trail, arrows, errors };
}

describe("parcours des onglets dans l'application", () => {
  it("suivre un lien garde la note quittée et la position où l'on y était", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    m.pane().editor.position.mockReturnValue(at(7));
    await m.columns.followNote("b.md");
    expect(activeNote(m.columns.current())).toBe("b.md");
    expect(m.pane().load).toHaveBeenLastCalledWith("b.md");
    expect(m.trail().back).toEqual([{ note: "a.md", position: at(7) }]);
  });

  it("une note choisie dans une liste garde aussi la note quittée et sa position", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    m.pane().editor.position.mockReturnValue(at(3));
    await m.columns.showNote("b.md");
    expect(m.trail().back).toEqual([{ note: "a.md", position: at(3) }]);
  });

  it("« ← » revient à la note précédente, à sa position ; « → » repart vers la suivante", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    m.pane().editor.position.mockReturnValue(at(7));
    await m.columns.followNote("b.md");
    m.pane().editor.position.mockReturnValue(at(9));
    const [back, forward] = m.arrows();
    back?.click();
    await settle();
    expect(activeNote(m.columns.current())).toBe("a.md");
    expect(m.pane().editor.restore).toHaveBeenLastCalledWith(at(7));
    expect(m.pane().editor.focus).toHaveBeenCalledTimes(1);
    forward?.click();
    await settle();
    expect(activeNote(m.columns.current())).toBe("b.md");
    expect(m.pane().editor.restore).toHaveBeenLastCalledWith(at(9));
    expect(m.errors).toEqual([]);
  });

  it("sans note de ce côté, ou dans une colonne inconnue, rien ne se passe", async () => {
    const m = mount();
    await m.columns.walk(0, -1);
    await m.columns.openNote("a.md");
    const before = m.columns.current();
    await m.columns.walk(0, -1);
    await m.columns.walk(0, 1);
    await m.columns.walk(9, -1);
    expect(m.columns.current()).toBe(before);
    expect(m.pane().editor.restore).not.toHaveBeenCalled();
    expect(m.pane().editor.focus).not.toHaveBeenCalled();
  });

  it("le pas vise l'onglet actif de la colonne demandée, pas la première ni le premier onglet", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    await m.columns.split();
    await m.columns.openNote("b.md");
    await m.columns.followNote("c.md");
    const second = m.columns.current().list[1];
    await m.columns.walk(second?.id as number, -1);
    const now = m.columns.current();
    expect(now.list[0]?.tabs.map((tab) => tab.note)).toEqual(["a.md"]);
    expect(now.list[1]?.tabs.map((tab) => tab.note)).toEqual(["a.md", "b.md"]);
  });

  it("une note quittée sans position connue se montre sans rien remettre", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    await m.columns.change(noteFollowed(m.columns.current(), "b.md", null));
    await m.columns.walk(0, -1);
    expect(activeNote(m.columns.current())).toBe("a.md");
    expect(m.pane().editor.restore).not.toHaveBeenCalled();
  });
});
