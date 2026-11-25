import { afterEach, describe, expect, it, vi } from "vitest";
import { isListTab, storedUnfolded } from "./crm-lists";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("mémoire de ce qui est déplié", () => {
  it("garde et relit, pour chaque CRM", () => {
    const memory = storedUnfolded("clients.md");
    expect(memory.load()).toBeNull();
    memory.store('["people:a"]');
    expect(memory.load()).toBe('["people:a"]');
    expect(localStorage.getItem("crm-unfolded:clients.md")).toBe('["people:a"]');
    expect(storedUnfolded("autre.md").load()).toBeNull();
  });

  it("n'échoue pas quand le stockage est refusé", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("refusé");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refusé");
    });
    const memory = storedUnfolded("clients.md");
    expect(memory.load()).toBeNull();
    expect(() => memory.store("[]")).not.toThrow();
  });
});

describe("onglets qui sont des listes", () => {
  it("sont Personnes, Entreprises et Projets, pas le Kanban ni Ma semaine", () => {
    expect(["people", "companies", "projects"].every(isListTab)).toBe(true);
    expect(["kanban", "week", "", "autre"].some(isListTab)).toBe(false);
  });
});
