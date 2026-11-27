// Saisie vocale, côté interface : où elle en est (le micro) et ce que le micro dit, d'après ce que répond le moteur.
// Les règles du texte (provisoire, fixé, silence) sont celles du moteur : ici, seulement l'état et les mots.
import type { VoiceEventItem, VoiceInputStatusItem } from "../bridge";
import { displayToolTitle } from "./format-bar";

/** Où en est la saisie vocale : `starting` entre le clic et la première réponse du moteur, `ending` entre la demande d'arrêt et sa fin. */
export type VoiceSession = "idle" | "starting" | "preparing" | "listening" | "ending";

/** La saisie vocale après un événement du moteur (l'ordre est garanti : `ended` est toujours le dernier). */
export function sessionAfter(session: VoiceSession, event: VoiceEventItem): VoiceSession {
  if (event.kind === "ended") return "idle";
  if (event.kind === "silence" || event.kind === "failed") return "ending";
  // Une écoute dont l'arrêt est demandé ne redevient pas active.
  if (session === "ending") return session;
  if (event.kind === "preparing") return "preparing";
  return event.kind === "listening" ? "listening" : session;
}

/** Le niveau sonore reçu, ramené entre 0 et 1. */
export function levelOf(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export const NAME = "Saisie vocale";
export const PREPARING = "Saisie vocale : préparation de la langue…";
export const LISTENING = "Arrêter la saisie vocale";
export const NO_EDITOR = "Saisie vocale : ouvrez une note";
export const DENIED = "Saisie vocale : accès au micro refusé";
/** Le message d'un accès refusé (le moteur le dit de la même façon). */
export const DENIED_MESSAGE = "La saisie vocale a besoin du micro et de la reconnaissance vocale.";
export const OPEN_MACOS_SETTINGS = "Ouvrir les réglages de macOS";

/** Ce que le micro montre : son état, sa bulle d'aide, et s'il peut être cliqué. */
export interface Microphone {
  readonly kind: "idle" | "preparing" | "listening" | "unavailable";
  readonly title: string;
  /** Faux pour un accès refusé : grisé, mais un clic ouvre le message qui dit quoi faire (§ 8). */
  readonly enabled: boolean;
}

/** Ce dont dépend le micro. */
export interface MicrophoneInput {
  /** Ce que dit le moteur ; rien tant qu'il n'a pas répondu. */
  readonly engine: VoiceInputStatusItem | null;
  readonly session: VoiceSession;
  /** L'accès au micro est refusé (dit par le moteur à l'ouverture ou à un échec). */
  readonly denied: boolean;
  /** Le contenu ouvert a un éditeur de texte où écrire. */
  readonly editable: boolean;
}

/** Le micro, d'après son état : repos, préparation, écoute ou indisponible, avec la raison dans la bulle. */
export function microphoneOf(input: MicrophoneInput): Microphone {
  const rest = {
    kind: "idle",
    title: displayToolTitle(NAME, "voice-input"),
    enabled: true,
  } as const;
  switch (input.session) {
    case "starting":
    case "preparing":
      return { kind: "preparing", title: PREPARING, enabled: true };
    case "listening":
      return { kind: "listening", title: LISTENING, enabled: true };
    case "ending":
      return { ...rest, enabled: false };
    case "idle":
      break;
  }
  if (input.engine?.kind === "unavailable")
    return { kind: "unavailable", title: input.engine.message, enabled: false };
  if (!input.editable) return { kind: "unavailable", title: NO_EDITOR, enabled: false };
  if (input.denied) return { kind: "unavailable", title: DENIED, enabled: true };
  return rest;
}
