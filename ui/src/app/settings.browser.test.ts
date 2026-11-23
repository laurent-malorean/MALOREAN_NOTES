import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane } from "../../test-support/app-fixture";
import { createLayout } from "../screens/layout";
import { connectSettings, type SettingsGroups } from "./settings";

function setup(
  stored: Record<string, string> = {},
  groups: () => readonly SettingsGroups[] = () => [],
) {
  const items = new Map(Object.entries(stored));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  const root = document.createElement("div");
  const layout = createLayout(root);
  document.body.replaceChildren(root);
  const documentElement = document.createElement("div");
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
    { documentElement, settings: layout.settings, settingsButton: layout.settingsButton },
    { columns: columns.open, storage, systemDark, groups },
  );
  return { layout, documentElement, pane, items, systemDark, listeners, settings };
}

describe("réglages", () => {
  it("les réglages gardés s'appliquent à l'interface et aux colonnes", () => {
    const t = setup({
      "malorean.settings": JSON.stringify({ charactersPerPage: 900, font: "mono" }),
    });
    expect(t.documentElement.dataset.font).toBe("mono");
    expect(t.pane.editor.setCharactersPerPage).toHaveBeenCalledWith(900);
    const added = fakePane();
    t.settings.configure(added.editor);
    expect(added.editor.setCharactersPerPage).toHaveBeenCalledWith(900);
  });

  it("en apparence automatique, l'interface suit le Mac", () => {
    const t = setup();
    expect(t.documentElement.dataset.appearance).toBe("light");
    t.systemDark.matches = true;
    t.listeners.forEach((listener) => listener());
    expect(t.documentElement.dataset.appearance).toBe("dark");
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

  it("la fenêtre montre aussi les parties de plus, refaites à chaque ouverture", () => {
    let opened = 0;
    const t = setup({}, () => {
      opened += 1;
      const part = document.createElement("fieldset");
      part.className = "de-plus";
      return [{ settingsGroups: () => [part] }];
    });
    t.settings.open();
    expect(t.layout.settings.querySelectorAll(".de-plus")).toHaveLength(1);
    t.layout.settings.close();
    t.settings.open();
    expect(opened).toBe(2);
    t.layout.settings.close();
  });

  it("ajoute à la fenêtre les parties que donnent les sources de réglages, dans leur ordre, à chaque ouverture", () => {
    let opened = 0;
    const part = (name: string) => {
      const fieldset = document.createElement("fieldset");
      fieldset.id = `${name}-${opened}`;
      return fieldset;
    };
    const t = setup({}, () => [
      { settingsGroups: () => [part("un")] },
      { settingsGroups: () => [part("deux"), part("trois")] },
    ]);
    t.layout.settingsButton.click();
    const ids = () => [...t.layout.settings.querySelectorAll("fieldset[id]")].map((f) => f.id);
    expect(ids()).toEqual(["un-0", "deux-0", "trois-0"]);
    t.layout.settings.close();
    opened = 1;
    t.layout.settingsButton.click();
    expect(ids()).toEqual(["un-1", "deux-1", "trois-1"]);
  });
});
