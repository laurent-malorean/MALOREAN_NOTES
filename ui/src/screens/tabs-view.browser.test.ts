import { describe, expect, it } from "vitest";
import type { Column } from "../state/columns";
import { renderTabs, tabLabel } from "./tabs-view";

const column: Column = {
  id: 0,
  tabs: [
    { id: 1, note: "Travail/reunion.md", title: "Réunion" },
    { id: 2, note: "Travail/liste-de-noel.md", title: null },
  ],
  activeTab: 2,
  width: 1,
};

function mount() {
  const list = document.createElement("div");
  document.body.replaceChildren(list);
  const asked: string[] = [];
  renderTabs(list, column, {
    activate: (tab) => asked.push(`activer ${tab}`),
    close: (tab) => asked.push(`fermer ${tab}`),
  });
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  return { list, asked, tabs };
}

describe("onglets d'une colonne", () => {
  it("un onglet dit le titre de sa note, ou son nom de fichier tant qu'elle n'est pas lue", () => {
    expect(tabLabel({ id: 1, note: "Travail/reunion.md", title: "Réunion" })).toBe("Réunion");
    expect(tabLabel({ id: 2, note: "Travail/liste-de-noel.md", title: null })).toBe(
      "liste-de-noel",
    );
  });

  it("un onglet par note, dans l'ordre, l'onglet actif sélectionné, le chemin en bulle", () => {
    const { tabs } = mount();
    expect(tabs.map((tab) => tab.querySelector(".tab-title")?.textContent)).toEqual([
      "Réunion",
      "liste-de-noel",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs.map((tab) => tab.className)).toEqual(["tab", "tab"]);
    expect(tabs[0]?.title).toBe("Travail/reunion.md");
  });

  it("un clic sur l'onglet le rend actif ; sa croix le ferme sans l'activer", () => {
    const { tabs, asked } = mount();
    tabs[0]?.click();
    const close = tabs[1]?.querySelector<HTMLButtonElement>(".tab-close") as HTMLButtonElement;
    expect(close.getAttribute("aria-label")).toBe("Fermer l'onglet");
    expect(close.title).toBe("Fermer l'onglet");
    expect(close.textContent).toBe("×");
    close.click();
    expect(asked).toEqual(["activer 1", "fermer 2"]);
  });

  it("redessiner remplace les onglets", () => {
    const { list } = mount();
    renderTabs(
      list,
      { ...column, tabs: [], activeTab: null },
      { activate: () => {}, close: () => {} },
    );
    expect(list.children).toHaveLength(0);
  });
});
