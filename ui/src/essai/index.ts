// Essai de l'application réelle (fiche 0054) : le point d'entrée, chargé par `main.ts` seulement dans
// l'application construite pour l'essai (`__ESSAI__`). Il relie l'application (pont, colonnes, liste) aux
// commandes de l'essai de Rust, et lance le déroulement.
import { invoke } from "@tauri-apps/api/core";
import type * as Bridge from "../bridge";
import type { OpenColumns } from "../app/columns";
import type { Workspace } from "../app/workspace";
import type { ScreenActions } from "../screens/screen-view";
import { type Host, type Settings, conduct } from "./conduct";
import { scenariosFor } from "./scenarios";
import type { Env } from "./scenarios/env";

/** Ce que `main.ts` donne à l'essai : les morceaux de l'application qu'un utilisateur atteint par l'écran. */
export interface AppHandles {
  readonly bridge: typeof Bridge;
  readonly actions: Pick<ScreenActions, "open">;
  readonly workspace: Pick<Workspace, "open">;
  readonly columns: Pick<OpenColumns, "activePane">;
}

/** Les mêmes, sous la forme que les scénarios attendent. */
function envOf(app: AppHandles, directory: string): Env {
  return {
    bridge: app.bridge,
    open: (path) => app.actions.open(path),
    showWorkspace: (info) => app.workspace.open(info),
    exportCanvasImage: () =>
      app.columns.activePane().canvasPane()?.exportImage() ?? Promise.resolve(),
    directory,
    shared: {},
  };
}

/** Le premier espace de travail : celui des scénarios du canvas, des notes et des exports. */
async function prepare(app: AppHandles, settings: Settings) {
  const info = await app.bridge.addWorkspace("essai", `${settings.workspace}/notes`);
  const env = envOf(app, settings.workspace);
  await env.showWorkspace(info);
  return scenariosFor(env);
}

export function start(app: AppHandles): void {
  const host: Host = {
    settings: () => invoke<Settings | null>("essai_settings"),
    writeReport: (report) => invoke<null>("essai_write_report", { report }),
    quit: () => invoke<null>("essai_quit"),
    window: () => ({ width: innerWidth, height: innerHeight, engine: navigator.userAgent }),
    prepare: (settings) => prepare(app, settings),
  };
  void conduct(host, { now: () => performance.now() });
}
