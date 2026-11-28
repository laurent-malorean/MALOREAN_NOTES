import { afterEach, describe, expect, it } from "vitest";
import { chooseShortcut } from "../state/commands";
import { type KeyPress, keyOf, shortcutFor } from "./shortcuts";

const key = (
  key: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey", boolean>> = {},
) => shortcutFor({ key, code: "", metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

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
    expect(key("g", { metaKey: true })).toBeNull();
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
    expect(key("p", { metaKey: true, ctrlKey: true })).toBeNull();
  });

  it("Cmd+0 cache ou montre les panneaux latéraux ; Ctrl+Cmd+S reste aux outils de capture", () => {
    expect(key("0", { metaKey: true })).toBe("toggle-side-panels");
    expect(key("0")).toBeNull();
    expect(key("s", { metaKey: true, ctrlKey: true })).toBeNull();
  });

  it("un chiffre se lit à sa touche quand le clavier en tape un autre signe (AZERTY : « à » pour 0)", () => {
    const azerty = (char: string, code: string) =>
      shortcutFor({ key: char, code, metaKey: true, ctrlKey: false, shiftKey: false });
    expect(azerty("à", "Digit0")).toBe("toggle-side-panels");
    expect(azerty("&", "Digit1")).toBe("heading-1");
    expect(azerty("à", "KeyQ")).toBeNull();
    expect(azerty("o", "Digit0")).toBe("quick-open");
    expect(azerty("à", "XDigit0")).toBeNull();
    expect(azerty("à", "Digit01")).toBeNull();
  });

  it("la mise en forme et la date du jour, hors de l'éditeur aussi : Cmd+B, Cmd+I, Cmd+K, Cmd+Maj+D", () => {
    expect(key("b", { metaKey: true })).toBe("bold");
    expect(key("i", { metaKey: true })).toBe("italic");
    expect(key("k", { metaKey: true })).toBe("insert-link");
    expect(key("1", { metaKey: true })).toBe("heading-1");
    expect(key("d", { metaKey: true, shiftKey: true })).toBe("insert-date");
    expect(key("b")).toBeNull();
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

  it("Cmd+N crée une note, Cmd+Maj+N une note depuis un modèle", () => {
    expect(key("N", { metaKey: true, shiftKey: true })).toBe("new-note-from-template");
    expect(key("n", { metaKey: true })).toBe("new-note");
    expect(key("n")).toBeNull();
  });

  it("Cmd+F recherche dans la note (quand l'éditeur ne l'a pas déjà pris)", () => {
    expect(key("f", { metaKey: true })).toBe("find-in-note");
  });

  it("lit un raccourci écrit comme dans les menus du Mac", () => {
    expect(keyOf("Ctrl+Cmd+Maj+T")).toBe("cmd+ctrl+shift+t");
    expect(keyOf("Cmd+,")).toBe("cmd+,");
    expect(keyOf("Ctrl+Maj+Tab")).toBe("ctrl+shift+tab");
    expect(keyOf("Escape")).toBe("escape");
    expect(keyOf("Alt+Cmd+F")).toBe("cmd+alt+f");
  });

  it("Cmd+Maj+J ouvre la note du jour", () => {
    expect(key("J", { metaKey: true, shiftKey: true })).toBe("daily-note");
    expect(key("j", { metaKey: true })).toBeNull();
  });

  it("Cmd+Maj+E change d'espace de travail", () => {
    expect(key("E", { metaKey: true, shiftKey: true })).toBe("switch-workspace");
  });

  it("Cmd+E exporte la note", () => {
    expect(key("e", { metaKey: true })).toBe("export-note");
    expect(key("e", { ctrlKey: true })).toBeNull();
  });

  it("Cmd+P imprime la note", () => {
    expect(key("p", { metaKey: true })).toBe("print-note");
    expect(key("P", { metaKey: true })).toBe("print-note");
    expect(key("p", { ctrlKey: true })).toBeNull();
  });

  it("Cmd+Maj+C copie en texte mis en forme ; Cmd+C reste la copie de l'éditeur", () => {
    expect(key("C", { metaKey: true, shiftKey: true })).toBe("copy-note");
    expect(key("c", { metaKey: true })).toBeNull();
  });

  it("Ctrl+Cmd+C copie en Markdown ; Ctrl+C reste à l'éditeur", () => {
    expect(key("c", { metaKey: true, ctrlKey: true })).toBe("copy-markdown");
    expect(key("c", { ctrlKey: true })).toBeNull();
  });

  it("Ctrl+Cmd+T divise la colonne", () => {
    expect(key("t", { metaKey: true, ctrlKey: true })).toBe("split-column");
    expect(key("t", { ctrlKey: true })).toBeNull();
  });
});

