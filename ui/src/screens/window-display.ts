// Disposition de la fenêtre : plein écran et panneaux latéraux (montrés ou cachés, et leur
// largeur), réglés indépendamment.
import { type PreferenceStorage } from "../state/focus-preference";
import { loadSidePanels, nextSidePanels, saveSidePanels } from "../state/side-panels-preference";
import { showFullScreen, showSidePanels } from "./editor-tools";
import { connectPanelEdges } from "./panel-edges";

/** Ce que la fenêtre du Mac sait faire de son plein écran. */
export interface WindowControl {
  setFullScreen(on: boolean): Promise<void>;
  isFullScreen(): Promise<boolean>;
  /** Prévient à chaque changement de taille, entrée et sortie du plein écran comprises. */
  onWindowResized(callback: () => void): Promise<unknown>;
}

export interface WindowParts {
  readonly mainArea: HTMLElement;
  readonly fullScreenButton: HTMLElement;
  readonly sidePanelsButton: HTMLElement;
}

export interface WindowDisplay {
  toggleFullScreen(): Promise<void>;
  /** Sort du plein écran ; rend faux si la fenêtre n'y était pas. */
  leaveFullScreen(): boolean;
  toggleSidePanels(): void;
}

/**
 * Relie les boutons du plein écran et des panneaux latéraux. Le plein écran ne change pas la
 * disposition : les panneaux restent comme ils étaient, et leur choix est gardé.
 */
export function connectWindowDisplay(
  parts: WindowParts,
  deps: {
    window: WindowControl;
    storage: PreferenceStorage;
    error: (error: unknown) => void;
  },
): WindowDisplay {
  let fullScreen = false;
  const showWindowState = (on: boolean) => {
    fullScreen = on;
    showFullScreen(parts.fullScreenButton, on);
  };
  const setFullScreen = async (on: boolean) => {
    await deps.window.setFullScreen(on);
    showWindowState(on);
  };
  const toggleFullScreen = () => setFullScreen(!fullScreen);
  parts.fullScreenButton.addEventListener("click", () => void toggleFullScreen().catch(deps.error));
  // Le plein écran peut aussi venir du bouton vert ou du menu du Mac : la fenêtre fait foi.
  void deps.window
    .onWindowResized(() => void deps.window.isFullScreen().then(showWindowState).catch(deps.error))
    .catch(deps.error);

  let panels = loadSidePanels(deps.storage);
  const applySidePanels = () => showSidePanels(parts.mainArea, parts.sidePanelsButton, panels);
  const toggleSidePanels = () => {
    panels = nextSidePanels(panels);
    applySidePanels();
    saveSidePanels(deps.storage, panels);
  };
  parts.sidePanelsButton.addEventListener("click", toggleSidePanels);
  applySidePanels();
  connectPanelEdges(parts.mainArea, deps.storage);

  return {
    toggleFullScreen,
    leaveFullScreen: () => fullScreen && (void setFullScreen(false).catch(deps.error), true),
    toggleSidePanels,
  };
}
