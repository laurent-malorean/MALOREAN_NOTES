import { describe, expect, it } from "vitest";
import type { ClaudeEventItem } from "../bridge";
import {
  contextChip,
  LIMIT_CLOSE,
  LIMIT_EXPLAINED,
  LIMIT_REACHED,
  limitChip,
  loadEventReceived,
  NO_LOAD,
  remainingText,
} from "./claude-load";

const MINUTE = 60_000;
/** Un instant fixe, en millisecondes ; les remises à zéro sont en secondes. */
const NOW = 1_795_138_261_000;
const inMinutes = (minutes: number) => (NOW + minutes * MINUTE) / 1000;

const session = (percent: number, minutes: number) => ({
  period: "session" as const,
  percent,
  resetsAt: inMinutes(minutes),
});
const week = (percent: number, minutes: number) => ({
  period: "week" as const,
  percent,
  resetsAt: inMinutes(minutes),
});

describe("charge annoncée par Claude Code", () => {
  it("le modèle, la limite et le contexte se retiennent au fil des événements", () => {
    const events: ClaudeEventItem[] = [
      { kind: "modelUsed", model: "claude-opus-5-5" },
      { kind: "message", agent: null, text: "ok" },
      { kind: "usageLimits", reached: false, windows: [session(16, 59)] },
      { kind: "contextFilled", used: 420, size: 1000 },
    ];
    expect(events.reduce(loadEventReceived, NO_LOAD)).toEqual({
      model: "claude-opus-5-5",
      limits: { reached: false, windows: [session(16, 59)] },
      context: { used: 420, size: 1000 },
    });
  });

  it("un autre événement ne change pas la charge", () => {
    const event: ClaudeEventItem = { kind: "message", agent: null, text: "ok" };
    expect(loadEventReceived(NO_LOAD, event)).toBe(NO_LOAD);
  });
});

describe("pastille du contexte", () => {
  it("elle dit la part occupée, avec le détail en jetons dans la bulle", () => {
    expect(contextChip({ used: 420_000, size: 1_000_000 })).toEqual({
      text: "Contexte 42 %",
      title:
        "Contexte de la conversation rempli à 42 % : 420 000 sur 1 000 000 jetons à la fin de la dernière réponse.\n" +
        "Plus il est rempli, plus chaque message use la limite d'utilisation ; « Nouvelle conversation » repart d'un contexte vide.",
      level: "normal",
    });
  });

  it("elle prend la couleur d'alerte à partir de 80 %, et se cache avant la première réponse", () => {
    expect(contextChip({ used: 795, size: 1000 })).toMatchObject({
      text: "Contexte 80 %",
      level: "close",
    });
    expect(contextChip({ used: 794, size: 1000 })).toMatchObject({
      text: "Contexte 79 %",
      level: "normal",
    });
    expect(contextChip(null)).toBeNull();
  });
});

describe("pastille de la limite d'utilisation", () => {
  it("le temps avant la remise à zéro se lit en minutes, en heures, puis en jours", () => {
    expect(remainingText(1)).toBe("1 min");
    expect(remainingText(59 * MINUTE)).toBe("59 min");
    expect(remainingText(59 * MINUTE + 1)).toBe("1 h 00");
    expect(remainingText(185 * MINUTE)).toBe("3 h 05");
    expect(remainingText(24 * 60 * MINUTE - MINUTE)).toBe("23 h 59");
    expect(remainingText(24 * 60 * MINUTE)).toBe("1 j 0 h");
    expect(remainingText((5 * 24 + 3) * 60 * MINUTE)).toBe("5 j 3 h");
  });

  it("elle montre la période la plus utilisée et le temps avant sa remise à zéro", () => {
    const limits = { reached: false, windows: [session(16, 59), week(43, 7380)] };
    expect(limitChip(limits, NOW)).toEqual({
      text: "Semaine 43 % · 5 j 3 h",
      title: [
        LIMIT_EXPLAINED,
        "Session (5 heures) : 16 % utilisés, remise à zéro dans 59 min.",
        "Semaine (7 jours) : 43 % utilisés, remise à zéro dans 5 j 3 h.",
      ].join("\n"),
      level: "normal",
    });
    const even = { reached: false, windows: [session(40, 59), week(40, 7380)] };
    expect(limitChip(even, NOW)?.text).toBe("Session 40 % · 59 min");
  });

  it("à partir de 80 %, elle prend la couleur d'alerte et prévient", () => {
    const chip = limitChip({ reached: false, windows: [session(80, 30)] }, NOW);
    expect(chip?.level).toBe("close");
    expect(chip?.title.split("\n")[0]).toBe(LIMIT_CLOSE);
    expect(limitChip({ reached: false, windows: [session(79, 30)] }, NOW)?.level).toBe("normal");
  });

  it("atteinte, elle le dit en toutes lettres, avec le temps avant la remise à zéro", () => {
    const chip = limitChip({ reached: true, windows: [session(100, 30), week(60, 7380)] }, NOW);
    expect(chip?.text).toBe("Limite atteinte · 30 min");
    expect(chip?.level).toBe("reached");
    expect(chip?.title.split("\n")[0]).toBe(LIMIT_REACHED);
    expect(limitChip({ reached: true, windows: [] }, NOW)).toEqual({
      text: "Limite atteinte",
      title: [LIMIT_REACHED, LIMIT_EXPLAINED].join("\n"),
      level: "reached",
    });
  });

  it("une remise à zéro passée depuis la dernière réponse repart de 0 %", () => {
    const chip = limitChip({ reached: false, windows: [session(95, 0), week(10, 60)] }, NOW);
    expect(chip?.text).toBe("Semaine 10 % · 1 h 00");
    expect(chip?.title.split("\n")[1]).toBe(
      "Session (5 heures) : remise à zéro faite depuis la dernière réponse.",
    );
    expect(limitChip({ reached: false, windows: [session(95, 0)] }, NOW)?.text).toBe("Session 0 %");
  });

  it("ses bulles d'aide expliquent la limite, et préviennent quand elle approche ou est atteinte", () => {
    expect(LIMIT_EXPLAINED).toBe(
      "Limite d'utilisation de votre abonnement Claude, annoncée par Claude Code à chaque réponse.",
    );
    expect(LIMIT_CLOSE).toBe(
      "Bientôt la limite : au-delà, Claude ne répond plus jusqu'à la remise à zéro.",
    );
    expect(LIMIT_REACHED).toBe("Limite atteinte : Claude ne répond plus jusqu'à la remise à zéro.");
  });

  it("elle se cache tant que Claude Code ne l'a pas annoncée", () => {
    expect(limitChip(null, NOW)).toBeNull();
    expect(limitChip({ reached: false, windows: [] }, NOW)).toBeNull();
  });
});
