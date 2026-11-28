import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseShortcut } from "../state/commands";
import { connectTapShortcut } from "./tap-shortcut";

const calls: string[] = [];
let blocked = false;
let clock = 0;

/** La fenêtre de l'essai : ses écouteurs sont ceux du test seulement. */
let target: EventTarget & Window;

function dispatch(type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}) {
  clock += 50;
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "timeStamp", { value: clock });
  target.dispatchEvent(event);
  return event;
}

const down = (code: string, init: KeyboardEventInit = {}) => dispatch("keydown", code, init);
const up = (code: string, init: KeyboardEventInit = {}) => dispatch("keyup", code, init);
const wait = (ms: number) => void (clock += ms);

beforeEach(() => {
  calls.length = 0;
  blocked = false;
  clock = 1000;
  target = new EventTarget() as EventTarget & Window;
  connectTapShortcut({
    voice: { toggle: () => void calls.push("saisie vocale") },
    blocked: () => blocked,
    target,
  });
  chooseShortcut("voice-input", "Cmd droite");
});

afterEach(() => chooseShortcut("voice-input", null));

describe("touche seule : le déclenchement", () => {
  it("un tapotement de la touche choisie lance la saisie vocale, au relâchement", () => {
    down("MetaRight", { metaKey: true });
    expect(calls).toEqual([]);
    up("MetaRight");
    expect(calls).toEqual(["saisie vocale"]);
  });

  it("un second tapotement la relance : même effet que le clic (elle s'arrête)", () => {
    down("MetaRight", { metaKey: true });
    up("MetaRight");
    wait(400);
    down("MetaRight", { metaKey: true });
    up("MetaRight");
    expect(calls).toEqual(["saisie vocale", "saisie vocale"]);
  });

  it("l'autre côté du même modificateur ne la lance pas", () => {
    down("MetaLeft", { metaKey: true });
    up("MetaLeft");
    expect(calls).toEqual([]);
  });

  it("Cmd droite + C ne la lance pas, et ne gêne pas la copie : la touche n'est pas retenue", () => {
    down("MetaRight", { metaKey: true });
    const copy = down("KeyC", { metaKey: true });
    up("MetaRight");
    expect(calls).toEqual([]);
    expect(copy.defaultPrevented).toBe(false);
  });

  it("l'appui et le relâchement du modificateur ne sont jamais retenus (preventDefault)", () => {
    expect(down("MetaRight", { metaKey: true }).defaultPrevented).toBe(false);
    expect(up("MetaRight").defaultPrevented).toBe(false);
  });

  it("un maintien long ne la lance pas", () => {
    down("MetaRight", { metaKey: true });
    wait(600);
    up("MetaRight");
    expect(calls).toEqual([]);
  });

  it("un clic pendant que la touche est enfoncée (Cmd + clic) ne la lance pas", () => {
    down("MetaRight", { metaKey: true });
    target.dispatchEvent(new Event("pointerdown"));
    up("MetaRight");
    expect(calls).toEqual([]);
  });

  it("l'application qui perd le focus entre l'appui et le relâchement ne la lance pas", () => {
    down("MetaRight", { metaKey: true });
    target.dispatchEvent(new Event("blur"));
    up("MetaRight");
    expect(calls).toEqual([]);
  });

  it("une fenêtre ouverte (réglages, choix) garde le clavier : rien ne se lance", () => {
    blocked = true;
    down("MetaRight", { metaKey: true });
    up("MetaRight");
    expect(calls).toEqual([]);
  });

  it("ne réagit pas quand le raccourci choisi n'est pas une touche seule", () => {
    chooseShortcut("voice-input", "F5");
    down("MetaRight", { metaKey: true });
    up("MetaRight");
    expect(calls).toEqual([]);
    chooseShortcut("voice-input", null);
    down("ControlRight", { ctrlKey: true });
    up("ControlRight");
    expect(calls).toEqual([]);
  });

  it("suit le choix : Option droite une fois choisie, Cmd droite ne la lance plus", () => {
    chooseShortcut("voice-input", "Alt droite");
    down("MetaRight", { metaKey: true });
    up("MetaRight");
    expect(calls).toEqual([]);
    down("AltRight", { altKey: true });
    up("AltRight");
    expect(calls).toEqual(["saisie vocale"]);
  });

  it("marche pour chaque modificateur", () => {
    const written: readonly (readonly [string, string, KeyboardEventInit])[] = [
      ["Ctrl gauche", "ControlLeft", { ctrlKey: true }],
      ["Maj droite", "ShiftRight", { shiftKey: true }],
      ["Alt gauche", "AltLeft", { altKey: true }],
    ];
    for (const [shortcut, code, flags] of written) {
      chooseShortcut("voice-input", shortcut);
      down(code, flags);
      up(code);
      wait(600);
    }
    expect(calls).toHaveLength(3);
  });
});
