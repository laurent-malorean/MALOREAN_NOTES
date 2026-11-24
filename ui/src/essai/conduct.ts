// Essai de l'application réelle (fiche 0054) : le déroulement d'un essai. Rust donne les emplacements ;
// l'interface joue les scénarios, remet le rapport à Rust, puis demande à quitter. Sans emplacements
// (application lancée normalement), il ne se passe rien.
import { type Clock, type Scenario, playAll } from "./runner";
import type { Report } from "./report";

/** Les emplacements donnés par Rust, d'après l'environnement du lancement. */
export interface Settings {
  readonly report: string;
  readonly workspace: string;
}

/** Ce que le déroulement demande à l'application : les commandes de l'essai et la fenêtre. */
export interface Host {
  settings(): Promise<Settings | null>;
  writeReport(report: string): Promise<unknown>;
  quit(): Promise<unknown>;
  window(): Report["window"];
  /** La mise en place des scénarios : prépare l'espace de travail, rend les scénarios à jouer. */
  prepare(settings: Settings): Promise<readonly Scenario[]>;
}

/** Une mise en place ratée devient un scénario échoué, pour que le rapport le dise. */
function failedSetup(error: unknown): Scenario {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: "Mise en place de l'essai",
    run: () => Promise.reject(new Error(message)),
  };
}

/** Joue l'essai ; rend vrai s'il a eu lieu. L'application quitte dans tous les cas, rapport écrit ou non. */
export async function conduct(host: Host, clock: Clock): Promise<boolean> {
  const settings = await host.settings();
  if (settings === null) return false;
  try {
    const scenarios = await host.prepare(settings).catch((error: unknown) => [failedSetup(error)]);
    const viewport = () => host.window();
    const report = await playAll(scenarios, host.window(), clock, undefined, viewport);
    await host.writeReport(JSON.stringify(report, null, 2));
  } finally {
    await host.quit();
  }
  return true;
}
