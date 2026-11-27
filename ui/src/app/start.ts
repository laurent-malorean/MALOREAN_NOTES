// Démarrage : les styles, la surveillance des modifications faites hors de l'application, puis le lancement
// (sorti de main.ts pour le garder court : doc/developpement/code.md).
import "../theme.css";
import "../style.css";
import type * as Bridge from "../bridge";
import { connectExternalChanges, type ExternalChangesDeps } from "./external-changes";
import { launch, type LaunchDeps } from "./launch";
import type { Messages } from "./messages";

export type StartDeps = Omit<LaunchDeps, "error" | "bridge"> &
  Omit<ExternalChangesDeps, "backend" | "messages"> & {
    readonly bridge: Pick<
      typeof Bridge,
      "reopenLastWorkspace" | "onWorkspaceChanged" | "listAllNotes"
    >;
    readonly messages: Messages;
  };

/** Surveille les modifications extérieures, puis lance l'application. */
export function start(deps: StartDeps): Promise<void> {
  const { bridge, messages } = deps;
  connectExternalChanges({ ...deps, backend: bridge, messages });
  return launch({ ...deps, bridge, error: messages.error });
}
