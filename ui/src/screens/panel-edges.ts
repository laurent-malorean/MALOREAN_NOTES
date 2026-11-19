// Bord des panneaux : la liste des dossiers et celle des notes changent de largeur quand on tire
// leur bord droit, la colonne Claude Code quand on tire son bord gauche ; un double-clic rend la
// largeur par défaut. Le minimum et le maximum
// sont ceux du thème, appliqués par la grille de la fenêtre : la largeur gardée est celle qu'elle
// a vraiment prise, pour que le bord reparte aussitôt quand le pointeur revient.
import type { PreferenceStorage } from "../state/focus-preference";
import { forgetPanelWidth, loadPanelWidth, type Panel, savePanelWidth } from "../state/panel-width";

/**
 * Chaque panneau : son élément dans la fenêtre, la variable du thème de sa largeur, son nom, et
 * le sens de son bord : 1 s'il est à droite (tiré vers la droite, le panneau s'élargit), -1 s'il
 * est à gauche.
 */
const PANELS: readonly {
  panel: Panel;
  selector: string;
  variable: string;
  label: string;
  side: 1 | -1;
}[] = [
  {
    panel: "folders",
    selector: ".folders",
    variable: "--folders-width",
    label: "Largeur des dossiers",
    side: 1,
  },
  {
    panel: "notes",
    selector: ".sidebar",
    variable: "--sidebar-width",
    label: "Largeur de la liste des notes",
    side: 1,
  },
  {
    panel: "claude",
    selector: ".claude-column",
    variable: "--claude-column-width",
    label: "Largeur de la colonne Claude Code",
    side: -1,
  },
];

/** Pose un bord sur chaque panneau de `mainArea`, aux largeurs gardées dans `storage`. */
export function connectPanelEdges(mainArea: HTMLElement, storage: PreferenceStorage): void {
  for (const { panel, selector, variable, label, side } of PANELS) {
    const element = mainArea.querySelector(selector) as HTMLElement;
    const setWidth = (width: number) => mainArea.style.setProperty(variable, `${width}px`);
    /** La largeur demandée, ramenée par la grille entre le minimum et le maximum. */
    const resize = (width: number) => {
      setWidth(width);
      const shown = element.getBoundingClientRect().width;
      setWidth(shown);
      return shown;
    };
    const stored = loadPanelWidth(storage, panel);
    if (stored !== null) setWidth(stored);

    const edge = document.createElement("div");
    edge.className = "panel-edge";
    edge.setAttribute("role", "separator");
    edge.setAttribute("aria-orientation", "vertical");
    edge.setAttribute("aria-label", label);
    edge.title = "Tirer pour changer la largeur ; double-clic : largeur par défaut";
    // Le bord suit le pointeur depuis là où on l'a pris : un simple clic ne change rien.
    edge.addEventListener("pointerdown", (start) => {
      start.preventDefault();
      mainArea.classList.add("resizing");
      const from = element.getBoundingClientRect().width;
      const follow = (x: number) => resize(from + side * (x - start.clientX));
      const move = (event: PointerEvent) => void follow(event.clientX);
      const stop = (event: PointerEvent) => {
        document.removeEventListener("pointermove", move);
        mainArea.classList.remove("resizing");
        if (event.clientX !== start.clientX) savePanelWidth(storage, panel, follow(event.clientX));
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop, { once: true });
    });
    edge.addEventListener("dblclick", () => {
      mainArea.style.removeProperty(variable);
      forgetPanelWidth(storage, panel);
    });
    element.append(edge);
  }
}
