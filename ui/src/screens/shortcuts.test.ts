import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

const key = (
  key: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey", boolean>> = {},
) => shortcutFor({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe("raccourcis clavier", () => {
  it("Cmd+Maj+F change le mode focus", () => {
    expect(key("f", { metaKey: true, shiftKey: true })).toBe("toggle-focus");
    expect(key("F", { metaKey: true, shiftKey: true })).toBe("toggle-focus");
  });

  it("Cmd+Maj+T met en marche ou arrête le mode machine à écrire", () => {
    expect(key("t", { metaKey: true, shiftKey: true })).toBe("toggle-typewriter");
  });

  it("Cmd+Maj+O montre ou cache le plan", () => {
    expect(key("o", { metaKey: true, shiftKey: true })).toBe("toggle-outline");
    expect(key("o", { shiftKey: true })).toBeNull();
  });

  it("ne réagit pas aux autres touches", () => {
    expect(key("f", { metaKey: true })).toBeNull();
    expect(key("f", { shiftKey: true })).toBeNull();
    expect(key("g", { metaKey: true, shiftKey: true })).toBeNull();
    expect(key("f", { metaKey: true, shiftKey: true, ctrlKey: true })).toBeNull();
  });

  it("Ctrl+Cmd+F bascule le plein écran", () => {
    expect(key("f", { metaKey: true, ctrlKey: true })).toBe("toggle-full-screen");
    expect(key("f", { metaKey: true, ctrlKey: true, shiftKey: true })).toBeNull();
    expect(key("f", { ctrlKey: true })).toBeNull();
  });

  it("Cmd+virgule ouvre les réglages", () => {
    expect(key(",", { metaKey: true })).toBe("open-settings");
    expect(key(",")).toBeNull();
  });

  it("Cmd+O ouvre une note par son titre", () => {
    expect(key("o", { metaKey: true })).toBe("quick-open");
    expect(key("O", { metaKey: true })).toBe("quick-open");
  });

  it("Cmd+Maj+P ouvre la palette de commandes", () => {
    expect(key("p", { metaKey: true, shiftKey: true })).toBe("command-palette");
    expect(key("p", { metaKey: true })).toBeNull();
  });

  it("Échap quitte le plein écran", () => {
    expect(key("Escape")).toBe("leave-full-screen");
    expect(key("Escape", { metaKey: true })).toBeNull();
    expect(key("Escape", { ctrlKey: true })).toBeNull();
    expect(key("Escape", { shiftKey: true })).toBeNull();
  });

  it("les onglets : Cmd+T nouvel onglet, Cmd+W fermer, Ctrl+Tab suivant, Ctrl+Maj+Tab précédent", () => {
    expect(key("t", { metaKey: true })).toBe("new-tab");
    expect(key("w", { metaKey: true })).toBe("close-tab");
    expect(key("W", { metaKey: true })).toBe("close-tab");
    expect(key("Tab", { ctrlKey: true })).toBe("next-tab");
    expect(key("Tab", { ctrlKey: true, shiftKey: true })).toBe("previous-tab");
    expect(key("Tab")).toBeNull();
    expect(key("Tab", { shiftKey: true })).toBeNull();
    expect(key("w")).toBeNull();
  });

  it("Ctrl+Cmd+T divise la colonne", () => {
    expect(key("t", { metaKey: true, ctrlKey: true })).toBe("split-column");
    expect(key("t", { ctrlKey: true })).toBeNull();
  });
});
