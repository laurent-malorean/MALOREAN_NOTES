// Lancement : l'accueil d'abord, puis les dossiers des modèles gardés autrefois par l'interface passent au moteur,
// le dernier espace de travail se rouvre (colonnes retrouvées) et sa note du jour s'ouvre si les réglages le demandent.
import type * as Bridge from "../bridge";
import type { WorkspaceInfo } from "../bridge";
import { welcome } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";

export interface LaunchDeps {
  readonly bridge: Pick<typeof Bridge, "reopenLastWorkspace">;
  readonly screen: Pick<CurrentScreen, "show">;
  readonly columns: Pick<OpenColumns, "change" | "current">;
  readonly templates: { migrate(): Promise<void> };
  readonly workspace: { open(opened: WorkspaceInfo): Promise<unknown> };
  readonly journal: { atLaunch(): Promise<unknown> };
  readonly error: (error: unknown) => void;
}

/** Lance l'application ; une erreur d'ouverture est dite, jamais rejetée. */
export function launch(deps: LaunchDeps): Promise<void> {
  deps.screen.show(welcome);
  void deps.columns.change(deps.columns.current());
  return deps.templates
    .migrate()
    .then(deps.bridge.reopenLastWorkspace)
    .then((opened) =>
      opened ? deps.workspace.open(opened).then(deps.journal.atLaunch) : undefined,
    )
    .then(() => undefined)
    .catch(deps.error);
}
