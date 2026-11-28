import { beforeEach, describe, expect, it } from "vitest";
import { settle } from "../../test-support/app-fixture";
import { click, ready, settingsOf, setup, allowed } from "../../test-support/voice-input-fixture";
import { chooseShortcut, COMMANDS, shortcutOf } from "../state/commands";
import "../theme.css";
import "../style.css";

beforeEach(() => {
  document.body.replaceChildren();
  chooseShortcut("voice-input", null);
});

const voice = COMMANDS.find((command) => command.id === "voice-input") as (typeof COMMANDS)[number];

type Ready = Awaited<ReturnType<typeof ready>>;

/** L'onglet « Saisie vocale » ouvert, avec ses réglages lus. */
async function open(initial?: Parameters<typeof ready>[0], saved?: Parameters<typeof ready>[1]) {
  const s = await ready(initial, saved);
  const [element] = s.voice.settingsGroups();
  document.body.append(element as HTMLElement);
  await settle();
  return { s, element: element as HTMLElement };
}

const key = (element: HTMLElement) => element.querySelector(".shortcut-key") as HTMLButtonElement;
const beepsBox = (element: HTMLElement) =>
  element.querySelector("#setting-voiceBeeps") as HTMLInputElement;
const error = (element: HTMLElement) =>
  element.querySelector("#setting-voiceShortcut-help ~ .setting-error") as HTMLElement;
const resetButton = (element: HTMLElement) =>
  [...element.querySelectorAll("button")].find(
    (b) => b.textContent === "Rétablir le raccourci par défaut",
  ) as HTMLButtonElement;

/** Clique sur la touche du raccourci, puis presse la combinaison. */
async function pressShortcut(element: HTMLElement, init: KeyboardEventInit & { key: string }) {
  key(element).click();
  key(element).dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
  await settle();
}

/** Clique sur la touche du raccourci, puis presse et relâche une touche de modificateur seule. */
async function pressTap(
  element: HTMLElement,
  name: string,
  code: string,
  flags: KeyboardEventInit,
) {
  key(element).click();
  const base = { key: name, code, bubbles: true, cancelable: true };
  key(element).dispatchEvent(new KeyboardEvent("keydown", { ...base, ...flags }));
  key(element).dispatchEvent(new KeyboardEvent("keyup", base));
  await settle();
}

describe("saisie vocale : les réglages gardés au lancement", () => {
  it("lit le raccourci et les bips, une seule fois, sans toucher aux appels de la saisie", async () => {
    const s = await ready();
    expect(s.settingsCalls).toEqual(["lire"]);
    expect(s.calls).toEqual(["état"]);
  });

  it("le raccourci de départ reste celui de la liste, et la bulle le dit", async () => {
    const s = await ready();
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
  });

  it("un raccourci choisi lors d'un lancement précédent est celui de la bulle d'aide, de la palette et des menus", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Alt+E", false));
    expect(shortcutOf(voice)).toBe("Ctrl+Alt+E");
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Alt+E)");
  });

  it("dit l'erreur si les réglages sont illisibles, et garde le raccourci de départ", async () => {
    const s = setup(allowed(), { réglages: { message: "préférences illisibles" } });
    await settle();
    expect(s.errors).toEqual([{ message: "préférences illisibles" }]);
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
  });
});