const optioned = (key: string, code: string, mods: Partial<KeyPress> = {}) =>
  shortcutFor({
    ...{ key, code, metaKey: false, ctrlKey: false, shiftKey: false },
    altKey: true,
    ...mods,
  });

describe("raccourci choisi pour la saisie vocale", () => {
  afterEach(() => chooseShortcut("voice-input", null));

  it("Ctrl+Maj+D lance la saisie vocale tant que rien n'est choisi", () => {
    expect(key("d", { ctrlKey: true, shiftKey: true })).toBe("voice-input");
  });

  it("le raccourci choisi la lance, et l'ancien ne la lance plus", () => {
    chooseShortcut("voice-input", "Ctrl+Maj+E");
    expect(key("e", { ctrlKey: true, shiftKey: true })).toBe("voice-input");
    expect(key("E", { ctrlKey: true, shiftKey: true })).toBe("voice-input");
    expect(key("d", { ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it("un raccourci avec un chiffre se lit aussi à sa touche (AZERTY)", () => {
    chooseShortcut("voice-input", "Ctrl+7");
    expect(
      shortcutFor({ key: "è", code: "Digit7", metaKey: false, ctrlKey: true, shiftKey: false }),
    ).toBe("voice-input");
  });

  it("rendre le raccourci de départ le remet", () => {
    chooseShortcut("voice-input", "Ctrl+Maj+E");
    chooseShortcut("voice-input", null);
    expect(key("d", { ctrlKey: true, shiftKey: true })).toBe("voice-input");
    expect(key("e", { ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it("une touche de fonction seule la lance, avec ou sans Maj (Maj+F5 est une autre touche)", () => {
    chooseShortcut("voice-input", "F5");
    expect(key("F5")).toBe("voice-input");
    expect(key("F5", { shiftKey: true })).toBeNull();
    expect(key("F5", { metaKey: true })).toBeNull();
    expect(key("F6")).toBeNull();
  });

  it("une touche de fonction avec Option ne lance pas le raccourci F5 : celui d'Option+F5 est un autre", () => {
    chooseShortcut("voice-input", "F5");
    expect(optioned("F5", "F5")).toBeNull();
    chooseShortcut("voice-input", "Alt+F5");
    expect(optioned("F5", "F5")).toBe("voice-input");
    expect(key("F5")).toBeNull();
  });

  it("une combinaison avec Option est lue à sa touche physique : Option+E tape « ´ », Option+D tape « ∂ »", () => {
    chooseShortcut("voice-input", "Ctrl+Alt+E");
    expect(optioned("´", "KeyE", { ctrlKey: true })).toBe("voice-input");
    expect(optioned("e", "KeyE", { ctrlKey: true })).toBe("voice-input");
    expect(optioned("´", "KeyE", {})).toBeNull();
    expect(optioned("´", "KeyE", { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(optioned("∂", "KeyD", { ctrlKey: true })).toBeNull();
    // Sans Option, la combinaison n'est pas celle-là.
    expect(key("e", { ctrlKey: true })).toBeNull();
  });

  it("une combinaison Option avec Cmd, Maj ou un chiffre se lit de même", () => {
    chooseShortcut("voice-input", "Alt+Cmd+Maj+K");
    expect(optioned("˚", "KeyK", { metaKey: true, shiftKey: true })).toBe("voice-input");
    chooseShortcut("voice-input", "Ctrl+Alt+7");
    expect(optioned("‡", "Digit7", { ctrlKey: true })).toBe("voice-input");
  });

  it("Option+Cmd+F, « Rechercher et remplacer », est lu par la fenêtre aussi (sa touche physique)", () => {
    expect(optioned("ƒ", "KeyF", { metaKey: true })).toBe("find-and-replace");
  });

  it("une touche avec Option qui n'est celle d'aucune commande ne lance rien", () => {
    expect(optioned("å", "KeyA", { metaKey: true })).toBeNull();
    expect(optioned("Tab", "Tab", { ctrlKey: true })).toBeNull();
  });

  it("une touche de modificateur seule n'entre pas dans la table : elle se déclenche au tapotement, pas à l'appui", () => {
    chooseShortcut("voice-input", "Cmd droite");
    expect(key("Meta", { metaKey: true })).toBeNull();
    expect(key("d", { ctrlKey: true, shiftKey: true })).toBeNull();
  });
});
