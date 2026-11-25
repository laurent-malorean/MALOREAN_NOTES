import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane } from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { columnSplit, columnsStarted } from "../state/columns";
import { connectWritingModes } from "./writing-modes";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

function setup(stored: Record<string, string> = {}) {
  const layout = createLayout(document.createElement("div"));
  const columns = fakeColumns(columnSplit(columnsStarted));
  const [left, right] = columns.columns().list;
  const first = fakePane();
  const second = fakePane();
  columns.panes.set(left?.id ?? -1, first);
  columns.panes.set(right?.id ?? -1, second);
  const storage = memoryStorage(stored);
  const writing = connectWritingModes(layout, { columns: columns.open, storage });
  return { layout, columns, first, second, storage, writing };
}

describe("outils d'écriture", () => {
  it("le mode focus gardé est remis, puis change à chaque clic, dans toutes les colonnes", () => {
    const t = setup({ "malorean.focus": "sentence" });
    expect(t.layout.focusButton.getAttribute("aria-label")).toBe("Focus : phrase");
    expect(t.first.editor.setFocusMode).toHaveBeenLastCalledWith("sentence");
    t.layout.focusButton.click();
    expect(t.second.editor.setFocusMode).toHaveBeenLastCalledWith("paragraph");
    expect(t.storage.items.get("malorean.focus")).toBe("paragraph");
    t.writing.toggleFocus();
    expect(t.layout.focusButton.getAttribute("aria-label")).toBe("Focus");
    expect(t.storage.items.has("malorean.focus")).toBe(false);
  });

  it("une nouvelle colonne prend le mode focus en cours", () => {
    const t = setup();
    t.writing.toggleFocus();
    const pane = fakePane();
    t.writing.configure(pane.editor);
    expect(pane.editor.setFocusMode).toHaveBeenCalledWith("sentence");
  });

  it("le mode machine à écrire ne vaut que pour la colonne active", () => {
    const t = setup({ "malorean.typewriter": "on" });
    expect(t.layout.typewriterButton.getAttribute("aria-pressed")).toBe("true");
    expect(t.first.editor.setTypewriter).toHaveBeenLastCalledWith("off");
    expect(t.second.editor.setTypewriter).toHaveBeenLastCalledWith("on");
    t.layout.typewriterButton.click();
    expect(t.second.editor.setTypewriter).toHaveBeenLastCalledWith("off");
    expect(t.storage.items.has("malorean.typewriter")).toBe(false);
    t.writing.toggleTypewriter();
    expect(t.storage.items.get("malorean.typewriter")).toBe("on");
    t.columns.open.update((now) => ({ ...now, active: now.list[0]?.id ?? -1 }));
    t.writing.showTypewriter();
    expect(t.first.editor.setTypewriter).toHaveBeenLastCalledWith("on");
    expect(t.second.editor.setTypewriter).toHaveBeenLastCalledWith("off");
  });

  it("le plan se montre et se cache", () => {
    const t = setup();
    expect(t.layout.outline.hidden).toBe(true);
    t.layout.outlineButton.click();
    expect(t.layout.outline.hidden).toBe(false);
    expect(t.layout.outlineButton.getAttribute("aria-pressed")).toBe("true");
    t.writing.toggleOutline();
    expect(t.layout.outline.hidden).toBe(true);
  });
});