describe("saisie vocale : choisir le raccourci", () => {
  it("l'onglet montre le raccourci en symboles, et les bips décochés", async () => {
    const { element } = await open();
    expect(key(element).textContent).toBe("⌃⇧D");
    expect(beepsBox(element).checked).toBe(false);
    expect(resetButton(element).hidden).toBe(true);
  });

  it("une combinaison libre est gardée, et devient celle du micro, de la palette et des menus", async () => {
    const { s, element } = await open();
    await pressShortcut(element, { key: "e", code: "KeyE", ctrlKey: true, shiftKey: true });
    expect(s.settingsCalls).toEqual(["lire", "raccourci Ctrl+Maj+E"]);
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+E");
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+E)");
    expect(key(element).textContent).toBe("⌃⇧E");
    expect(resetButton(element).hidden).toBe(false);
    expect(error(element).hidden).toBe(true);
  });

  it("une combinaison avec Option est gardée aussi", async () => {
    const { s, element } = await open();
    await pressShortcut(element, { key: "∂", code: "KeyD", ctrlKey: true, altKey: true });
    expect(s.settingsCalls).toContain("raccourci Ctrl+Alt+D");
    expect(key(element).textContent).toBe("⌃⌥D");
  });

  it("une combinaison déjà prise par une autre commande est refusée, nommant cette commande, sans rien garder", async () => {
    const { s, element } = await open();
    await pressShortcut(element, { key: "b", code: "KeyB", metaKey: true });
    expect(error(element).textContent).toBe("Ce raccourci est déjà pris par « Gras ».");
    expect(error(element).hidden).toBe(false);
    expect(s.settingsCalls).toEqual(["lire"]);
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
    expect(key(element).textContent).toBe("⌃⇧D");
  });

  it("Cmd+Maj+D reste « Insérer la date du jour »", async () => {
    const { element } = await open();
    await pressShortcut(element, { key: "d", code: "KeyD", metaKey: true, shiftKey: true });
    expect(error(element).textContent).toBe(
      "Ce raccourci est déjà pris par « Insérer la date du jour ».",
    );
  });

  it("une touche de modificateur seule (Cmd droite) est gardée au relâchement, et devient celle du micro, de la palette et des menus", async () => {
    const { s, element } = await open();
    await pressTap(element, "Meta", "MetaRight", { metaKey: true });
    expect(s.settingsCalls).toEqual(["lire", "raccourci Cmd droite"]);
    expect(shortcutOf(voice)).toBe("Cmd droite");
    expect(s.button().title).toBe("Saisie vocale (Cmd droite)");
    expect(key(element).textContent).toBe("⌘ droite");
    expect(resetButton(element).hidden).toBe(false);
    expect(error(element).hidden).toBe(true);
  });

  it("Option droite seule est gardée de la même façon, avec son côté", async () => {
    const { s, element } = await open();
    await pressTap(element, "Alt", "AltRight", { altKey: true });
    expect(s.settingsCalls).toContain("raccourci Alt droite");
    expect(key(element).textContent).toBe("⌥ droite");
  });

  it("une touche de fonction seule (F5) est gardée dès qu'elle est pressée", async () => {
    const { s, element } = await open();
    await pressShortcut(element, { key: "F5", code: "F5" });
    expect(s.settingsCalls).toEqual(["lire", "raccourci F5"]);
    expect(shortcutOf(voice)).toBe("F5");
    expect(s.button().title).toBe("Saisie vocale (F5)");
    expect(key(element).textContent).toBe("F5");
  });

  it("rétablir le raccourci par défaut après une touche seule remet Ctrl+Maj+D", async () => {
    const { element } = await open(undefined, settingsOf("Cmd droite", false));
    expect(shortcutOf(voice)).toBe("Cmd droite");
    resetButton(element).click();
    await settle();
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
    expect(key(element).textContent).toBe("⌃⇧D");
  });

  it("une touche seule choisie lors d'un lancement précédent est celle de la bulle d'aide", async () => {
    const s = await ready(undefined, settingsOf("Alt gauche", false));
    expect(s.button().title).toBe("Saisie vocale (Alt gauche)");
  });

  it("la touche Fn est refusée avec le message du moteur, sans rien garder", async () => {
    const { s, element } = await open();
    s.state.failures.raccourci = {
      message:
        "La touche Fn ne peut pas servir de raccourci : l'application ne la voit pas. Choisissez une autre touche.",
    };
    await pressShortcut(element, { key: "Fn", code: "Fn" });
    expect(error(element).textContent).toContain("La touche Fn ne peut pas servir de raccourci");
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
  });

  it("une combinaison que le moteur refuse (ni Ctrl ni Cmd) est refusée avec son message, sans rien garder", async () => {
    const { s, element } = await open();
    s.state.failures.raccourci = {
      message:
        "Cette touche tape du texte : ajoutez Ctrl ou Cmd (avec Option ou Maj si vous voulez). Seules une touche de modificateur (Cmd, Option, Ctrl, Maj) et F1 à F12 servent seules.",
    };
    await pressShortcut(element, { key: "d", code: "KeyD", shiftKey: true });
    expect(error(element).textContent).toContain("Cette touche tape du texte");
    expect(error(element).hidden).toBe(false);
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
  });

  it("le refus disparaît quand une combinaison suivante est gardée", async () => {
    const { element } = await open();
    await pressShortcut(element, { key: "b", code: "KeyB", metaKey: true });
    expect(error(element).hidden).toBe(false);
    await pressShortcut(element, { key: "e", code: "KeyE", ctrlKey: true, shiftKey: true });
    expect(error(element).hidden).toBe(true);
  });

  it("Échap annule la saisie : rien n'est gardé, aucun message", async () => {
    const { s, element } = await open();
    await pressShortcut(element, { key: "Escape", code: "Escape" });
    expect(s.settingsCalls).toEqual(["lire"]);
    expect(error(element).hidden).toBe(true);
    expect(key(element).textContent).toBe("⌃⇧D");
  });

  it("« Rétablir le raccourci par défaut » remet Ctrl+Maj+D partout", async () => {
    const { s, element } = await open(undefined, settingsOf("Ctrl+Alt+E", false));
    expect(key(element).textContent).toBe("⌃⌥E");
    resetButton(element).click();
    await settle();
    expect(s.settingsCalls).toContain("raccourci null");
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+D");
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
    expect(key(element).textContent).toBe("⌃⇧D");
    expect(resetButton(element).hidden).toBe(true);
  });

  it("le raccourci choisi est celui qui sert, pendant que l'écoute continue", async () => {
    const { s, element } = await open();
    await click(s);
    s.send({ kind: "listening" });
    await pressShortcut(element, { key: "e", code: "KeyE", ctrlKey: true, shiftKey: true });
    expect(s.button().title).toBe("Arrêter la saisie vocale");
    expect(shortcutOf(voice)).toBe("Ctrl+Maj+E");
  });
});

