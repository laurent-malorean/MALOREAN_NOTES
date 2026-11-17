import { afterEach, describe, expect, it } from "vitest";
import type { Column } from "../state/columns";
import { closeContextMenu } from "./context-menu";
import { renderTabs, tabLabel } from "./tabs-view";

afterEach(() => closeContextMenu());

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
    place: (tab, placement) => asked.push(`placer ${tab} ${placement}`),
    drag: (tab) => asked.push(`glisser ${tab}`),
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
      { activate: () => {}, close: () => {}, place: () => {}, drag: () => {} },
    );
    expect(list.children).toHaveLength(0);
  });

  it("un clic droit sur l'onglet ouvre le menu de sa note, à l'endroit du clic", () => {
    const { tabs, asked } = mount();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 15,
      clientY: 25,
    });
    tabs[0]?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const menu = document.querySelector<HTMLElement>(".context-menu") as HTMLElement;
    expect(menu.style.left).toBe("15px");
    expect(menu.style.top).toBe("25px");
    const entries = () => [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    expect(entries().map((b) => b.textContent)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
    ]);
    entries()[2]?.click();
    tabs[1]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    entries()[3]?.click();
    expect(asked).toEqual(["placer 1 right", "fermer 2"]);
  });

  it("un onglet se glisse : son début et sa fin sont annoncés, il porte son identifiant", () => {
    const { tabs, asked } = mount();
    expect(tabs.map((tab) => tab.draggable)).toEqual([true, true]);
    expect(tabs.map((tab) => tab.dataset.tab)).toEqual(["1", "2"]);
    tabs[1]?.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
    tabs[1]?.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
    expect(asked).toEqual(["glisser 2", "glisser null"]);
  });
});
