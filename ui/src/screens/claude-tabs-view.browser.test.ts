import { beforeEach, describe, expect, it } from "vitest";
import {
  createConversationTabsView,
  REPLYING,
  type ShownConversationTab,
} from "./claude-tabs-view";

let list: HTMLElement;
let log: string[];
let show: (tabs: readonly ShownConversationTab[]) => void;

const tabs = () => [...list.querySelectorAll<HTMLElement>(".claude-tab")];
const TWO: ShownConversationTab[] = [
  { id: 1, title: "Range mes notes", running: true, active: false },
  { id: 2, title: "Nouvelle conversation", running: false, active: true },
];

beforeEach(() => {
  list = document.createElement("div");
  document.body.replaceChildren(list);
  log = [];
  show = createConversationTabsView(list, {
    showTab: (id) => log.push(`montrer ${id}`),
    closeTab: (id) => log.push(`fermer ${id}`),
  });
});

describe("barre des onglets de conversation", () => {
  it("montre chaque onglet avec son titre et sa croix, celui qui est montré mis en avant", () => {
    show(TWO);
    expect(tabs().map((tab) => tab.querySelector(".claude-tab-title")?.textContent)).toEqual([
      "Range mes notes",
      "Nouvelle conversation",
    ]);
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs().map((tab) => tab.getAttribute("role"))).toEqual(["tab", "tab"]);
    const close = tabs()[1]?.querySelector(".claude-tab-close") as HTMLButtonElement;
    expect(close.textContent).toBe("×");
    expect(close.type).toBe("button");
    expect(close.getAttribute("aria-label")).toBe(
      "Fermer l'onglet de conversation « Nouvelle conversation »",
    );
    expect(close.title).toBe("Fermer l'onglet de conversation");
    expect(tabs()[1]?.title).toBe("Nouvelle conversation");
  });

  it("l'onglet qui répond porte un témoin, et sa croix dit qu'elle arrête la réponse", () => {
    show(TWO);
    const [running, idle] = tabs() as [HTMLElement, HTMLElement];
    expect(running.querySelector(".claude-tab-running")?.getAttribute("aria-label")).toBe(REPLYING);
    expect(REPLYING).toBe("Claude répond");
    expect(running.title).toBe("Range mes notes · Claude répond");
    expect(running.querySelector(".claude-tab-close")?.getAttribute("title")).toBe(
      "Arrêter la réponse et fermer l'onglet de conversation",
    );
    expect(idle.querySelector(".claude-tab-running")).toBeNull();
  });

  it("un clic sur un onglet le montre ; un clic sur sa croix le ferme, sans le montrer", () => {
    show(TWO);
    tabs()[0]?.click();
    (tabs()[1]?.querySelector(".claude-tab-close") as HTMLElement).click();
    expect(log).toEqual(["montrer 1", "fermer 2"]);
  });

  it("garde ses éléments tant que les onglets ne changent pas, et les redessine sinon", () => {
    show(TWO);
    const before = tabs()[0];
    show(TWO.map((tab) => ({ ...tab })));
    expect(tabs()[0]).toBe(before);
    show([{ ...TWO[0], running: false } as ShownConversationTab]);
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).not.toBe(before);
    expect(tabs()[0]?.querySelector(".claude-tab-running")).toBeNull();
  });
});
