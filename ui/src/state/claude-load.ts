// Charge annoncée par Claude Code à chaque réponse, montrée dans la barre de saisie : la version
// du modèle qui a répondu, la limite d'utilisation de l'abonnement (session et semaine, avec leur
// remise à zéro) et le remplissage du contexte de la conversation (fiche 0032).
import type { ClaudeEventItem, LimitPeriodItem, UsageWindowItem } from "../bridge";

/** Le remplissage du contexte : les jetons occupés sur la taille maximale du contexte du modèle. */
export interface ContextFill {
  readonly used: number;
  readonly size: number;
}

/** La limite d'utilisation : atteinte ou non, et chaque période annoncée. */
export interface UsageLimits {
  readonly reached: boolean;
  readonly windows: readonly UsageWindowItem[];
}

export interface ClaudeLoad {
  /** Le nom complet du modèle qui a répondu dans cette conversation. */
  readonly model: string | null;
  readonly context: ContextFill | null;
  /** Celle de l'abonnement : elle ne dépend pas de la conversation. */
  readonly limits: UsageLimits | null;
}

export const NO_LOAD: ClaudeLoad = { model: null, context: null, limits: null };

/** Les événements qui annoncent la charge ; les autres ne la changent pas. */
export type LoadEvent = Extract<
  ClaudeEventItem,
  { kind: "modelUsed" | "usageLimits" | "contextFilled" }
>;

const LOAD_KINDS: ReadonlySet<ClaudeEventItem["kind"]> = new Set([
  "modelUsed",
  "usageLimits",
  "contextFilled",
]);

/** L'événement annonce la charge. */
export const isLoadEvent = (event: ClaudeEventItem): event is LoadEvent =>
  LOAD_KINDS.has(event.kind);

/** Un événement de Claude est arrivé : il annonce peut-être la charge. */
export function loadEventReceived(load: ClaudeLoad, event: ClaudeEventItem): ClaudeLoad {
  if (event.kind === "modelUsed") return { ...load, model: event.model };
  if (event.kind === "usageLimits") {
    return { ...load, limits: { reached: event.reached, windows: event.windows } };
  }
  if (event.kind === "contextFilled") {
    return { ...load, context: { used: event.used, size: event.size } };
  }
  return load;
}

/** Normal, proche de la limite (couleur d'alerte), ou limite atteinte. */
export type LoadLevel = "normal" | "close" | "reached";

/** À partir de cette part utilisée, la pastille prend la couleur d'alerte. */
export const CLOSE_PERCENT = 80;

/** Ce qu'une pastille de la charge montre : son texte, sa bulle d'aide et son niveau. */
export interface LoadChip {
  readonly text: string;
  readonly title: string;
  readonly level: LoadLevel;
}

const levelOf = (percent: number): LoadLevel => (percent >= CLOSE_PERCENT ? "close" : "normal");

const COUNT = new Intl.NumberFormat("fr-FR");

/** La pastille du contexte : « Contexte 42 % » ; rien avant la première réponse de la conversation. */
export function contextChip(context: ContextFill | null): LoadChip | null {
  if (context === null) return null;
  const percent = Math.round((context.used / context.size) * 100);
  return {
    text: `Contexte ${percent} %`,
    title:
      `Contexte de la conversation rempli à ${percent} % : ${COUNT.format(context.used)} sur ` +
      `${COUNT.format(context.size)} jetons à la fin de la dernière réponse.\n` +
      "Plus il est rempli, plus chaque message use la limite d'utilisation ; " +
      "« Nouvelle conversation » repart d'un contexte vide.",
    level: levelOf(percent),
  };
}

const MINUTE = 60_000;

/** Le temps avant une remise à zéro : « 59 min », « 3 h 05 », « 5 j 3 h ». */
export function remainingText(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / MINUTE);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

const PERIODS: Record<LimitPeriodItem, { name: string; detail: string }> = {
  session: { name: "Session", detail: "Session (5 heures)" },
  week: { name: "Semaine", detail: "Semaine (7 jours)" },
};

/** Une période vue à l'instant `nowMs` : remise à zéro passée, elle repart de 0 %. */
interface Period {
  readonly period: LimitPeriodItem;
  readonly percent: number;
  /** Le temps avant sa remise à zéro ; rien si elle est passée. */
  readonly remaining: string | null;
}

function periodAt({ period, percent, resetsAt }: UsageWindowItem, nowMs: number): Period {
  const remainingMs = resetsAt * 1000 - nowMs;
  return remainingMs > 0
    ? { period, percent, remaining: remainingText(remainingMs) }
    : { period, percent: 0, remaining: null };
}

const periodLine = ({ period, percent, remaining }: Period) =>
  remaining === null
    ? `${PERIODS[period].detail} : remise à zéro faite depuis la dernière réponse.`
    : `${PERIODS[period].detail} : ${percent} % utilisés, remise à zéro dans ${remaining}.`;

export const LIMIT_EXPLAINED =
  "Limite d'utilisation de votre abonnement Claude, annoncée par Claude Code à chaque réponse.";
export const LIMIT_CLOSE =
  "Bientôt la limite : au-delà, Claude ne répond plus jusqu'à la remise à zéro.";
export const LIMIT_REACHED = "Limite atteinte : Claude ne répond plus jusqu'à la remise à zéro.";

/**
 * La pastille de la limite d'utilisation à l'instant `nowMs`, sur la période la plus utilisée :
 * « Session 16 % · 59 min » ; « Limite atteinte · 59 min » ; rien avant la première réponse.
 */
export function limitChip(limits: UsageLimits | null, nowMs: number): LoadChip | null {
  if (limits === null || (limits.windows.length === 0 && !limits.reached)) return null;
  const periods = limits.windows.map((window) => periodAt(window, nowMs));
  const most = periods.reduce<Period | null>(
    (best, period) => (best === null || period.percent > best.percent ? period : best),
    null,
  );
  const time = most?.remaining == null ? "" : ` · ${most.remaining}`;
  // Atteinte, la limite se dit en toutes lettres ; sinon, la période la plus utilisée.
  const named = limits.reached ? null : most;
  const level: LoadLevel = named === null ? "reached" : levelOf(named.percent);
  const warning = { normal: [], close: [LIMIT_CLOSE], reached: [LIMIT_REACHED] }[level];
  return {
    text:
      named === null
        ? `Limite atteinte${time}`
        : `${PERIODS[named.period].name} ${named.percent} %${time}`,
    title: [...warning, LIMIT_EXPLAINED, ...periods.map(periodLine)].join("\n"),
    level,
  };
}
