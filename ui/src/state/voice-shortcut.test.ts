import { afterEach, describe, expect, it } from "vitest";
import { chooseShortcut } from "./commands";
import { conflictOf, macSymbols, type PressedKey, recordKey } from "./voice-shortcut";

const press = (key: string, changes: Partial<PressedKey> = {}): PressedKey => ({
  key,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...changes,
});

afterEach(() => chooseShortcut("voice-input", null));

describe("saisie du raccourci : la touche pressée", () => {
  it("écrit la combinaison comme les menus du Mac, modificateurs dans l'ordre Ctrl, Alt, Cmd, Maj", () => {
    expect(recordKey(press("d", { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+Maj+D",
    });
    expect(
      recordKey(press("e", { metaKey: true, altKey: true, ctrlKey: true, shiftKey: true })),
    ).toEqual({ kind: "pressed", shortcut: "Ctrl+Alt+Cmd+Maj+E" });
    expect(recordKey(press("k", { metaKey: true }))).toEqual({
      kind: "pressed",
      shortcut: "Cmd+K",
    });
  });

  it("lit la lettre tapée, en majuscule (Maj la met déjà en majuscule)", () => {
    expect(recordKey(press("D", { ctrlKey: true, shiftKey: true, code: "KeyD" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+Maj+D",
    });
    // Clavier AZERTY : la touche « A » est la touche physique Q.
    expect(recordKey(press("a", { ctrlKey: true, code: "KeyQ" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+A",
    });
  });

  it("avec Option, la lettre tapée change (Option+D tape « ∂ ») : la touche physique donne la lettre", () => {
    expect(recordKey(press("∂", { ctrlKey: true, altKey: true, code: "KeyD" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+Alt+D",
    });
  });

  it("lit un chiffre à sa touche (sur AZERTY, le chiffre se tape avec Maj) et une touche de fonction", () => {
    expect(recordKey(press("&", { ctrlKey: true, code: "Digit1" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+1",
    });
    expect(recordKey(press("F5", { metaKey: true, code: "F5" }))).toEqual({
      kind: "pressed",
      shortcut: "Cmd+F5",
    });
    expect(recordKey(press("F12", { ctrlKey: true, code: "F12" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+F12",
    });
  });

  it("garde une touche que le raccourci ne porte pas : le moteur la refuse avec son message", () => {
    expect(recordKey(press("Tab", { ctrlKey: true, code: "Tab" }))).toEqual({
      kind: "pressed",
      shortcut: "Ctrl+Tab",
    });
    expect(recordKey(press(",", { metaKey: true, code: "Comma" }))).toEqual({
      kind: "pressed",
      shortcut: "Cmd+,",
    });
  });

  it("attend la suite tant que seuls des modificateurs sont pressés", () => {
    for (const key of ["Control", "Alt", "Shift", "Meta", "AltGraph"]) {
      expect(recordKey(press(key, { ctrlKey: true }))).toEqual({ kind: "waiting" });
    }
  });

  it("Échap abandonne la saisie, avec ou sans modificateur", () => {
    expect(recordKey(press("Escape"))).toEqual({ kind: "cancelled" });
    expect(recordKey(press("Escape", { metaKey: true }))).toEqual({ kind: "cancelled" });
  });
});

describe("le raccourci en symboles du Mac", () => {
  it("écrit ⌃⇧D pour Ctrl+Maj+D", () => {
    expect(macSymbols("Ctrl+Maj+D")).toBe("⌃⇧D");
  });

  it("range les symboles comme le Mac : ⌃ ⌥ ⇧ ⌘", () => {
    expect(macSymbols("Ctrl+Alt+Cmd+Maj+E")).toBe("⌃⌥⇧⌘E");
    expect(macSymbols("Alt+Cmd+F")).toBe("⌥⌘F");
    expect(macSymbols("Cmd+Maj+8")).toBe("⇧⌘8");
    expect(macSymbols("Ctrl+F5")).toBe("⌃F5");
  });
});

describe("un raccourci déjà pris", () => {
  it("est refusé en nommant la commande qui l'a", () => {
    expect(conflictOf("Cmd+B")).toBe("Ce raccourci est déjà pris par « Gras ».");
    expect(conflictOf("Cmd+Maj+D")).toBe(
      "Ce raccourci est déjà pris par « Insérer la date du jour ».",
    );
    expect(conflictOf("Ctrl+Cmd+F")).toBe("Ce raccourci est déjà pris par « Plein écran ».");
    expect(conflictOf("Alt+Cmd+F")).toBe(
      "Ce raccourci est déjà pris par « Rechercher et remplacer ».",
    );
  });

  it("l'est quel que soit l'ordre ou la casse de l'écriture", () => {
    expect(conflictOf("maj+cmd+d")).toBe(
      "Ce raccourci est déjà pris par « Insérer la date du jour ».",
    );
    expect(conflictOf("Ctrl+Maj+Tab")).toBe("Ce raccourci est déjà pris par « Onglet précédent ».");
  });

  it("l'est aussi pour la palette et pour les touches de macOS", () => {
    expect(conflictOf("Cmd+Maj+P")).toBe(
      "Ce raccourci est déjà pris par « Palette de commandes ».",
    );
    expect(conflictOf("Cmd+Z")).toBe("Ce raccourci est déjà pris par « Annuler ».");
    expect(conflictOf("Cmd+Maj+Z")).toBe("Ce raccourci est déjà pris par « Rétablir ».");
    expect(conflictOf("Cmd+Q")).toBe("Ce raccourci est déjà pris par « Quitter ».");
    expect(conflictOf("Alt+Cmd+H")).toBe("Ce raccourci est déjà pris par « Masquer les autres ».");
  });

  it("n'est pas un conflit quand il est libre", () => {
    expect(conflictOf("Ctrl+Maj+E")).toBeNull();
    expect(conflictOf("Ctrl+F5")).toBeNull();
    expect(conflictOf("Ctrl+Alt+D")).toBeNull();
  });

  it("n'en est pas un avec le raccourci de la saisie vocale elle-même, ni de départ ni choisi", () => {
    expect(conflictOf("Ctrl+Maj+D")).toBeNull();
    chooseShortcut("voice-input", "Ctrl+Maj+E");
    expect(conflictOf("Ctrl+Maj+E")).toBeNull();
    expect(conflictOf("Ctrl+Maj+D")).toBeNull();
  });

  it("tient compte des raccourcis choisis des autres commandes", () => {
    chooseShortcut("bold", "Ctrl+Maj+E");
    try {
      expect(conflictOf("Ctrl+Maj+E")).toBe("Ce raccourci est déjà pris par « Gras ».");
      expect(conflictOf("Cmd+B")).toBeNull();
    } finally {
      chooseShortcut("bold", null);
    }
  });
});
