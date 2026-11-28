// Le raccourci de la saisie vocale est une bascule : une pression, un seul changement d'état, quel que soit le chemin qui la livre
// (la fenêtre, la barre des menus du Mac, ou les deux à la fois). Ces tests jouent la logique réelle de l'application : la saisie
// vocale, les raccourcis de la fenêtre et la barre des menus, avec un faux moteur ; le Mac est simulé par `press`, qui livre à la
// barre des menus la touche que la page n'a pas prise (c'est l'ordre du Mac : la page d'abord, le menu ensuite).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settle } from "../../test-support/app-fixture";
import { ready, settingsOf } from "../../test-support/voice-input-fixture";
import type { AppMenu } from "../bridge";
import { chooseShortcut } from "../state/commands";
import { SHORTCUT_ONCE_MS } from "../state/shortcut-landing";
import { connectAppMenu } from "./app-menu";
import { type CommandsDeps, connectCommands } from "./commands";

const DEFAULT = "Ctrl+Maj+D";

/** Les événements clavier d'une combinaison écrite comme les menus (`Ctrl+Alt+E`), comme WebKit les livre sur un Mac. */
function keyboardEvent(type: string, shortcut: string, extra: KeyboardEventInit = {}) {
  const parts = shortcut.split("+");
  const letter = parts[parts.length - 1] as string;
  const has = (name: string) => parts.includes(name);
  // Avec Option, la lettre tapée est une autre (Option+E donne « ´ ») : seule la touche physique dit laquelle.
  const typed = has("Alt") ? "´" : has("Maj") ? letter : letter.toLowerCase();
  return new KeyboardEvent(type, {
    ...{ bubbles: true, cancelable: true, key: typed, code: `Key${letter}` },
    ...{ ctrlKey: has("Ctrl"), altKey: has("Alt"), metaKey: has("Cmd"), shiftKey: has("Maj") },
    ...extra,
  });
}

/** L'accélérateur d'un élément de menu, sans l'ordre ni la casse : ses modificateurs triés, puis sa touche. */
function sameKeys(accelerator: string): string {
  const parts = accelerator.toLowerCase().replace("shift", "maj").split("+");
  const key = parts.pop() as string;
  return `${parts.sort().join("+")}+${key}`;
}

async function mount(saved = DEFAULT) {
  chooseShortcut("voice-input", null);
  // La garde d'une pression est celle de l'application, partagée : le test précédent n'en laisse rien.
  await new Promise((resolve) => setTimeout(resolve, SHORTCUT_ONCE_MS + 20));
  const s = await ready(undefined, settingsOf(saved, false));
  const commands = connectCommands({ voice: s.voice, columns: {} } as unknown as CommandsDeps);
  let bar: AppMenu[] = [];
  let choose: (id: string) => void = () => undefined;
  connectAppMenu({
    backend: {
      installMenu: async (menus) => ((bar = menus), null),
      enableMenuItems: async () => null,
      onMenuCommand: async (handler) => {
        choose = handler;
        return () => undefined;
      },
    },
    actions: commands,
    assistant: { status: new Promise(() => undefined) },
    error: () => undefined,
  });
  await settle();
  /** L'élément de menu qui porte ce raccourci, s'il y en a un. */
  const menuItem = (shortcut: string) =>
    bar
      .flatMap((menu) => menu.entries)
      .find(
        (entry) =>
          entry.kind === "command" &&
          entry.accelerator !== null &&
          sameKeys(entry.accelerator) === sameKeys(shortcut),
      );
  const starts = () => s.calls.filter((call) => call === "démarrer").length;
  const stops = () => s.calls.filter((call) => call === "arrêter").length;
  return { s, menuItem, choose: (id: string) => choose(id), starts, stops, bar: () => bar };
}

type Mounted = Awaited<ReturnType<typeof mount>>;

/** La pression de ce raccourci, comme sur le Mac : la page la voit d'abord ; si elle ne la prend pas, la barre des menus la reçoit. */
async function press(m: Mounted, shortcut: string): Promise<KeyboardEvent> {
  const event = keyboardEvent("keydown", shortcut);
  document.body.dispatchEvent(event);
  if (!event.defaultPrevented) {
    const item = m.menuItem(shortcut);
    if (item?.kind === "command") m.choose(item.id);
  }
  await settle();
  // Une pression au doigt en suit une autre au bout d'un temps plus long que la fenêtre d'une livraison.
  await new Promise((resolve) => setTimeout(resolve, SHORTCUT_ONCE_MS + 20));
  return event;
}

const SHORTCUTS = [
  "Ctrl+Maj+D",
  "Ctrl+Maj+E",
  "Ctrl+Alt+E",
  "Alt+Cmd+K",
  "Ctrl+Alt+Maj+U",
  "Ctrl+Alt+N",
];

