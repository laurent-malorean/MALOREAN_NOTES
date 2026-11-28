// Doublures pour les tests de la saisie vocale (src/app/voice-input) : un moteur, un éditeur, des bips et des réglages simulés.
import { vi } from "vitest";
import { settle } from "./app-fixture";
import type { VoiceEventItem, VoiceInputStatusItem, VoiceSettingsItem } from "../src/bridge";
import { createVoiceInput, type VoiceInputDeps } from "../src/app/voice-input";
import type { Editor } from "../src/editor/editor";
import { buildFormatBar } from "../src/screens/format-bar";
import { microphoneButton } from "../src/screens/microphone";
import { columnsStarted, noteOpened } from "../src/state/columns";

export const FRENCH = { id: "fr-FR", name: "français (France)", ready: true };
export const ENGLISH = { id: "en-US", name: "anglais (États-Unis)", ready: false };

export const allowed = (
  changes: Partial<Extract<VoiceInputStatusItem, { kind: "available" }>> = {},
) =>
  ({
    kind: "available",
    access: "allowed",
    language: "fr-FR",
    languageName: "français (France)",
    usingMacLanguage: true,
    languages: [ENGLISH, FRENCH],
    listening: false,
    ...changes,
  }) as VoiceInputStatusItem;

const columns = noteOpened(columnsStarted, "a.md");

const DEFAULT_SHORTCUT = "Ctrl+Maj+D";

/** Les réglages que le moteur simulé garde : le raccourci (écrit comme les menus) et les bips. */
export const settingsOf = (shortcut: string, beeps: boolean): VoiceSettingsItem => ({
  shortcut,
  defaultShortcut: shortcut === DEFAULT_SHORTCUT,
  beeps,
});

type Failures = Record<string, unknown>;

/** Les réglages simulés (raccourci, bips), gardés comme le fait le moteur ; chaque appel est noté dans `log`. */
function fakeSettings(saved: VoiceSettingsItem, failures: Failures, log: string[]) {
  let kept = saved;
  const call = (name: string, entry: string) => {
    log.push(entry);
    if (name in failures) throw failures[name];
  };
  return {
    voiceInputSettings: async () => (call("réglages", "lire"), kept),
    chooseVoiceShortcut: async (shortcut: string | null) => {
      call("raccourci", `raccourci ${shortcut}`);
      return (kept = settingsOf(shortcut ?? DEFAULT_SHORTCUT, kept.beeps));
    },
    chooseVoiceBeeps: async (beeps: boolean) => {
      call("bips", `bips ${beeps}`);
      return (kept = settingsOf(kept.shortcut, beeps));
    },
  };
}

/** Le moteur simulé : son état, ses langues, le départ et l'arrêt ; chaque appel est noté dans `calls`. */
function fakeEngine(initial: VoiceInputStatusItem, failures: Failures, calls: string[]) {
  let status = initial;
  let emit: (event: VoiceEventItem) => void = () => undefined;
  const call = (name: string, entry = name) => {
    calls.push(entry);
    if (name in failures) throw failures[name];
    return null;
  };
  return {
    backend: {
      voiceInputStatus: async () => (call("état"), status),
      startVoiceInput: async () => call("démarrer"),
      stopVoiceInput: async () => call("arrêter"),
      openVoicePrivacySettings: async () => call("réglages macOS"),
      chooseVoiceLanguage: async (language: string | null) =>
        call("choisir", `choisir ${language}`),
      prepareVoiceLanguage: async (language: string) => call("préparer", `préparer ${language}`),
      onVoiceInputEvent: async (handler: (event: VoiceEventItem) => void) => {
        emit = handler;
        return () => undefined;
      },
      errorMessage: (error: unknown) => (error as { message: string }).message,
    },
    setStatus: (next: VoiceInputStatusItem) => void (status = next),
    send: (event: VoiceEventItem) => emit(event),
  };
}

export function setup(
  initial: VoiceInputStatusItem = allowed(),
  failures: Failures = {},
  saved: VoiceSettingsItem = settingsOf(DEFAULT_SHORTCUT, false),
) {
  const bar = document.createElement("div");
  document.body.replaceChildren(bar);
  buildFormatBar(bar, () => undefined);
  const calls: string[] = [];
  /** Les appels des réglages (raccourci, bips), à part des autres : ils ne changent pas les parcours de la saisie. */
  const settingsCalls: string[] = [];
  /** Ce que les bips ont joué, dans l'ordre. */
  const sounds: string[] = [];
  const shown: {
    message: string;
    kind?: string;
    action?: { label: string; run: () => Promise<unknown> };
  }[] = [];
  const errors: unknown[] = [];
  const dictation = {
    begin: vi.fn(),
    provisional: vi.fn(),
    fixed: vi.fn(),
    end: vi.fn(),
    drop: vi.fn(),
    listening: vi.fn(),
  };
  const state = { editor: { dictation } as unknown as Editor | null, note: "a.md", failures };
  const engine = fakeEngine(initial, failures, calls);
  const pane = { textEditor: () => state.editor, note: () => state.note };
  const deps: VoiceInputDeps = {
    backend: { ...engine.backend, ...fakeSettings(saved, failures, settingsCalls) },
    columns: { activePane: () => pane as never, current: () => columns },
    bar,
    beeper: {
      unlock: () => void sounds.push("déverrouiller"),
      play: (kind) => void sounds.push(`bip ${kind}`),
    },
    show: (message, kind, action) => void shown.push({ message, kind, action }),
    error: (error) => void errors.push(error),
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  };
  const voice = createVoiceInput(deps);
  const button = () => microphoneButton(bar) as HTMLButtonElement;
  return {
    ...{ voice, button, dictation, calls, settingsCalls, sounds, shown, errors, state },
    ...{ setStatus: engine.setStatus, send: engine.send },
  };
}

/** Le contenu est prêt (le moteur a répondu, la colonne a montré sa note) ; le micro est au repos. */
export async function ready(initial?: VoiceInputStatusItem, saved?: VoiceSettingsItem) {
  const s = setup(initial, {}, saved);
  await settle();
  s.voice.refresh();
  return s;
}

/** Le clic sur le micro, et ce qu'il déclenche. */
export async function click(s: Awaited<ReturnType<typeof ready>>) {
  s.voice.toggle();
  await settle();
}