describe("saisie vocale : les bips", () => {
  const listen = async (s: Ready) => {
    await click(s);
    s.send({ kind: "listening" });
  };

  it("ne jouent rien tant que la case n'est pas cochée", async () => {
    const s = await ready();
    await listen(s);
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual([]);
  });

  it("cocher la case garde le choix et prépare le son (geste de l'utilisateur)", async () => {
    const { s, element } = await open();
    beepsBox(element).click();
    await settle();
    expect(s.settingsCalls).toEqual(["lire", "bips true"]);
    expect(beepsBox(element).checked).toBe(true);
    expect(s.sounds).toEqual(["déverrouiller"]);
  });

  it("un bip de début quand le micro écoute, un bip de fin à la fin", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    s.send({ kind: "level", value: 0.4 });
    s.send({ kind: "provisional", text: "bon" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start"]);
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start", "bip end"]);
  });

  it("le son est préparé au clic ou au raccourci qui démarre la dictée, pas avant", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    expect(s.sounds).toEqual([]);
    s.voice.toggle();
    expect(s.sounds).toEqual(["déverrouiller"]);
  });

  it("un seul bip de début, même si le moteur redit « listening »", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    s.send({ kind: "listening" });
    expect(s.sounds.filter((sound) => sound === "bip start")).toHaveLength(1);
  });

  it("l'arrêt de lui-même après trente secondes de silence finit par un bip", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    s.send({ kind: "silence", message: "Saisie vocale arrêtée : silence" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start"]);
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start", "bip end"]);
  });

  it("une erreur après avoir écouté finit par un bip", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    s.send({ kind: "failed", reason: "stopped", message: "La saisie vocale s'est arrêtée." });
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start", "bip end"]);
  });

  it("une erreur avant d'avoir écouté (accès refusé) ne bippe pas", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await click(s);
    s.send({
      kind: "failed",
      reason: "accessDenied",
      message: "La saisie vocale a besoin du micro.",
    });
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual(["déverrouiller"]);
  });

  it("la dictée suivante bippe de nouveau, début et fin", async () => {
    const s = await ready(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    s.send({ kind: "ended" });
    await listen(s);
    s.send({ kind: "ended" });
    expect(s.sounds.filter((sound) => sound.startsWith("bip"))).toEqual([
      "bip start",
      "bip end",
      "bip start",
      "bip end",
    ]);
  });

  it("décocher la case, même pendant une écoute, supprime le bip de fin", async () => {
    const { s, element } = await open(undefined, settingsOf("Ctrl+Maj+D", true));
    await listen(s);
    beepsBox(element).click();
    await settle();
    expect(beepsBox(element).checked).toBe(false);
    s.send({ kind: "ended" });
    expect(s.sounds).toEqual(["déverrouiller", "bip start"]);
    expect(s.settingsCalls).toContain("bips false");
  });

  it("dit l'erreur si le choix des bips ne se garde pas, et la case revient à son état", async () => {
    const { s, element } = await open();
    s.state.failures.bips = { message: "préférences illisibles" };
    beepsBox(element).click();
    await settle();
    expect(s.errors).toEqual([{ message: "préférences illisibles" }]);
    expect(beepsBox(element).checked).toBe(false);
  });
});
