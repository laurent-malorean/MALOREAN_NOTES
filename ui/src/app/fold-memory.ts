// Dossiers pliés gardés : ceux de la bibliothèque affichée, gardés à chaque changement de
// l'écran et rendus à sa réouverture.
import type { PreferenceStorage } from "../state/focus-preference";
import { loadFolded, saveFolded } from "../state/folding";
import type { Screen } from "../state/screen";

export interface FoldMemory {
  /** Les dossiers pliés gardés pour cette bibliothèque ; aucun s'il n'y en a pas. */
  load(library: string): string[];
  /** Garde les dossiers pliés de la bibliothèque affichée ; rien sur l'accueil. */
  save(screen: Screen): void;
}

export function createFoldMemory(storage: PreferenceStorage): FoldMemory {
  return {
    load: (library) => loadFolded(storage, library),
    save: (screen) => {
      if (screen.kind === "library") saveFolded(storage, screen.library.path, screen.folded);
    },
  };
}
