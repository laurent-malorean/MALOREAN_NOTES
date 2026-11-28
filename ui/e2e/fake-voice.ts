// Saisie vocale simulée pour les parcours (fiche 0103) : le moteur répond comme le contrat de la spécification
// (§ 13), sans micro. Les parcours jouent des événements écrits d'avance par `window.backend.emitVoice`.
// Comme le vrai moteur : une écoute à la fois, le texte provisoire en cours est rendu en `fixed` à l'arrêt, puis
// `ended`. Paramètre d'adresse `voice` : `old` (macOS trop ancien), `denied` (accès refusé), `undecided` (le
// premier clic fait demander l'accès, accordé).
import { emit } from "@tauri-apps/api/event";
import type {
  VoiceEventItem,
  VoiceInputStatusItem,
  VoiceLanguageItem,
  VoiceSettingsItem,
} from "../src/bridge";

type Handler = (args: Record<string, unknown>) => unknown;

export interface FakeVoiceState {
  access: "allowed" | "denied" | "undecided";
  tooOld: boolean;
  /** La langue choisie ; `null` : celle du Mac (français). */
  chosen: string | null;
  languages: VoiceLanguageItem[];
  listening: boolean;
  /** Le dernier texte provisoire envoyé : rendu en texte fixé à l'arrêt. */
  provisional: string;
  starts: number;
  stops: number;
  privacyOpened: number;
  prepared: string[];
  /** Le message dont la prochaine préparation de langue échoue. */
  failNextPrepare: string | null;
  /** Faux : le moteur ne dit rien après le démarrage, le parcours joue lui-même les événements (préparation…). */
  silentStart: boolean;
  /** Durée de la préparation d'une langue, en millisecondes. */
  prepareDelay: number;
  /** Le raccourci gardé (écrit comme dans les menus) ; `null` : celui de départ. */
  shortcut: string | null;
  beeps: boolean;
}

export interface FakeVoice {
  voice: FakeVoiceState;
  /** Envoie un événement de la saisie vocale à l'interface, comme le moteur. */
  emitVoice: (event: VoiceEventItem) => Promise<void>;
}

const MAC_LANGUAGE = "fr-FR";
const TOO_OLD = "Saisie vocale : macOS 26 minimum";

export function fakeVoiceState(params: URLSearchParams): FakeVoice {
  const mode = params.get("voice");
  const voice: FakeVoiceState = {
    access: mode === "denied" || mode === "undecided" ? mode : "allowed",
    tooOld: mode === "old",
    chosen: null,
    languages: [
      { id: "en-US", name: "anglais (États-Unis)", ready: false },
      { id: MAC_LANGUAGE, name: "français (France)", ready: true },
    ],
    listening: false,
    provisional: "",
    starts: 0,
    stops: 0,
    privacyOpened: 0,
    prepared: [],
    failNextPrepare: null,
    silentStart: false,
    prepareDelay: 0,
    shortcut: null,
    beeps: false,
  };
  return {
    voice,
    emitVoice: async (event) => {
      if (event.kind === "provisional") voice.provisional = event.text;
      if (event.kind === "fixed") voice.provisional = "";
      if (event.kind === "ended") voice.listening = false;
      await emit("voice-input-event", event);
    },
  };
}

function status(voice: FakeVoiceState): VoiceInputStatusItem {
  if (voice.tooOld) return { kind: "unavailable", code: "systemTooOld", message: TOO_OLD };
  const language = voice.chosen ?? MAC_LANGUAGE;
  return {
    kind: "available",
    access: voice.access,
    language,
    languageName: voice.languages.find((each) => each.id === language)?.name ?? null,
    usingMacLanguage: voice.chosen === null,
    languages: voice.languages,
    listening: voice.listening,
  };
}

const DEFAULT_SHORTCUT = "Ctrl+Maj+D";
const NEEDS_CONTROL_OR_COMMAND =
  "Un raccourci demande la touche Ctrl ou Cmd (avec Option ou Maj si vous voulez) : Maj et Option seules servent à taper.";

function settings(voice: FakeVoiceState): VoiceSettingsItem {
  const shortcut = voice.shortcut ?? DEFAULT_SHORTCUT;
  return { shortcut, defaultShortcut: voice.shortcut === null, beeps: voice.beeps };
}

/** Le raccourci et les bips, gardés comme le fait le moteur : Ctrl ou Cmd est demandé, le raccourci de départ se garde comme « rien ». */
function fakeVoiceSettings(voice: FakeVoiceState): Record<string, Handler> {
  return {
    voice_input_settings: () => settings(voice),
    choose_voice_shortcut: ({ shortcut }) => {
      const written = (shortcut as string | null) ?? null;
      if (written !== null && !/(^|\+)(Ctrl|Cmd)(\+|$)/.test(written))
        throw { message: NEEDS_CONTROL_OR_COMMAND };
      voice.shortcut = written === DEFAULT_SHORTCUT ? null : written;
      return settings(voice);
    },
    choose_voice_beeps: ({ beeps }) => {
      voice.beeps = beeps as boolean;
      return settings(voice);
    },
  };
}

export function fakeVoice(state: FakeVoice): Record<string, Handler> {
  const { voice, emitVoice } = state;
  const unavailable = () => {
    if (voice.tooOld) throw { message: TOO_OLD };
  };
  const finish = async (events: VoiceEventItem[]) => {
    for (const event of events) await emitVoice(event);
  };
  return {
    voice_input_status: () => status(voice),
    ...fakeVoiceSettings(voice),
    choose_voice_language: ({ language }) => {
      unavailable();
      if (voice.listening)
        throw { message: "Arrêtez la saisie vocale avant de changer de langue." };
      voice.chosen = (language as string | null) ?? null;
      return null;
    },
    prepare_voice_language: async ({ language }) => {
      unavailable();
      await new Promise((resolve) => setTimeout(resolve, voice.prepareDelay));
      if (voice.failNextPrepare !== null) {
        const message = voice.failNextPrepare;
        voice.failNextPrepare = null;
        throw { message };
      }
      voice.prepared.push(language as string);
      for (const each of voice.languages) if (each.id === language) each.ready = true;
      return null;
    },
    start_voice_input: () => {
      unavailable();
      if (voice.listening) throw { message: "La saisie vocale est déjà en cours." };
      voice.listening = true;
      voice.starts += 1;
      // Comme le moteur : la main est rendue aussitôt, la suite arrive par des événements.
      if (voice.silentStart) return null;
      setTimeout(() => {
        if (voice.access === "denied") {
          const message = "La saisie vocale a besoin du micro et de la reconnaissance vocale.";
          void finish([{ kind: "failed", reason: "accessDenied", message }, { kind: "ended" }]);
          return;
        }
        voice.access = "allowed";
        void emitVoice({ kind: "listening" });
      }, 0);
      return null;
    },
    stop_voice_input: () => {
      if (!voice.listening) return null;
      voice.stops += 1;
      const rest = voice.provisional;
      setTimeout(() => {
        const flush: VoiceEventItem[] = rest === "" ? [] : [{ kind: "fixed", text: rest }];
        void finish([...flush, { kind: "ended" }]);
      }, 0);
      return null;
    },
    open_voice_privacy_settings: () => void (voice.privacyOpened += 1),
  };
}
