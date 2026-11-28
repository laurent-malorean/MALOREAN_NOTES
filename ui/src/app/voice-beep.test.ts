import { describe, expect, it, vi } from "vitest";
import {
  BEEP_VOLUME,
  type BeepContext,
  createBeeper,
  HIGH_NOTE,
  LOW_NOTE,
  NOTE_SECONDS,
  notesOf,
} from "./voice-beep";

/** Un contexte audio qui garde ce qu'on lui demande de jouer. */
function fakeContext(state = "running") {
  const notes: { frequency: number; start: number; stop: number; connected: unknown[] }[] = [];
  const volumes: { calls: [string, number, number][] }[] = [];
  const context = {
    currentTime: 10,
    destination: "haut-parleur",
    state,
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    createOscillator: () => {
      const note = { frequency: 0, start: 0, stop: 0, connected: [] as unknown[] };
      notes.push(note);
      return {
        frequency: {
          set value(frequency: number) {
            note.frequency = frequency;
          },
        },
        connect: (node: unknown) => void note.connected.push(node),
        start: (at: number) => void (note.start = at),
        stop: (at: number) => void (note.stop = at),
      };
    },
    createGain: () => {
      const volume = { calls: [] as [string, number, number][] };
      volumes.push(volume);
      return {
        gain: {
          setValueAtTime: (value: number, at: number) => void volume.calls.push(["set", value, at]),
          linearRampToValueAtTime: (value: number, at: number) =>
            void volume.calls.push(["ramp", value, at]),
        },
        connect: (node: unknown) =>
          void volume.calls.push(["to", 0, node === "haut-parleur" ? 1 : 0]),
      };
    },
  };
  return { context: context as BeepContext & { state: string }, notes, volumes };
}

describe("bips de la saisie vocale", () => {
  it("le début monte (660 puis 880 Hz), la fin descend", () => {
    expect(LOW_NOTE).toBe(660);
    expect(HIGH_NOTE).toBe(880);
    expect(notesOf("start")).toEqual([660, 880]);
    expect(notesOf("end")).toEqual([880, 660]);
  });

  it("joue deux notes de 80 ms, l'une après l'autre, à partir de l'instant présent", () => {
    const { context, notes } = fakeContext();
    createBeeper(() => context).play("start");
    expect(NOTE_SECONDS).toBe(0.08);
    expect(notes.map((note) => note.frequency)).toEqual([660, 880]);
    expect(notes.map((note) => note.start)).toEqual([10, 10 + NOTE_SECONDS]);
    expect(notes.map((note) => note.stop)).toEqual([10 + NOTE_SECONDS, 10 + 2 * NOTE_SECONDS]);
  });

  it("la fin joue les notes à l'envers", () => {
    const { context, notes } = fakeContext();
    createBeeper(() => context).play("end");
    expect(notes.map((note) => note.frequency)).toEqual([880, 660]);
  });

  it("garde un volume modéré, avec une montée et une descente courtes contre le claquement", () => {
    const { context, volumes } = fakeContext();
    createBeeper(() => context).play("start");
    expect(BEEP_VOLUME).toBeGreaterThan(0);
    expect(BEEP_VOLUME).toBeLessThanOrEqual(0.2);
    expect(volumes).toHaveLength(2);
    expect(volumes[0]?.calls).toEqual([
      ["set", 0, 10],
      ["ramp", BEEP_VOLUME, 10.01],
      ["set", BEEP_VOLUME, 10 + NOTE_SECONDS - 0.01],
      ["ramp", 0, 10 + NOTE_SECONDS],
      ["to", 0, 1],
    ]);
  });

  it("relie chaque note à son volume, et le volume à la sortie", () => {
    const { context, notes } = fakeContext();
    createBeeper(() => context).play("start");
    for (const note of notes) expect(note.connected).toHaveLength(1);
  });

  it("ne crée le contexte audio qu'au premier besoin, et le garde", () => {
    const { context } = fakeContext();
    const newContext = vi.fn(() => context);
    const beeper = createBeeper(newContext);
    expect(newContext).not.toHaveBeenCalled();
    beeper.unlock();
    beeper.play("start");
    beeper.play("end");
    expect(newContext).toHaveBeenCalledTimes(1);
  });

  it("réveille un contexte endormi (le navigateur le suspend tant qu'aucun geste ne l'a permis)", () => {
    const { context } = fakeContext("suspended");
    createBeeper(() => context).unlock();
    expect(context.resume).toHaveBeenCalledTimes(1);
    const running = fakeContext("running");
    createBeeper(() => running.context).unlock();
    expect(running.context.resume).not.toHaveBeenCalled();
  });

  it("sans audio, rien ne casse : ni le déblocage ni le bip ne lèvent d'erreur", () => {
    const beeper = createBeeper(() => {
      throw new Error("pas d'audio");
    });
    expect(() => beeper.unlock()).not.toThrow();
    expect(() => beeper.play("start")).not.toThrow();
  });

  it("un contexte qui refuse de se réveiller ne casse pas le bip", async () => {
    const { context } = fakeContext("suspended");
    context.resume = vi.fn(() => Promise.reject(new Error("refusé")));
    const beeper = createBeeper(() => context);
    expect(() => beeper.play("end")).not.toThrow();
    await Promise.resolve();
  });
});
