import { describe, expect, it } from "vitest";
import type { VoiceEventItem, VoiceInputStatusItem } from "../bridge";
import {
  levelOf,
  microphoneOf,
  type MicrophoneInput,
  sessionAfter,
  type VoiceSession,
} from "./voice-input";

const available: VoiceInputStatusItem = {
  kind: "available",
  access: "allowed",
  language: "fr-FR",
  languageName: "français (France)",
  usingMacLanguage: true,
  languages: [],
  listening: false,
};

const input = (changes: Partial<MicrophoneInput> = {}): MicrophoneInput => ({
  engine: available,
  session: "idle",
  denied: false,
  editable: true,
  ...changes,
});

describe("saisie vocale : où elle en est après chaque événement du moteur", () => {
  const after = (session: VoiceSession, event: VoiceEventItem) => sessionAfter(session, event);

  it("passe de la préparation à l'écoute, et revient au repos à la fin", () => {
    expect(after("starting", { kind: "preparing" })).toBe("preparing");
    expect(after("preparing", { kind: "listening" })).toBe("listening");
    expect(after("starting", { kind: "listening" })).toBe("listening");
    expect(after("listening", { kind: "ended" })).toBe("idle");
    expect(after("ending", { kind: "ended" })).toBe("idle");
  });

  it("l'arrêt demandé reste un arrêt : une écoute qui se termine ne redevient pas active", () => {
    expect(after("ending", { kind: "listening" })).toBe("ending");
    expect(after("ending", { kind: "preparing" })).toBe("ending");
  });

  it("le silence et l'échec arrêtent l'écoute, qui finit par `ended`", () => {
    expect(after("listening", { kind: "silence", message: "m" })).toBe("ending");
    expect(after("preparing", { kind: "failed", reason: "stopped", message: "m" })).toBe("ending");
  });

  it("les textes et le niveau ne changent rien", () => {
    for (const event of [
      { kind: "provisional", text: "a" },
      { kind: "fixed", text: "a" },
      { kind: "level", value: 0.4 },
    ] as const)
      expect(after("listening", event)).toBe("listening");
  });
});

describe("saisie vocale : le niveau sonore du témoin", () => {
  it("est ramené entre 0 et 1, et 0 s'il n'est pas un nombre", () => {
    expect(levelOf(0.5)).toBe(0.5);
    expect(levelOf(-1)).toBe(0);
    expect(levelOf(3)).toBe(1);
    expect(levelOf(Number.NaN)).toBe(0);
    expect(levelOf(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("saisie vocale : ce que dit le micro", () => {
  it("au repos : bulle « Saisie vocale » et son raccourci, cliquable", () => {
    expect(microphoneOf(input())).toEqual({
      kind: "idle",
      title: "Saisie vocale (Ctrl+Maj+D)",
      enabled: true,
    });
  });

  it("en préparation (dès le clic) : l'icône tourne, la bulle le dit, un clic arrête", () => {
    for (const session of ["starting", "preparing"] as const)
      expect(microphoneOf(input({ session }))).toEqual({
        kind: "preparing",
        title: "Saisie vocale : préparation de la langue…",
        enabled: true,
      });
  });

  it("en écoute : « Arrêter la saisie vocale »", () => {
    expect(microphoneOf(input({ session: "listening" }))).toEqual({
      kind: "listening",
      title: "Arrêter la saisie vocale",
      enabled: true,
    });
  });

  it("pendant l'arrêt : au repos mais pas cliquable", () => {
    expect(microphoneOf(input({ session: "ending" }))).toEqual({
      kind: "idle",
      title: "Saisie vocale (Ctrl+Maj+D)",
      enabled: false,
    });
  });

  it("indisponible : la bulle dit la raison du moteur (macOS trop ancien, moteur introuvable)", () => {
    const engine = {
      kind: "unavailable",
      code: "systemTooOld",
      message: "Saisie vocale : macOS 26 minimum",
    } as const;
    expect(microphoneOf(input({ engine }))).toEqual({
      kind: "unavailable",
      title: "Saisie vocale : macOS 26 minimum",
      enabled: false,
    });
  });

  it("sans éditeur de texte : « ouvrez une note », grisé", () => {
    expect(microphoneOf(input({ editable: false }))).toEqual({
      kind: "unavailable",
      title: "Saisie vocale : ouvrez une note",
      enabled: false,
    });
  });

  it("accès refusé : grisé mais cliquable, pour ouvrir le message", () => {
    expect(microphoneOf(input({ denied: true }))).toEqual({
      kind: "unavailable",
      title: "Saisie vocale : accès au micro refusé",
      enabled: true,
    });
  });

  it("la raison du moteur passe avant le reste ; l'accès refusé après « ouvrez une note »", () => {
    const engine = { kind: "unavailable", code: "engineMissing", message: "introuvable" } as const;
    expect(microphoneOf(input({ engine, editable: false, denied: true })).title).toBe(
      "introuvable",
    );
    expect(microphoneOf(input({ editable: false, denied: true })).title).toBe(
      "Saisie vocale : ouvrez une note",
    );
  });

  it("avant la réponse du moteur : au repos", () => {
    expect(microphoneOf(input({ engine: null })).kind).toBe("idle");
  });
});
