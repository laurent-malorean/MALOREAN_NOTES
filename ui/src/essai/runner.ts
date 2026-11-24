// Essai de l'application réelle (fiche 0054) : joue les scénarios l'un après l'autre. Une vérification
// ratée n'arrête pas le scénario (le rapport montre tout ce qui ne va pas) ; une erreur l'arrête.
import {
  type CheckReport,
  type Report,
  type ScenarioReport,
  buildReport,
  statusOf,
} from "./report";

/** Ce qu'un scénario dispose pour dire ce qu'il constate. */
export interface Trial {
  /** Une vérification : `ok` dit si c'est arrivé, `detail` ce qui a été mesuré. */
  check(name: string, ok: boolean, detail?: string): void;
  measure(key: string, value: unknown): void;
  note(text: string): void;
}

export interface Scenario {
  readonly name: string;
  run(trial: Trial): Promise<void>;
}

/** Au-delà, un scénario est tenu pour bloqué. */
export const SCENARIO_TIMEOUT_MS = 90_000;

export interface Clock {
  now(): number;
}

/** La taille de la fenêtre, relevée au début et à la fin de chaque scénario : elle peut changer en route. */
export type Viewport = () => { readonly width: number; readonly height: number };

/** Le message d'une erreur : celle de Rust arrive en objet `{ message }`, une autre peut n'être qu'un texte. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error)
    return String(error.message);
  return typeof error === "string" ? error : JSON.stringify(error);
}

/** Rejette après `ms` ; `cancel` arrête l'attente quand le scénario a fini. */
function deadline(ms: number): { late: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`scénario bloqué : plus de ${ms} ms`)), ms);
  });
  return { late, cancel: () => clearTimeout(timer) };
}

/** Joue un scénario : ses vérifications, ses mesures, et l'erreur qui l'a arrêté s'il y en a une. */
export async function playScenario(
  scenario: Scenario,
  clock: Clock,
  timeoutMs = SCENARIO_TIMEOUT_MS,
  viewport: Viewport = () => ({ width: 0, height: 0 }),
): Promise<ScenarioReport> {
  const checks: CheckReport[] = [];
  const measures: Record<string, unknown> = {};
  const notes: string[] = [];
  const trial: Trial = {
    check: (name, ok, detail = "") => void checks.push({ name, ok, detail }),
    measure: (key, value) => void (measures[key] = value),
    note: (text) => void notes.push(text),
  };
  const started = clock.now();
  const viewportStart = viewport();
  const limit = deadline(timeoutMs);
  let error: string | null = null;
  try {
    await Promise.race([scenario.run(trial), limit.late]);
  } catch (caught) {
    error = messageOf(caught);
  } finally {
    limit.cancel();
  }
  const status = statusOf(checks, error);
  return {
    name: scenario.name,
    status,
    durationMs: clock.now() - started,
    checks,
    measures,
    notes,
    error,
    viewport: { start: viewportStart, end: viewport() },
  };
}

/** Joue tous les scénarios, dans l'ordre, et fait le rapport. */
export async function playAll(
  scenarios: readonly Scenario[],
  window: Report["window"],
  clock: Clock,
  timeoutMs = SCENARIO_TIMEOUT_MS,
  viewport?: Viewport,
): Promise<Report> {
  const started = clock.now();
  const played: ScenarioReport[] = [];
  for (const scenario of scenarios)
    played.push(await playScenario(scenario, clock, timeoutMs, viewport));
  return buildReport(played, window, clock.now() - started);
}
