import { describe, expect, it } from "vitest";
import { spaced } from "./dictation";

describe("saisie vocale : le blanc entre les phrases fixées", () => {
  it("ajoute un blanc après un caractère qui n'est pas un blanc", () => {
    expect(spaced("e", "Bonjour")).toBe(" Bonjour");
    expect(spaced(".", "Suite")).toBe(" Suite");
  });

  it("n'ajoute rien au début de la note, d'une ligne, ni après un blanc", () => {
    expect(spaced("", "Bonjour")).toBe("Bonjour");
    expect(spaced("\n", "Bonjour")).toBe("Bonjour");
    expect(spaced(" ", "Bonjour")).toBe("Bonjour");
  });

  it("retire le blanc que le moteur met devant son texte quand le curseur suit déjà un blanc ou un début de ligne", () => {
    expect(spaced("", " monde")).toBe("monde");
    expect(spaced("\n", "  monde")).toBe("monde");
    expect(spaced(" ", " monde")).toBe("monde");
  });

  it("garde le blanc que le moteur met devant son texte après un mot", () => {
    expect(spaced("e", " monde")).toBe(" monde");
  });

  it("n'écrit rien pour un texte vide", () => {
    expect(spaced("e", "")).toBe("");
    expect(spaced("", "")).toBe("");
  });
});
