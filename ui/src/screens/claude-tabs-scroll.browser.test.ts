import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationTabsView, type ShownConversationTab } from "./claude-tabs-view";
import "../theme.css";
import "../style.css";

const BAR_WIDTH = 320;
let bar: HTMLElement;
let show: (tabs: readonly ShownConversationTab[]) => void;
let shown: number[];

const tabs = () => [...bar.querySelectorAll<HTMLElement>(".claude-tab")];
const scroller = () => bar.querySelector(".claude-tabs") as HTMLElement;
const arrow = (side: "left" | "right") =>
  bar.querySelector<HTMLButtonElement>(`[data-tabs-scroll="${side}"]`) as HTMLButtonElement;
const many = (count: number, active = 1): ShownConversationTab[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Conversation numéro ${index + 1}`,
    running: false,
    active: index + 1 === active,
  }));
const inView = (tab: HTMLElement) => {
  const box = scroller().getBoundingClientRect();
  const at = tab.getBoundingClientRect();
  return at.left >= box.left - 1 && at.right <= box.right + 1;
};

beforeEach(() => {
  bar = document.createElement("div");
  bar.style.width = `${BAR_WIDTH}px`;
  document.body.replaceChildren(bar);
  shown = [];
  show = createConversationTabsView(bar, {
    showTab: (id) => shown.push(id),
    closeTab: () => {},
  });
});

afterEach(() => {
  delete document.documentElement.dataset.appearance;
});

describe("barre des onglets de conversation : largeur fixe", () => {
  it("un onglet a la même largeur avec 1 et avec 30 onglets", () => {
    show(many(1));
    const alone = tabs()[0]?.getBoundingClientRect().width;
    show(many(30));
    expect(tabs()).toHaveLength(30);
    expect(tabs()[0]?.getBoundingClientRect().width).toBe(alone);
    expect(tabs()[29]?.getBoundingClientRect().width).toBe(alone);
    expect(alone).toBeGreaterThan(60);
  });
});

describe("barre des onglets de conversation : flèches", () => {
  it("n'apparaissent que si les onglets débordent de la colonne", () => {
    show(many(1));
    expect(arrow("left").hidden).toBe(true);
    expect(arrow("right").hidden).toBe(true);
    show(many(30));
    expect(arrow("left").hidden).toBe(false);
    expect(arrow("right").hidden).toBe(false);
    show(many(2));
    expect(arrow("left").hidden).toBe(true);
    expect(arrow("right").hidden).toBe(true);
  });

  it("sont des boutons-icônes nommés, sans texte", () => {
    show(many(30));
    expect(arrow("left").getAttribute("aria-label")).toBe(
      "Faire défiler les onglets vers la gauche",
    );
    expect(arrow("right").getAttribute("aria-label")).toBe(
      "Faire défiler les onglets vers la droite",
    );
    expect(arrow("left").title).toBe("Faire défiler les onglets vers la gauche");
    for (const side of ["left", "right"] as const) {
      expect(arrow(side).textContent?.trim()).toBe("");
      expect(arrow(side).querySelector("svg")).not.toBeNull();
      expect(arrow(side).type).toBe("button");
    }
  });

  it("sont à chaque bout de la barre, grisées en butée", async () => {
    show(many(30, 1));
    expect(arrow("left").nextElementSibling).toBe(scroller());
    expect(scroller().nextElementSibling).toBe(arrow("right"));
    expect(arrow("left").disabled).toBe(true);
    expect(arrow("right").disabled).toBe(false);
    scroller().scrollLeft = scroller().scrollWidth;
    await vi.waitFor(() => {
      expect(arrow("left").disabled).toBe(false);
      expect(arrow("right").disabled).toBe(true);
    });
  });

  it("un clic fait défiler d'un onglet, vers la droite puis vers la gauche", async () => {
    show(many(30, 1));
    const step = tabs()[0]?.getBoundingClientRect().width as number;
    arrow("right").click();
    await vi.waitFor(() => expect(scroller().scrollLeft).toBeCloseTo(step, 0));
    arrow("left").click();
    await vi.waitFor(() => expect(scroller().scrollLeft).toBe(0));
    expect(shown).toEqual([]);
  });

  it("le défilement horizontal natif est possible, sa barre masquée", () => {
    show(many(30));
    const style = getComputedStyle(scroller());
    expect(style.overflowX).toBe("auto");
    expect(scroller().scrollWidth).toBeGreaterThan(scroller().clientWidth);
    expect(scroller().clientHeight).toBe(scroller().offsetHeight);
  });

  it("suivent la largeur de la colonne", async () => {
    show(many(2));
    expect(arrow("right").hidden).toBe(true);
    bar.style.width = "200px";
    await vi.waitFor(() => expect(arrow("right").hidden).toBe(false));
  });
});

describe("barre des onglets de conversation : l'onglet montré est en vue", () => {
  it("à l'ouverture de la barre, quand il est loin", () => {
    show(many(30, 30));
    expect(inView(tabs()[29] as HTMLElement)).toBe(true);
  });

  it("à l'ajout d'un onglet, montré", () => {
    show(many(30, 1));
    expect(scroller().scrollLeft).toBe(0);
    show(many(31, 31));
    expect(inView(tabs()[30] as HTMLElement)).toBe(true);
  });

  it("au choix d'un onglet à gauche, après avoir défilé à droite", () => {
    show(many(30, 30));
    show(many(30, 2));
    expect(inView(tabs()[1] as HTMLElement)).toBe(true);
  });

  it("un simple redessin (témoin d'un tour) garde la position de défilement", () => {
    show(many(30, 1));
    scroller().scrollLeft = 200;
    const position = scroller().scrollLeft;
    show(many(30, 1).map((tab, index) => ({ ...tab, running: index === 0 })));
    expect(scroller().scrollLeft).toBe(position);
  });
});

describe("barre des onglets de conversation : thèmes clair et sombre", () => {
  it.each(["light", "dark"])("flèches lisibles en thème %s", (appearance) => {
    document.documentElement.dataset.appearance = appearance;
    show(many(30));
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
    const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    expect(muted).not.toBe("");
    expect(muted).not.toBe(background);
    const probe = document.createElement("span");
    probe.style.color = muted;
    document.body.append(probe);
    expect(getComputedStyle(arrow("right")).color).toBe(getComputedStyle(probe).color);
    probe.remove();
  });
});
