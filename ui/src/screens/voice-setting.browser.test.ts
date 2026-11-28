import { describe, expect, it } from "vitest";
import type { VoiceLanguageItem } from "../bridge";
import { type VoiceChoices, type VoiceSettingState, voiceGroup } from "./voice-setting";
import "../theme.css";
import "../style.css";

const FRENCH: VoiceLanguageItem = { id: "fr-FR", name: "français (France)", ready: true };
const ENGLISH: VoiceLanguageItem = { id: "en-US", name: "anglais (États-Unis)", ready: false };

type Ready = Extract<VoiceSettingState, { kind: "ready" }>;

const ready = (changes: Partial<Ready> = {}): Ready => ({
  kind: "ready",
  languages: [ENGLISH, FRENCH],
  chosen: null,
  used: "fr-FR",
  usedName: "français (France)",
  preparing: null,
  failure: null,
  ...changes,
});

function mount() {
  const log: string[] = [];
  const group = voiceGroup({
    choose: (language) => log.push(`choisir ${language}`),
    prepare: (language) => log.push(`préparer ${language}`),
    chooseShortcut: (shortcut) => log.push(`raccourci ${shortcut}`),
    resetShortcut: () => log.push("raccourci par défaut"),
    chooseBeeps: (beeps) => log.push(`bips ${beeps}`),
  });
  document.body.replaceChildren(group.element);
  const select = () => group.element.querySelector("select") as HTMLSelectElement;
  const buttons = () =>
    [...group.element.querySelectorAll(".favorites-actions button")].map((b) => b.textContent);
  const modelButton = () =>
    group.element.querySelector(".favorites-actions button") as HTMLButtonElement;
  const status = () => group.element.querySelector(".voice-status")?.textContent;
  const failure = () => group.element.querySelector<HTMLElement>(".setting-error") as HTMLElement;
  return { group, log, select, buttons, modelButton, status, failure };
}

describe("réglages : l'onglet « Saisie vocale »", () => {
  it("s'intitule « Saisie vocale », dit que le son reste sur le Mac, et attend la réponse du moteur", () => {
    const m = mount();
    expect(m.group.element.querySelector("legend")?.textContent).toBe("Saisie vocale");
    expect(m.group.element.textContent).toContain(
      "Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré.",
    );
    expect(m.status()).toBe("Lecture de l'état de la saisie vocale…");
    expect(m.group.element.querySelector<HTMLElement>(".setting")?.hidden).toBe(true);
  });

  it("propose la langue du Mac par défaut (nommée), puis chaque langue avec l'état de son modèle", () => {
    const m = mount();
    m.group.show(ready());
    expect([...m.select().options].map((o) => o.text)).toEqual([
      "La langue du Mac (français (France))",
      "anglais (États-Unis) (à télécharger)",
      "français (France) (prête)",
    ]);
    expect(m.select().value).toBe("");
    expect(m.select().labels?.[0]?.textContent).toBe("Langue");
    expect(m.select().getAttribute("aria-describedby")).toBe("setting-voiceLanguage-help");
    expect(m.status()).toBe("français (France) : prête");
    expect(m.buttons()).toEqual([]);
  });

  it("montre la langue choisie, et la nomme « La langue du Mac » sans la nommer elle-même", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US", usedName: "anglais (États-Unis)" }));
    expect(m.select().value).toBe("en-US");
    expect(m.select().options[0]?.text).toBe("La langue du Mac");
    expect(m.status()).toBe("anglais (États-Unis) : à télécharger");
  });

  it("choisir une langue, ou revenir à celle du Mac, appelle le choix", () => {
    const m = mount();
    m.group.show(ready());
    m.select().value = "en-US";
    m.select().dispatchEvent(new Event("change", { bubbles: true }));
    m.select().value = "";
    m.select().dispatchEvent(new Event("change", { bubbles: true }));
    expect(m.log).toEqual(["choisir en-US", "choisir null"]);
  });

  it("un modèle manquant a son bouton « Télécharger le modèle de langue », qui prépare la langue utilisée", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US" }));
    expect(m.buttons()).toEqual(["Télécharger le modèle de langue"]);
    m.modelButton().click();
    expect(m.log).toEqual(["préparer en-US"]);
  });

  it("pendant la préparation : l'état le dit, le choix est bloqué, aucun bouton", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US", preparing: "en-US" }));
    expect(m.status()).toBe("Préparation de la langue…");
    expect(m.select().disabled).toBe(true);
    expect(m.buttons()).toEqual([]);
  });

  it("après un échec : le message du moteur et « Réessayer »", () => {
    const m = mount();
    const message =
      "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.";
    m.group.show(ready({ chosen: "en-US", used: "en-US", failure: message }));
    expect(m.failure().hidden).toBe(false);
    expect(m.failure().textContent).toBe(message);
    expect(m.failure().getAttribute("role")).toBe("alert");
    expect(m.buttons()).toEqual(["Réessayer"]);
    m.modelButton().click();
    expect(m.log).toEqual(["préparer en-US"]);
    m.group.show(ready());
    expect(m.failure().hidden).toBe(true);
    expect(m.select().disabled).toBe(false);
  });

  it("dit pourquoi le moteur ne répond pas, sans liste de langues", () => {
    const m = mount();
    m.group.show({ kind: "unavailable", message: "Saisie vocale : macOS 26 minimum" });
    expect(m.status()).toBe("Saisie vocale : macOS 26 minimum");
    expect(m.group.element.querySelector<HTMLElement>(".setting")?.hidden).toBe(true);
    expect(m.buttons()).toEqual([]);
  });

  it("dit quand le Mac ne propose aucune langue", () => {
    const m = mount();
    m.group.show(ready({ languages: [], used: null, usedName: null }));
    expect(m.status()).toBe("Le Mac ne propose aucune langue de transcription.");
    expect(m.buttons()).toEqual([]);
  });
});

