import { afterEach, describe, expect, it } from "vitest";
import type { DifferenceItem } from "../bridge";
import { NO_VERSION, showHistory } from "./history-view";

const versions = [
  { id: "2026-11-18 14h30", label: "18 novembre 2026 à 14:30" },
  { id: "2026-11-18 09h05", label: "18 novembre 2026 à 09:05" },
];

const lines: Record<string, DifferenceItem[]> = {
  "2026-11-18 14h30": [
    { kind: "same", text: "# Voyage" },
    { kind: "removed", text: "Rome" },
    { kind: "added", text: "Lyon" },
  ],
  "2026-11-18 09h05": [{ kind: "added", text: "# Brouillon" }],
};

function open(options: { versions?: typeof versions; failing?: boolean } = {}) {
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const asked: string[] = [];
  const errors: unknown[] = [];
  /** Les comparaisons demandées, à tenir à la main : la réponse arrive quand on veut. */
  const pending: { id: string; answer: () => void }[] = [];
  showHistory(dialog, {
    title: "Voyage",
    versions: options.versions ?? versions,
    compare: (id) => {
      asked.push(`comparer ${id}`);
      if (options.failing) return Promise.reject(new Error("illisible"));
      return new Promise((resolve) => pending.push({ id, answer: () => resolve(lines[id] ?? []) }));
    },
    restore: (id) => asked.push(`restaurer ${id}`),
    error: (error) => errors.push(error),
  });
  const buttons = () => [...dialog.querySelectorAll<HTMLButtonElement>(".history-version")];
  const button = (text: string) =>
    [...dialog.querySelectorAll<HTMLButtonElement>(".confirmation-buttons button")].find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement;
  const preview = () =>
    [...dialog.querySelectorAll(".history-body > pre.history-preview > .history-line")].map(
      (l) => `${l.className} ${l.textContent}`,
    );
  const answerAll = async () => {
    // La plus récente demande d'abord : une réponse plus ancienne arrive trop tard.
    for (const p of pending.splice(0).reverse()) p.answer();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { dialog, asked, errors, buttons, button, preview, answerAll };
}

afterEach(() => document.body.replaceChildren());

describe("historique d'une note", () => {
  it("montre la liste datée des versions, la plus récente choisie et comparée à la note", async () => {
    const h = open();
    expect(h.dialog.open).toBe(true);
    expect(h.dialog.className).toBe("history");
    expect(h.dialog.getAttribute("aria-label")).toBe("Historique");
    expect(h.dialog.querySelector(".history-title")?.textContent).toBe("Historique de « Voyage »");
    expect(h.buttons().map((b) => b.textContent)).toEqual([
      "18 novembre 2026 à 14:30",
      "18 novembre 2026 à 09:05",
    ]);
    expect(h.buttons().map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    await h.answerAll();
    expect(h.preview()).toEqual([
      "history-line same # Voyage",
      "history-line removed Rome",
      "history-line added Lyon",
    ]);
    expect(h.dialog.querySelector(".history-legend")?.textContent).toBe(
      "Seulement dans cette version · Seulement dans la note actuelle",
    );
    expect(h.dialog.querySelector(".history-legend .added")?.textContent).toBe(
      "Seulement dans cette version",
    );
    expect(h.dialog.querySelector(".history-legend .removed")?.textContent).toBe(
      "Seulement dans la note actuelle",
    );
    const list = h.dialog.querySelector(".history-body > ul.history-versions");
    expect(list?.getAttribute("role")).toBe("listbox");
    expect(list?.getAttribute("aria-label")).toBe("Versions");
    expect(h.buttons().map((b) => b.getAttribute("role"))).toEqual(["option", "option"]);
    expect(h.button("Restaurer").className).toBe("");
    expect(h.button("Fermer").className).toBe("link");
    expect(document.activeElement).toBe(h.button("Fermer"));
  });

  it("choisir une autre version la montre ; une comparaison arrivée trop tard est ignorée", async () => {
    const h = open();
    h.buttons()[1]?.click();
    await h.answerAll();
    expect(h.asked).toEqual(["comparer 2026-11-18 14h30", "comparer 2026-11-18 09h05"]);
    expect(h.preview()).toEqual(["history-line added # Brouillon"]);
    expect(h.buttons().map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  });

  it("« Restaurer » ferme la fenêtre, puis revient à la version choisie", async () => {
    const h = open();
    h.buttons()[1]?.click();
    h.button("Restaurer").click();
    expect(h.dialog.open).toBe(false);
    await expect.poll(() => h.asked.at(-1)).toBe("restaurer 2026-11-18 09h05");
    h.dialog.showModal();
    h.dialog.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.asked.filter((a) => a.startsWith("restaurer"))).toHaveLength(1);
  });

  it("« Fermer » ne restaure rien", async () => {
    const h = open();
    h.button("Fermer").click();
    expect(h.dialog.open).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.asked).toEqual(["comparer 2026-11-18 14h30"]);
  });

  it("une note sans version le dit, et « Restaurer » reste inactif", () => {
    const h = open({ versions: [] });
    expect(h.dialog.querySelector(".history-empty")?.textContent).toBe(NO_VERSION);
    expect(NO_VERSION).toContain("Aucune version pour l'instant.");
    expect(h.buttons()).toEqual([]);
    expect(h.dialog.querySelector(".history-legend")).toBeNull();
    expect(h.button("Restaurer").disabled).toBe(true);
    expect(h.asked).toEqual([]);
  });

  it("une ancienne attente de la fenêtre (confirmation) n'entend pas sa fermeture", async () => {
    const dialog = document.createElement("dialog");
    document.body.replaceChildren(dialog);
    const heard: string[] = [];
    dialog.onclose = () => heard.push("fermée");
    showHistory(dialog, {
      title: "Voyage",
      versions: [],
      compare: async () => [],
      restore: () => {},
      error: () => {},
    });
    dialog.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(heard).toEqual([]);
  });

  it("une comparaison ratée est dite", async () => {
    const h = open({ failing: true });
    await h.answerAll();
    expect(h.errors).toEqual([new Error("illisible")]);
    expect(h.preview()).toEqual([]);
  });
});
