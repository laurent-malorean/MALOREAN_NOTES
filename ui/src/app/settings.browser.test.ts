import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane } from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { connectSettings } from "./settings";

function setup(stored: Record<string, string> = {}) {
  const items = new Map(Object.entries(stored));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const root = document.createElement("div");
  const layout = createLayout(root);
  document.body.replaceChildren(root);
  const page = document.createElement("div");
  const columns = fakeColumns();
  const pane = fakePane();
  columns.panes.set(0, pane);
  const listeners: (() => void)[] = [];
  const systemDark = {
    matches: false,
    addEventListener: (type: string, listener: () => void) =>
      void (type === "change" && listeners.push(listener)),
  };
  const settings = connectSettings(
    { page, settings: layout.settings, settingsButton: layout.settingsButton },
    { columns: columns.open, storage, systemDark },
  );
  return { layout, page, pane, items, systemDark, listeners, settings };
}

describe("réglages", () => {
  it("les réglages gardés s'appliquent à la page et aux colonnes", () => {
    const t = setup({
      "malorean.settings": JSON.stringify({ charactersPerPage: 900, font: "mono" }),
    });
    expect(t.page.dataset.font).toBe("mono");
    expect(t.pane.editor.setCharactersPerPage).toHaveBeenCalledWith(900);
    const added = fakePane();
    t.settings.configure(added.editor);
    expect(added.editor.setCharactersPerPage).toHaveBeenCalledWith(900);
  });

  it("en apparence automatique, la page suit le Mac", () => {
    const t = setup();
    expect(t.page.dataset.appearance).toBe("light");
    t.systemDark.matches = true;
    t.listeners.forEach((listener) => listener());
    expect(t.page.dataset.appearance).toBe("dark");
  });

  it("le bouton ouvre la fenêtre des réglages ; un changement s'applique et se garde", () => {
    const t = setup();
    t.layout.settingsButton.click();
    expect(t.layout.settings.open).toBe(true);
    const input = t.layout.settings.querySelector("input") as HTMLInputElement;
    input.value = "2000";
    input.dispatchEvent(new Event("input"));
    expect(t.pane.editor.setCharactersPerPage).toHaveBeenLastCalledWith(2000);
    expect(JSON.parse(t.items.get("malorean.settings") ?? "{}").charactersPerPage).toBe(2000);
    t.layout.settings.close();
    t.settings.open();
    expect(t.layout.settings.open).toBe(true);
    t.layout.settings.close();
  });
});
