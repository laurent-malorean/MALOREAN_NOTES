import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { DEFAULT_SETTINGS, type Settings } from "../state/settings";
import { openSettings } from "./settings-view";
import "../theme.css";
import "../style.css";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

function open(settings: Settings = DEFAULT_SETTINGS, storage = memoryStorage()) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const changes: Settings[] = [];
  openSettings(dialog, settings, (next) => changes.push(next), [], storage);
  const input = dialog.querySelector<HTMLInputElement>("input[name=charactersPerPage]");
  if (!input) throw new Error("champ introuvable");
  return { dialog, input, changes, storage };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const error = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(".setting-error");

afterEach(() => document.body.replaceChildren());

describe("écran de réglages", () => {
  it("s'ouvre par-dessus la fenêtre, avec son titre et son bouton pour fermer", () => {
    const { dialog, input } = open();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Réglages");
    const close = dialog.querySelector("button.primary");
    expect([close?.textContent, close?.className]).toEqual(["Fermer", "primary"]);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("présente chaque réglage sur sa ligne, son aide en petit sous le champ", () => {
    const { dialog, input } = open();
    expect(input.closest(".setting")).not.toBeNull();
    const described = (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.className);
    expect(described).toEqual(["setting-help", "setting-error"]);
    expect(dialog.querySelectorAll(".setting")).toHaveLength(6);
  });

  it("range les réglages par partie : affichage, écriture, puis Claude", () => {
    const { dialog } = open();
    const parts = [...dialog.querySelectorAll("fieldset")].map((f) => [
      f.querySelector("legend")?.textContent,
      [...f.querySelectorAll("label")].map((l) => l.textContent),
    ]);
    expect(parts).toEqual([
      ["Affichage", ["Police", "Taille du texte", "Largeur du texte", "Apparence"]],
      ["Écriture", ["Caractères par page"]],
      [
        "Claude",
        ["Après avoir lu une page web, Claude doit-il demander avant de modifier mes notes ?"],
      ],
    ]);
  });

  it("range les parties en onglets : un seul panneau est montré, le premier au départ", () => {
    const { dialog } = open();
    const tabs = [...dialog.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Affichage",
      "Écriture",
      "Claude",
      "Index",
      "Favoris",
      "Brancher une IA",
    ]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(dialog.querySelector("[role=tablist]")?.getAttribute("aria-label")).toBe(
      "Parties des réglages",
    );
    const panels = [...dialog.querySelectorAll<HTMLElement>("[role=tabpanel]")];
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true, true, true, true]);
    expect(panels[1]?.getAttribute("aria-labelledby")).toBe(tabs[1]?.id);
    expect(tabs[1]?.getAttribute("aria-controls")).toBe(panels[1]?.id);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it("donne leurs classes à la rangée d'onglets, aux panneaux et aux boutons", () => {
    const { dialog } = open();
    expect(dialog.querySelector("[role=tablist]")?.className).toBe("settings-tabs");
    expect(dialog.querySelector(".settings-panels")?.querySelectorAll("section")).toHaveLength(6);
    const panels = dialog.querySelectorAll("[role=tabpanel]");
    expect([...panels].map((p) => p.className)).toEqual(Array(6).fill("settings-panel"));
    const types = [...dialog.querySelectorAll<HTMLButtonElement>("[role=tab]")].map((t) => t.type);
    expect(types).toEqual(Array(6).fill("button"));
  });

  it("ne prend pas le focus à l'ouverture ni au clic sur un onglet", () => {
    const { dialog } = open(DEFAULT_SETTINGS, memoryStorage({ "malorean.settings-tab": "Claude" }));
    const tabs = [...dialog.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).not.toBe(tabs[2]);
    tabs[1]?.click();
    expect(document.activeElement).not.toBe(tabs[1]);
  });

  it("garde le défilement d'une flèche pour l'onglet, et ne retient pas les autres touches", () => {
    const { dialog } = open();
    const first = dialog.querySelector<HTMLElement>("[role=tab]");
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    first?.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
  });

  it("met dans le premier onglet une partie sans titre", () => {
    const dialog = document.createElement("dialog");
    document.body.replaceChildren(dialog);
    openSettings(
      dialog,
      DEFAULT_SETTINGS,
      () => {},
      [document.createElement("fieldset")],
      memoryStorage(),
    );
    const first = dialog.querySelector("[role=tabpanel]");
    expect(first?.querySelectorAll("fieldset")).toHaveLength(2);
  });

  it("change de panneau au clic sur un onglet, et se souvient du dernier onglet ouvert", () => {
    const storage = memoryStorage();
    const first = open(DEFAULT_SETTINGS, storage);
    first.dialog.querySelectorAll<HTMLElement>("[role=tab]")[3]?.click();
    const shown = [...first.dialog.querySelectorAll<HTMLElement>("[role=tabpanel]")].map(
      (p) => !p.hidden,
    );
    expect(shown).toEqual([false, false, false, true, false, false]);
    const second = open(DEFAULT_SETTINGS, storage);
    const selected = second.dialog.querySelector("[role=tab][aria-selected=true]");
    expect(selected?.textContent).toBe("Index");
  });

  it("change d'onglet avec les flèches, Début et Fin, en gardant le focus sur l'onglet", () => {
    const { dialog } = open();
    const tabs = [...dialog.querySelectorAll<HTMLElement>("[role=tab]")];
    const press = (tab: HTMLElement | undefined, key: string) =>
      tab?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    press(tabs[0], "ArrowRight");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    press(tabs[1], "End");
    expect(tabs[5]?.getAttribute("aria-selected")).toBe("true");
    press(tabs[5], "ArrowRight");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    press(tabs[0], "ArrowLeft");
    expect(tabs[5]?.getAttribute("aria-selected")).toBe("true");
    press(tabs[5], "Home");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    tabs[0]?.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it("place les parties de plus dans leur onglet", () => {
    const dialog = document.createElement("dialog");
    document.body.replaceChildren(dialog);
    const part = (name: string) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = name;
      fieldset.append(legend);
      return fieldset;
    };
    const extra = [
      ...["Modèles", "Journal", "Index", "Recherche par le sens"],
      ...["Favoris", "Brancher une IA"],
    ].map(part);
    openSettings(dialog, DEFAULT_SETTINGS, () => {}, extra, memoryStorage());
    const panels = [...dialog.querySelectorAll("[role=tabpanel]")].map((p) =>
      [...p.querySelectorAll("legend")].map((l) => l.textContent),
    );
    expect(panels).toEqual([
      ["Affichage"],
      ["Écriture", "Modèles", "Journal"],
      ["Claude"],
      ["Index", "Recherche par le sens"],
      ["Favoris"],
      ["Brancher une IA"],
    ]);
  });

  it("propose les choix d'un réglage d'affichage, et applique celui qu'on prend", () => {
    const { dialog, changes } = open({ ...DEFAULT_SETTINGS, textSize: "large" });
    const select = dialog.querySelector<HTMLSelectElement>("select[name=textSize]");
    if (!select) throw new Error("liste introuvable");
    expect(select.labels?.[0]?.textContent).toBe("Taille du texte");
    expect([...select.options].map((o) => o.text)).toEqual([
      "Petite",
      "Moyenne",
      "Grande",
      "Très grande",
    ]);
    expect(select.value).toBe("large");
    expect(document.getElementById(select.getAttribute("aria-describedby") ?? "")?.className).toBe(
      "setting-help",
    );
    select.value = "small";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const appearance = dialog.querySelector<HTMLSelectElement>("select[name=appearance]");
    if (!appearance) throw new Error("liste introuvable");
    appearance.value = "dark";
    appearance.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes).toEqual([
      { ...DEFAULT_SETTINGS, textSize: "small" },
      { ...DEFAULT_SETTINGS, textSize: "small", appearance: "dark" },
    ]);
  });

  it("n'applique rien pour un choix hors de la liste", () => {
    const { dialog, changes } = open();
    const select = dialog.querySelector<HTMLSelectElement>("select[name=font]");
    if (!select) throw new Error("liste introuvable");
    select.add(new Option("Inconnue", "comic"));
    select.value = "comic";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes).toEqual([]);
  });

  it("montre chaque réglage avec son nom, sa valeur et son aide", () => {
    const { dialog, input } = open({ ...DEFAULT_SETTINGS, charactersPerPage: 2000 });
    expect(input.value).toBe("2000");
    expect(input.labels?.[0]?.textContent).toBe("Caractères par page");
    expect(input.inputMode).toBe("numeric");
    const help = dialog.querySelector(`#${input.getAttribute("aria-describedby")?.split(" ")[0]}`);
    expect(help?.textContent).toContain("1 500");
  });

  it("applique un nombre valable dès qu'il est tapé", () => {
    const { input, changes, dialog } = open();
    type(input, "1000");
    type(input, "1200");
    expect(changes.map((s) => s.charactersPerPage)).toEqual([1000, 1200]);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("signale un nombre refusé sans rien appliquer, puis remet la dernière valeur valable", () => {
    const { input, changes, dialog } = open();
    type(input, "1000");
    type(input, "12");
    expect(changes).toHaveLength(1);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(error(dialog)?.hidden).toBe(false);
    expect(error(dialog)?.textContent).toBe("Un nombre entier entre 100 et 100\u202f000.");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("1000");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(error(dialog)?.hidden).toBe(true);
  });

  it("garde un nombre valable tel quel en quittant le champ", () => {
    const { input } = open();
    type(input, "2 000");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("2 000");
  });

  it("se ferme par son bouton", () => {
    const { dialog } = open();
    dialog.querySelector<HTMLButtonElement>("button.primary")?.click();
    expect(dialog.open).toBe(false);
  });

  it("repart des réglages donnés à chaque ouverture", () => {
    const { dialog } = open();
    dialog.close();
    openSettings(
      dialog,
      { ...DEFAULT_SETTINGS, charactersPerPage: 3000 },
      () => {},
      [],
      memoryStorage(),
    );
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    expect(dialog.querySelector("input")?.value).toBe("3000");
  });

  describe("taille fixe", () => {
    const part = (name: string, height: string) => {
      const fieldset = document.createElement("fieldset");
      fieldset.innerHTML = `<legend>${name}</legend><div style="height:${height}"></div>`;
      return fieldset;
    };
    const boxes = (dialog: HTMLElement) =>
      [...dialog.querySelectorAll<HTMLElement>("h2, [role=tablist], footer, button.primary")]
        .concat(dialog)
        .map((e) => e.getBoundingClientRect().toJSON());

    function openTall(): HTMLDialogElement {
      const dialog = document.createElement("dialog");
      dialog.className = "settings";
      document.body.replaceChildren(dialog);
      const extra = [part("Index", "6rem"), part("Brancher une IA", "90rem")];
      openSettings(dialog, DEFAULT_SETTINGS, () => {}, extra, memoryStorage());
      return dialog;
    }
    const tab = (dialog: HTMLElement, index: number) =>
      dialog.querySelectorAll<HTMLButtonElement>("[role=tab]")[index]?.click();

    beforeAll(() => page.viewport(1280, 1000));

    it("garde la même boîte (fenêtre, titre, onglets, Fermer) sur tous les onglets", () => {
      const dialog = openTall();
      tab(dialog, 0);
      const first = boxes(dialog);
      for (let index = 1; index < 6; index++) {
        tab(dialog, index);
        expect(boxes(dialog)).toEqual(first);
      }
      const window = dialog.getBoundingClientRect();
      expect(window.height).toBe(962); // min(62rem, 100vh - 2rem), bornée par la hauteur par défaut d'un dialogue (100 % - 6 points - 2 em) : 1000 - 38
      expect(window.width).toBe(736);
    });

    it("fait défiler dans la zone de contenu un onglet plus long que la fenêtre", () => {
      const dialog = openTall();
      tab(dialog, 5);
      const panel = dialog.querySelector<HTMLElement>(".settings-panel:not([hidden])");
      if (!panel) throw new Error("panneau introuvable");
      expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
      expect(getComputedStyle(panel).overflowY).toBe("auto");
      expect(dialog.scrollHeight).toBeLessThanOrEqual(dialog.clientHeight);
    });

    it("se réduit avec la fenêtre de l'application, sans sortir de l'écran", async () => {
      await page.viewport(1280, 400);
      const dialog = openTall();
      const window = dialog.getBoundingClientRect();
      const close = dialog.querySelector("button.primary")?.getBoundingClientRect();
      expect(window.height).toBe(400 - 38);
      expect(window.top).toBeGreaterThanOrEqual(0);
      expect(close?.bottom).toBeLessThanOrEqual(window.bottom);
      await page.viewport(1280, 1000);
    });
  });
});

describe("focus à l'ouverture des réglages", () => {
  function openOnClaude() {
    const dialog = document.createElement("dialog");
    dialog.className = "settings";
    document.body.replaceChildren(dialog);
    const storage = memoryStorage({ "malorean.settings-tab": "Claude" });
    openSettings(dialog, DEFAULT_SETTINGS, () => {}, [], storage);
    const tabs = [...dialog.querySelectorAll<HTMLElement>("[role=tab]")];
    return { dialog, tabs, active: tabs[2] as HTMLElement };
  }

  it("ne met aucun cadre sur un onglet qui n'est pas l'onglet actif", () => {
    const { dialog, tabs } = openOnClaude();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(tabs.some((tab) => tab === document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(dialog);
    expect(tabs.map((tab) => tab.matches(":focus-visible"))).toEqual(tabs.map(() => false));
    expect(getComputedStyle(dialog).outlineStyle).toBe("none");
  });

  it("mène le premier Tab à l'onglet actif, puis dans le contenu", async () => {
    const { dialog, active } = openOnClaude();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(active);
    expect(active.matches(":focus-visible")).toBe(true);
    await userEvent.keyboard("{Tab}");
    expect(
      dialog.querySelector(".settings-panel:not([hidden])")?.contains(document.activeElement),
    ).toBe(true);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(active);
  });

  it("change d'onglet aux flèches depuis l'onglet actif, et Échap ferme la fenêtre", async () => {
    const { dialog, tabs } = openOnClaude();
    await userEvent.keyboard("{Tab}{ArrowRight}");
    expect(document.activeElement).toBe(tabs[3]);
    expect(tabs[3]?.getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(dialog.open).toBe(false);
  });

  it("garde le bouton Fermer atteignable : dans l'ordre de Tab, il prend le focus et ferme", async () => {
    // WebKit ne met pas les boutons dans l'ordre de Tab par défaut (réglage de Safari) : on vérifie
    // donc que rien ne l'en sort (tabIndex négatif, désactivé) et qu'il prend le focus et ferme.
    const { dialog } = openOnClaude();
    const close = dialog.querySelector<HTMLButtonElement>("button.primary");
    expect([close?.tabIndex, close?.disabled]).toEqual([0, false]);
    close?.focus();
    expect(document.activeElement).toBe(close);
    await userEvent.keyboard("{Enter}");
    expect(dialog.open).toBe(false);
  });
});
