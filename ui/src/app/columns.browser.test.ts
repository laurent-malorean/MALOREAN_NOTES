import { describe, expect, it, vi } from "vitest";
import { fakePane, workspaceScreen, recordedScreen, settle } from "../../test-support/app-fixture";
import type { Pane } from "../screens/note-pane";
import { activeNote, columnSplit, type Columns, noteOpened } from "../state/columns";
import { selectedNote } from "../state/screen";
import { createOpenColumns } from "./columns";
import "../theme.css";
import "../style.css";

function mount() {
  const container = document.createElement("div");
  container.className = "columns";
  container.style.width = "1000px";
  container.style.height = "300px";
  const outline = document.createElement("nav");
  document.body.replaceChildren(container, outline);
  const { screen, shown } = recordedScreen(workspaceScreen());
  const log: string[] = [];
  const panes: ReturnType<typeof fakePane>[] = [];
  const changed = vi.fn();
  const errors: unknown[] = [];
  const printed: string[] = [];
  const copied: string[] = [];
  const columns = createOpenColumns({
    container,
    outline,
    screen,
    newPane: (parts) => {
      const pane = fakePane(null, log);
      parts.element.dataset.pane = String(panes.length);
      panes.push(pane);
      return pane;
    },
    changed,
    printNote: (path) => printed.push(path),
    copyNote: (path) => copied.push(path),
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  });
  const sections = () => [...container.querySelectorAll<HTMLElement>(".column")];
  const tabs = (index = 0) => [
    ...(sections()[index]?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ];
  const notes = () =>
    columns
      .current()
      .list.map((column) => column.tabs.map((tab) => tab.note).join(","))
      .join(" | ");
  return {
    ...{ container, outline, screen, shown, columns, panes, log, changed, sections, tabs, notes },
    printed,
    copied,
  };
}

/** Deux colonnes : a et b dans la première, c dans la seconde, qui est active. */
async function twoColumns() {
  const m = mount();
  await m.columns.openNote("a.md");
  await m.columns.openNote("b.md");
  await m.columns.split();
  await m.columns.showNote("c.md");
  m.log.length = 0;
  return m;
}

describe("colonnes et onglets de l'application", () => {
  it("une colonne apparue reçoit son éditeur ; la colonne active dessine le plan et choisit la note de la liste", async () => {
    const m = mount();
    await m.columns.change(m.columns.current());
    expect(m.panes).toHaveLength(1);
    expect(m.sections()[0]?.dataset.pane).toBe("0");
    expect(m.changed).toHaveBeenCalledTimes(1);
    const first = m.panes[0] as Pane;
    expect(first.editor.setOutline).toHaveBeenCalledWith(m.outline);
    await m.columns.openNote("a.md");
    expect(first.editor.setOutline).toHaveBeenCalledTimes(1);
    expect(selectedNote(m.screen.get())).toBe("a.md");
    expect(first.load).toHaveBeenLastCalledWith("a.md");
    expect(m.changed).toHaveBeenLastCalledWith(m.columns.current());
    expect(m.columns.activePane()).toBe(first);
    expect([...m.columns.panes().values()]).toEqual([first]);
  });

  it("l'écran ne se redessine que si la note de la colonne active change", async () => {
    const m = await twoColumns();
    const drawn = m.shown.length;
    await m.columns.update((now) => ({ ...now }));
    expect(m.shown).toHaveLength(drawn);
  });

  it("le plan passe à l'éditeur de la nouvelle colonne active", async () => {
    const m = await twoColumns();
    const [first, second] = m.panes as unknown as [Pane, Pane];
    expect(first.editor.setOutline).toHaveBeenLastCalledWith(null);
    expect(second.editor.setOutline).toHaveBeenLastCalledWith(m.outline);
    expect(first.load).toHaveBeenLastCalledWith("b.md");
    expect(second.load).toHaveBeenLastCalledWith("c.md");
    expect(selectedNote(m.screen.get())).toBe("c.md");
  });

  it("un clic dans une autre colonne la rend active ; dans la colonne active, rien ne change", async () => {
    const m = await twoColumns();
    const before = m.columns.current();
    m.sections()[1]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(m.columns.current()).toBe(before);
    m.sections()[0]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await settle();
    expect(activeNote(m.columns.current())).toBe("b.md");
  });

  it("les onglets se montrent, se ferment et s'ouvrent ailleurs", async () => {
    const m = await twoColumns();
    m.tabs(0)[0]?.click();
    await settle();
    expect(activeNote(m.columns.current())).toBe("a.md");
    m.tabs(0)[0]?.querySelector<HTMLElement>(".tab-close")?.click();
    await settle();
    expect(m.notes()).toBe("b.md | c.md");
    m.tabs(1)[0]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    document.querySelector<HTMLButtonElement>(".context-menu button")?.click();
    await settle();
    expect(m.notes()).toBe("b.md | c.md,c.md");
  });

  it("le menu d'un onglet imprime sa note, ou la copie en texte mis en forme", async () => {
    const m = await twoColumns();
    const menu = () => {
      m.tabs(0)[0]?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      return [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    };
    menu().at(-2)?.click();
    expect(m.printed).toEqual(["a.md"]);
    menu().at(-1)?.click();
    expect(m.copied).toEqual(["a.md"]);
  });

  it("une colonne fermée rend son éditeur, et le plan passe à la colonne restante", async () => {
    const m = await twoColumns();
    const [first, second] = m.panes as unknown as [Pane, Pane];
    m.tabs(1)[0]?.querySelector<HTMLElement>(".tab-close")?.click();
    await settle();
    expect(m.sections()).toHaveLength(1);
    expect(second.destroy).toHaveBeenCalled();
    expect([...m.columns.panes().values()]).toEqual([first]);
    expect(first.editor.setOutline).toHaveBeenLastCalledWith(m.outline);
    expect(second.editor.setOutline).toHaveBeenLastCalledWith(m.outline);
  });

  it("une colonne fermée qui ne dessinait pas le plan le laisse où il est", async () => {
    const m = await twoColumns();
    const [first, second] = m.panes as unknown as [Pane, Pane];
    await m.columns.update((now) => ({ ...now, list: [now.list[1] as Columns["list"][0]] }));
    expect(first.destroy).toHaveBeenCalled();
    expect(second.editor.setOutline).toHaveBeenCalledTimes(1);
  });

  it("un onglet lâché dans une autre colonne y va, une fois ce qui est tapé enregistré", async () => {
    const m = await twoColumns();
    const tab = m.tabs(0)[1] as HTMLElement;
    tab.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
    const target = m.sections()[1] as HTMLElement;
    const box = target.getBoundingClientRect();
    target.querySelector(".backlinks")?.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
      }),
    );
    await settle();
    expect(m.log).toEqual(["enregistrer b.md", "enregistrer c.md"]);
    expect(m.notes()).toBe("a.md | c.md,b.md");
  });

  it("« Diviser » ouvre une colonne, une fois ce qui est tapé enregistré", async () => {
    const m = mount();
    await m.columns.openNote("a.md");
    m.sections()[0]?.querySelector<HTMLButtonElement>(".column-split")?.click();
    await settle();
    expect(m.log).toEqual(["enregistrer a.md"]);
    expect(m.sections()).toHaveLength(2);
  });

  it("glisser un séparateur change les largeurs", async () => {
    const m = await twoColumns();
    const divider = m.container.querySelector(".column-divider") as HTMLElement;
    const box = divider.getBoundingClientRect();
    divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: box.left + 100 }));
    document.dispatchEvent(new PointerEvent("pointerup"));
    await settle();
    const [left, right] = m.columns.current().list;
    expect(left?.width).toBeGreaterThan(right?.width ?? 1);
  });

  it("enregistre tout, et rend le chemin d'une note que l'enregistrement a renommée", async () => {
    const m = await twoColumns();
    const [first] = m.panes as [ReturnType<typeof fakePane>];
    first.flush.mockImplementation(async () => {
      m.log.push("enregistrer b.md");
      first.renamed("bis.md");
    });
    expect(await m.columns.flushedPath("b.md")).toBe("bis.md");
    expect(m.log).toEqual(["enregistrer b.md", "enregistrer c.md"]);
    expect(await m.columns.flushedPath("autre.md")).toBe("autre.md");
    m.log.length = 0;
    await m.columns.flushAll();
    expect(m.log).toEqual(["enregistrer b.md", "enregistrer c.md"]);
  });

  it("les colonnes des notes parties n'enregistrent plus rien", async () => {
    const m = await twoColumns();
    const empty = mount();
    await empty.columns.change(empty.columns.current());
    empty.columns.forget(() => true);
    expect(empty.panes[0]?.forget).not.toHaveBeenCalled();
    m.columns.forget((path) => path === "c.md");
    expect(m.log).toEqual(["oublier c.md"]);
  });

  it("change d'état une fois ce qui est tapé enregistré, à partir de l'état d'alors", async () => {
    const m = await twoColumns();
    await m.columns.changeFlushed(() => columnSplit(noteOpened(m.columns.current(), "d.md")));
    expect(m.log).toEqual(["enregistrer b.md", "enregistrer c.md"]);
    expect(m.notes()).toBe("a.md,b.md | c.md,d.md | d.md");
  });
});
