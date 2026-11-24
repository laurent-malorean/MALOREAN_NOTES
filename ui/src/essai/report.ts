// Essai de l'application réelle (fiche 0054) : le rapport que l'application écrit, lu ensuite par
// scripts/essai-application.sh. Le format est le contrat entre les deux : `version` change avec lui.

export const REPORT_VERSION = 1;

/** Une vérification d'un scénario : ce qu'on attendait, si c'est arrivé, et ce qu'on a mesuré. */
export interface CheckReport {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export type ScenarioStatus = "réussi" | "échoué";

export interface ScenarioReport {
  readonly name: string;
  readonly status: ScenarioStatus;
  readonly durationMs: number;
  readonly checks: readonly CheckReport[];
  /** Les mesures prises dans la vraie fenêtre (rectangles, tailles, nombres de points…). */
  readonly measures: Readonly<Record<string, unknown>>;
  readonly notes: readonly string[];
  /** Le message de l'erreur qui a arrêté le scénario, s'il y en a eu une. */
  readonly error: string | null;
  /** La taille de la fenêtre au début et à la fin du scénario. */
  readonly viewport: {
    readonly start: { readonly width: number; readonly height: number };
    readonly end: { readonly width: number; readonly height: number };
  };
}

export interface Report {
  readonly version: typeof REPORT_VERSION;
  readonly durationMs: number;
  /** La fenêtre où l'essai a joué : taille et moteur réels. */
  readonly window: { readonly width: number; readonly height: number; readonly engine: string };
  /** Ce que l'essai ne couvre pas, dit dans chaque rapport. */
  readonly notCovered: readonly string[];
  readonly passed: number;
  readonly failed: number;
  readonly scenarios: readonly ScenarioReport[];
}

/** Ce que l'essai ne couvre pas (le rapport le répète pour qui le lit sans le reste). */
export const NOT_COVERED: readonly string[] = [
  "Les boîtes de dialogue natives de macOS (choix de fichier, fenêtre d'enregistrement) ne sont pas pilotables : chaque scénario donne le chemin directement à la fonction qui suit la boîte.",
  "Les gestes du clavier et de la souris sont simulés par des événements, pas par le système.",
];

/** Un scénario est réussi quand il n'a pas d'erreur et que toutes ses vérifications le sont. */
export function statusOf(checks: readonly CheckReport[], error: string | null): ScenarioStatus {
  return error === null && checks.every((check) => check.ok) ? "réussi" : "échoué";
}

export function buildReport(
  scenarios: readonly ScenarioReport[],
  window: Report["window"],
  durationMs: number,
): Report {
  const passed = scenarios.filter((scenario) => scenario.status === "réussi").length;
  return {
    version: REPORT_VERSION,
    durationMs,
    window,
    notCovered: NOT_COVERED,
    passed,
    failed: scenarios.length - passed,
    scenarios,
  };
}