const choices = (changes: Partial<VoiceChoices> = {}): VoiceChoices => ({
  shortcut: "Ctrl+Maj+D",
  defaultShortcut: true,
  beeps: false,
  shortcutError: null,
  ...changes,
});

function keyboard(m: ReturnType<typeof mount>) {
  const key = () =>
    m.group.element.querySelector<HTMLButtonElement>(".shortcut-key") as HTMLButtonElement;
  const reset = () =>
    [...m.group.element.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Rétablir le raccourci par défaut",
    ) as HTMLButtonElement;
  const beeps = () =>
    m.group.element.querySelector<HTMLInputElement>("#setting-voiceBeeps") as HTMLInputElement;
  const error = () =>
    m.group.element.querySelector<HTMLElement>(
      "#setting-voiceShortcut-help ~ .setting-error",
    ) as HTMLElement;
  /** Une touche pressée sur la touche du raccourci ; rend l'événement, pour savoir s'il a été retenu. */
  const press = (init: KeyboardEventInit & { key: string }) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    key().dispatchEvent(event);
    return event;
  };
  /** Une touche relâchée sur la touche du raccourci. */
  const release = (init: KeyboardEventInit & { key: string }) => {
    const event = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init });
    key().dispatchEvent(event);
    return event;
  };
  return { key, reset, beeps, error, press, release };
}

