import { describe, expect, it } from "vitest";
import {
  type TapEvent,
  TAP_LIMIT_MS,
  TapDetector,
  isTapShortcut,
  tapCodeOf,
  tapShortcutOf,
} from "./tap-shortcut";

const NONE = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

/** Une touche pressée ou relâchée, à un instant donné (en ms). */
const at = (timeStamp: number, code: string, flags: Partial<TapEvent> = {}): TapEvent => ({
  code,
  timeStamp,
  repeat: false,
  ...NONE,
  ...flags,
});

describe("touche seule : l'écriture et les touches physiques", () => {
  it("écrit chaque modificateur avec son côté et retrouve la touche physique", () => {
    const pairs: readonly (readonly [string, string])[] = [
      ["MetaLeft", "Cmd gauche"],
      ["MetaRight", "Cmd droite"],
      ["AltLeft", "Alt gauche"],
      ["AltRight", "Alt droite"],
      ["ControlLeft", "Ctrl gauche"],
      ["ControlRight", "Ctrl droite"],
      ["ShiftLeft", "Maj gauche"],
      ["ShiftRight", "Maj droite"],
    ];
    for (const [code, written] of pairs) {
      expect(tapShortcutOf(code)).toBe(written);
      expect(tapCodeOf(written)).toBe(code);
      expect(isTapShortcut(written)).toBe(true);
    }
  });

  it("ne connaît ni une lettre, ni une combinaison, ni une touche de fonction", () => {
    expect(tapShortcutOf("KeyD")).toBeNull();
    expect(tapShortcutOf("")).toBeNull();
    for (const written of ["Ctrl+Maj+D", "F5", "Cmd", "Cmd haut", "Cmd+droite", ""]) {
      expect(tapCodeOf(written)).toBeNull();
      expect(isTapShortcut(written)).toBe(false);
    }
  });
});

describe("tapotement", () => {
  it("la limite d'un tapotement est de 500 ms", () => {
    expect(TAP_LIMIT_MS).toBe(500);
  });

  it("une touche pressée puis relâchée vite est un tapotement de cette touche", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(1120, "MetaRight"))).toBe("MetaRight");
  });

  it("le côté compte : gauche et droite sont deux touches", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaLeft", { metaKey: true }));
    expect(detector.keyup(at(1100, "MetaLeft"))).toBe("MetaLeft");
    detector.keydown(at(2000, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(2100, "MetaRight"))).toBe("MetaRight");
  });

  it("une autre touche pressée pendant qu'elle est enfoncée : c'est une combinaison, pas un tapotement", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.keydown(at(1050, "KeyC", { metaKey: true }));
    expect(detector.keyup(at(1100, "MetaRight"))).toBeNull();
  });

  it("la lettre relâchée avant le modificateur ne rend pas le tapotement", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.keydown(at(1050, "KeyC", { metaKey: true }));
    // WebKit ne livre pas le relâchement d'une lettre tant que Cmd est enfoncée ; ici il est livré.
    expect(detector.keyup(at(1080, "KeyC"))).toBeNull();
    expect(detector.keyup(at(1100, "MetaRight"))).toBeNull();
  });

  it("un tapotement suit une combinaison dont le relâchement de la lettre n'a pas été livré", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.keydown(at(1050, "KeyC", { metaKey: true }));
    expect(detector.keyup(at(1100, "MetaRight"))).toBeNull();
    detector.keydown(at(3000, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(3100, "MetaRight"))).toBe("MetaRight");
  });

  it("un maintien long ne déclenche pas : au-delà de 500 ms", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "AltRight", { altKey: true }));
    expect(detector.keyup(at(1501, "AltRight"))).toBeNull();
  });

  it("500 ms pile restent un tapotement", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "AltRight", { altKey: true }));
    expect(detector.keyup(at(1500, "AltRight"))).toBe("AltRight");
  });

  it("sans limite (capture dans les réglages), un maintien long reste un tapotement", () => {
    const detector = new TapDetector(Number.POSITIVE_INFINITY);
    detector.keydown(at(1000, "AltRight", { altKey: true }));
    expect(detector.keyup(at(60000, "AltRight"))).toBe("AltRight");
  });

  it("un relâchement sans appui vu avant ne déclenche rien", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    expect(detector.keyup(at(1000, "MetaRight"))).toBeNull();
  });

  it("un seul tapotement par appui : un second relâchement ne déclenche pas", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "ShiftLeft", { shiftKey: true }));
    expect(detector.keyup(at(1100, "ShiftLeft"))).toBe("ShiftLeft");
    expect(detector.keyup(at(1150, "ShiftLeft"))).toBeNull();
  });

  it("la répétition d'une touche maintenue ne recommence pas l'appui", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "ControlRight", { ctrlKey: true }));
    detector.keydown(at(1450, "ControlRight", { ctrlKey: true, repeat: true }));
    expect(detector.keyup(at(1600, "ControlRight"))).toBeNull();
  });

  it("une touche relâchée n'est pas celle qui a été pressée : rien", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(1100, "MetaLeft"))).toBeNull();
    expect(detector.keyup(at(1150, "MetaRight"))).toBe("MetaRight");
  });

  it("deux modificateurs pressés ensemble : aucun des deux ne déclenche", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.keydown(at(1040, "ShiftLeft", { metaKey: true, shiftKey: true }));
    expect(detector.keyup(at(1100, "ShiftLeft", { metaKey: true }))).toBeNull();
    expect(detector.keyup(at(1120, "MetaRight"))).toBeNull();
  });

  it("les deux côtés du même modificateur pressés ensemble : aucun ne déclenche", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaLeft", { metaKey: true }));
    detector.keydown(at(1040, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(1100, "MetaRight", { metaKey: true }))).toBeNull();
    expect(detector.keyup(at(1120, "MetaLeft"))).toBeNull();
  });

  it("un modificateur pressé pendant qu'un autre, d'un autre genre, est déjà enfoncé ne déclenche pas", () => {
    // L'appui qui a pris la première place n'a pas été vu (fenêtre rouverte) : le drapeau de l'événement le dit.
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "AltRight", { altKey: true, metaKey: true }));
    expect(detector.keyup(at(1100, "AltRight", { metaKey: true }))).toBeNull();
  });

  it("un clic pendant que la touche est enfoncée (Cmd + clic) en fait une combinaison", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.interrupt();
    expect(detector.keyup(at(1100, "MetaRight"))).toBeNull();
  });

  it("le focus perdu entre l'appui et le relâchement : rien ne se déclenche au retour", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    detector.interrupt();
    expect(detector.keyup(at(1200, "MetaRight"))).toBeNull();
  });

  it("une touche qui reste enfoncée sans relâchement vu ne bloque pas le tapotement suivant", () => {
    const detector = new TapDetector(TAP_LIMIT_MS);
    detector.keydown(at(1000, "MetaRight", { metaKey: true }));
    // Aucun relâchement n'arrive (la fenêtre a perdu le focus) : l'appui suivant, bien plus tard, compte.
    detector.keydown(at(9000, "MetaRight", { metaKey: true }));
    expect(detector.keyup(at(9100, "MetaRight"))).toBe("MetaRight");
  });
});
