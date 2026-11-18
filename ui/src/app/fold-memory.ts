// Dossiers pliés gardés : ceux de l'espace de travail affiché, gardés à chaque changement de
// l'écran et rendus à sa réouverture.
import type { PreferenceStorage } from "../state/focus-preference";
import { loadFolded, saveFolded } from "../state/folding";
import type { Screen } from "../state/screen";

export interface FoldMemory {
  /** Les dossiers pliés gardés pour cet espace de travail ; aucun s'il n'y en a pas. */
  load(workspace: string): string[];
  /** Garde les dossiers pliés de l'espace de travail affiché ; rien sur l'accueil. */
  save(screen: Screen): void;
}

export function createFoldMemory(storage: PreferenceStorage): FoldMemory {
  return {
    load: (workspace) => loadFolded(storage, workspace),
    save: (screen) => {
      if (screen.kind === "workspace") saveFolded(storage, screen.workspace.path, screen.folded);
    },
  };
}