/** Les écouteurs que chaque montage ajoute au document et à la fenêtre : retirés après le test, sinon le premier prendrait la touche de tous les suivants. */
const added: (() => void)[] = [];

beforeEach(() => {
  chooseShortcut("voice-input", null);
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
        added.push(() => target.removeEventListener(type, listener, options as boolean));
        add(type, listener, options as boolean);
      },
    );
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const remove of added.splice(0)) remove();
});

describe("le raccourci de la saisie vocale est une bascule", () => {
  for (const shortcut of SHORTCUTS) {
    it(`${shortcut} démarre, arrête, puis redémarre l'écoute`, async () => {
      const m = await mount(shortcut);
      await press(m, shortcut);
      expect([m.starts(), m.stops()]).toEqual([1, 0]);
      m.s.send({ kind: "listening" });
      await press(m, shortcut);
      expect([m.starts(), m.stops()]).toEqual([1, 1]);
      m.s.send({ kind: "ended" });
      await press(m, shortcut);
      expect([m.starts(), m.stops()]).toEqual([2, 1]);
      m.s.send({ kind: "listening" });
      await press(m, shortcut);
      expect([m.starts(), m.stops()]).toEqual([2, 2]);
    });

    it(`${shortcut} arrête aussi une écoute encore en préparation`, async () => {
      const m = await mount(shortcut);
      await press(m, shortcut);
      m.s.send({ kind: "preparing" });
      await press(m, shortcut);
      expect([m.starts(), m.stops()]).toEqual([1, 1]);
    });
  }

  it("après un changement de raccourci puis la reconstruction de la barre des menus, le nouveau bascule et l'ancien ne fait plus rien", async () => {
    const m = await mount();
    await press(m, "Ctrl+Maj+D");
    m.s.send({ kind: "listening" });
    await press(m, "Ctrl+Maj+D");
    m.s.send({ kind: "ended" });
    expect([m.starts(), m.stops()]).toEqual([1, 1]);
    chooseShortcut("voice-input", "Ctrl+Alt+E");
    await settle();
    expect(m.menuItem("Ctrl+Alt+E")).toBeDefined();
    expect(m.menuItem("Ctrl+Maj+D")).toBeUndefined();
    await press(m, "Ctrl+Maj+D");
    expect(m.starts()).toBe(1);
    await press(m, "Ctrl+Alt+E");
    m.s.send({ kind: "listening" });
    await press(m, "Ctrl+Alt+E");
    expect([m.starts(), m.stops()]).toEqual([2, 2]);
    m.s.send({ kind: "ended" });
    chooseShortcut("voice-input", "Ctrl+Maj+E");
    await settle();
    await press(m, "Ctrl+Maj+E");
    expect(m.starts()).toBe(3);
  });
});

describe("une seule livraison par pression", () => {
  for (const shortcut of SHORTCUTS) {
    it(`${shortcut} : la fenêtre et la barre des menus livrées toutes deux ne font qu'une bascule`, async () => {
      const m = await mount(shortcut);
      document.body.dispatchEvent(keyboardEvent("keydown", shortcut));
      const item = m.menuItem(shortcut);
      if (item?.kind === "command") m.choose(item.id);
      await settle();
      expect([m.starts(), m.stops()]).toEqual([1, 0]);
    });
  }

  it("une combinaison avec Option est prise par la fenêtre, lue à sa touche physique : WebKit ne la traite pas comme un texte (Option+E tape « ´ »)", async () => {
    const m = await mount("Ctrl+Alt+E");
    const event = await press(m, "Ctrl+Alt+E");
    expect(event.defaultPrevented).toBe(true);
    expect(m.starts()).toBe(1);
  });

  it("la répétition d'une touche maintenue ne bascule pas", async () => {
    const m = await mount("Ctrl+Maj+E");
    document.body.dispatchEvent(keyboardEvent("keydown", "Ctrl+Maj+E"));
    document.body.dispatchEvent(keyboardEvent("keydown", "Ctrl+Maj+E", { repeat: true }));
    document.body.dispatchEvent(keyboardEvent("keydown", "Ctrl+Maj+E", { repeat: true }));
    await settle();
    expect([m.starts(), m.stops()]).toEqual([1, 0]);
  });

  it("deux pressions séparées, comme au doigt, basculent chacune", async () => {
    const m = await mount("Ctrl+Maj+E");
    await press(m, "Ctrl+Maj+E");
    m.s.send({ kind: "listening" });
    await press(m, "Ctrl+Maj+E");
    expect([m.starts(), m.stops()]).toEqual([1, 1]);
  });
});