describe("réglages : le raccourci et les bips de la saisie vocale", () => {
  it("cachent le raccourci et les bips tant que les réglages ne sont pas lus", () => {
    const m = mount();
    const k = keyboard(m);
    expect(k.key().closest<HTMLElement>(".setting")?.hidden).toBe(true);
    expect(k.beeps().closest<HTMLElement>(".setting")?.hidden).toBe(true);
    m.group.showChoices(choices());
    expect(k.key().closest<HTMLElement>(".setting")?.hidden).toBe(false);
    expect(k.beeps().closest<HTMLElement>(".setting")?.hidden).toBe(false);
    m.group.showChoices(null);
    expect(k.key().closest<HTMLElement>(".setting")?.hidden).toBe(true);
  });

  it("restent montrés quand le moteur ne peut pas servir", () => {
    const m = mount();
    m.group.show({ kind: "unavailable", message: "Saisie vocale : macOS 26 minimum" });
    m.group.showChoices(choices());
    expect(keyboard(m).key().closest<HTMLElement>(".setting")?.hidden).toBe(false);
  });

  it("montre le raccourci en symboles du Mac, sous le nom « Raccourci »", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    expect(k.key().textContent).toBe("⌃⇧D");
    expect(k.key().labels?.[0]?.textContent).toBe("Raccourci");
    expect(k.key().getAttribute("aria-label")).toBe("Raccourci : ⌃⇧D");
    expect(k.key().getAttribute("aria-pressed")).toBe("false");
    expect(k.key().getAttribute("aria-describedby")).toBe("setting-voiceShortcut-help");
    m.group.showChoices(choices({ shortcut: "Ctrl+Alt+Cmd+Maj+E", defaultShortcut: false }));
    expect(k.key().textContent).toBe("⌃⌥⇧⌘E");
  });

  it("le bouton « Rétablir le raccourci par défaut » n'apparaît que pour un raccourci choisi", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    expect(k.reset().hidden).toBe(true);
    m.group.showChoices(choices({ shortcut: "Ctrl+Maj+E", defaultShortcut: false }));
    expect(k.reset().hidden).toBe(false);
    k.reset().click();
    expect(m.log).toEqual(["raccourci par défaut"]);
  });

  it("un clic attend la combinaison, un second clic abandonne", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
    expect(k.key().getAttribute("aria-pressed")).toBe("true");
    expect(k.key().classList.contains("recording")).toBe(true);
    expect(document.activeElement).toBe(k.key());
    k.key().click();
    expect(k.key().textContent).toBe("⌃⇧D");
    expect(k.key().classList.contains("recording")).toBe(false);
    expect(m.log).toEqual([]);
  });

  it("la combinaison pressée est gardée, écrite comme dans les menus, et la touche est prise par la saisie", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    const event = k.press({ key: "E", code: "KeyE", ctrlKey: true, shiftKey: true });
    expect(m.log).toEqual(["raccourci Ctrl+Maj+E"]);
    expect(event.defaultPrevented).toBe(true);
    expect(k.key().textContent).toBe("⌃⇧D");
  });

  it("un modificateur seul n'achève pas la saisie", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    const event = k.press({ key: "Control", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
    expect(m.log).toEqual([]);
  });

  it("Échap annule la saisie sans rien garder, et ne ferme pas les réglages", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    const event = k.press({ key: "Escape", code: "Escape" });
    expect(event.defaultPrevented).toBe(true);
    expect(k.key().textContent).toBe("⌃⇧D");
    expect(m.log).toEqual([]);
  });

  it("hors saisie, une touche pressée sur la touche du raccourci n'est pas prise", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    const event = k.press({ key: "e", code: "KeyE", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(m.log).toEqual([]);
  });

  it("perdre le focus abandonne la saisie", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.key().dispatchEvent(new FocusEvent("blur"));
    expect(k.key().textContent).toBe("⌃⇧D");
    expect(m.log).toEqual([]);
  });

  it("dit pourquoi le raccourci est refusé, sous la touche, comme une alerte", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    expect(k.error().hidden).toBe(true);
    m.group.showChoices(choices({ shortcutError: "Ce raccourci est déjà pris par « Gras »." }));
    expect(k.error().hidden).toBe(false);
    expect(k.error().textContent).toBe("Ce raccourci est déjà pris par « Gras ».");
    expect(k.error().getAttribute("role")).toBe("alert");
    m.group.showChoices(choices());
    expect(k.error().hidden).toBe(true);
    expect(k.error().textContent).toBe("");
  });

  it("explique la saisie du raccourci", () => {
    const m = mount();
    expect(m.group.element.textContent).toContain(
      "Démarre et arrête la dictée. Cliquez, puis pressez une touche ou une combinaison ; une touche de modificateur (⌘ ⌥ ⌃ ⇧, à gauche ou à droite) se choisit en la pressant puis en la relâchant ; Échap annule. La touche Fn n'est pas lisible par l'application.",
    );
  });

  it("une touche de modificateur pressée puis relâchée seule est gardée, avec son côté", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Meta", code: "MetaRight", metaKey: true });
    expect(m.log).toEqual([]);
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
    const event = k.release({ key: "Meta", code: "MetaRight" });
    expect(m.log).toEqual(["raccourci Cmd droite"]);
    expect(event.defaultPrevented).toBe(true);
    expect(k.key().textContent).toBe("⌃⇧D");
  });

  it("une touche pressée pendant une saisie abandonnée ne compte pas dans la saisie suivante", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Meta", code: "MetaRight", metaKey: true });
    k.key().dispatchEvent(new FocusEvent("blur"));
    k.key().click();
    k.release({ key: "Meta", code: "MetaRight" });
    expect(m.log).toEqual([]);
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
  });

  it("le côté gauche et le côté droit sont deux touches", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Alt", code: "AltLeft", altKey: true });
    k.release({ key: "Alt", code: "AltLeft" });
    k.key().click();
    k.press({ key: "Alt", code: "AltRight", altKey: true });
    k.release({ key: "Alt", code: "AltRight" });
    expect(m.log).toEqual(["raccourci Alt gauche", "raccourci Alt droite"]);
  });

  it("montre une touche seule avec son symbole et son côté", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices({ shortcut: "Cmd droite", defaultShortcut: false }));
    expect(k.key().textContent).toBe("⌘ droite");
    expect(k.key().getAttribute("aria-label")).toBe("Raccourci : ⌘ droite");
    expect(k.reset().hidden).toBe(false);
  });

  it("une touche maintenue longtemps puis relâchée reste prise : la capture n'a pas de limite de durée", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    const held = new KeyboardEvent("keydown", {
      ...{ key: "Shift", code: "ShiftRight", shiftKey: true },
      ...{ bubbles: true, cancelable: true },
    });
    Object.defineProperty(held, "timeStamp", { value: 1000 });
    k.key().dispatchEvent(held);
    const released = new KeyboardEvent("keyup", {
      key: "Shift",
      code: "ShiftRight",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(released, "timeStamp", { value: 9000 });
    k.key().dispatchEvent(released);
    expect(m.log).toEqual(["raccourci Maj droite"]);
  });

  it("un modificateur suivi d'une lettre est la combinaison, pas la touche seule", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Control", code: "ControlRight", ctrlKey: true });
    k.press({ key: "e", code: "KeyE", ctrlKey: true });
    k.release({ key: "Control", code: "ControlRight" });
    expect(m.log).toEqual(["raccourci Ctrl+E"]);
  });

  it("deux modificateurs pressés ensemble : aucun n'est gardé comme touche seule", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Meta", code: "MetaRight", metaKey: true });
    k.press({ key: "Shift", code: "ShiftLeft", metaKey: true, shiftKey: true });
    k.release({ key: "Shift", code: "ShiftLeft", metaKey: true });
    k.release({ key: "Meta", code: "MetaRight" });
    expect(m.log).toEqual([]);
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
  });

  it("Échap après un modificateur annule la saisie : son relâchement ne garde rien", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Meta", code: "MetaRight", metaKey: true });
    k.press({ key: "Escape", code: "Escape", metaKey: true });
    k.release({ key: "Meta", code: "MetaRight" });
    expect(m.log).toEqual([]);
    expect(k.key().textContent).toBe("⌃⇧D");
  });

  it("le relâchement d'une touche hors saisie n'est pas pris, et une autre touche relâchée ne garde rien", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    const outside = k.release({ key: "Meta", code: "MetaRight" });
    expect(outside.defaultPrevented).toBe(false);
    k.key().click();
    k.release({ key: "e", code: "KeyE" });
    expect(m.log).toEqual([]);
    expect(k.key().textContent).toBe("Appuyez sur la combinaison…");
  });

  it("une touche de fonction seule est gardée dès qu'elle est pressée", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "F5", code: "F5" });
    expect(m.log).toEqual(["raccourci F5"]);
  });

  it("la touche Fn, si le navigateur la donne, est envoyée au moteur qui la refuse avec son message", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    k.key().click();
    k.press({ key: "Fn", code: "Fn" });
    expect(m.log).toEqual(["raccourci Fn"]);
  });

  it("explique que la touche Fn n'est pas lisible", () => {
    const m = mount();
    expect(m.group.element.textContent).toContain("La touche Fn n'est pas lisible");
  });

  it("la case « Bip au début et à la fin de la dictée » est décochée par défaut et appelle le choix", () => {
    const m = mount();
    const k = keyboard(m);
    m.group.showChoices(choices());
    expect(k.beeps().checked).toBe(false);
    expect(k.beeps().labels?.[0]?.textContent).toBe("Bip au début et à la fin de la dictée");
    expect(k.beeps().getAttribute("aria-describedby")).toBe("setting-voiceBeeps-help");
    k.beeps().click();
    k.beeps().click();
    expect(m.log).toEqual(["bips true", "bips false"]);
    m.group.showChoices(choices({ beeps: true }));
    expect(k.beeps().checked).toBe(true);
  });
});
