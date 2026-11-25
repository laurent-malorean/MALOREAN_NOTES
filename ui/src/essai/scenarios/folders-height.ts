// Essai de l'application réelle (fiche 0054) : la poignée de hauteur de la liste des dossiers, dans la
// vraie fenêtre. Ses rectangles sont mesurés (entre l'arborescence et « Récentes »), un glissé réel
// (pointerdown, pointermove, pointerup) change la hauteur de l'arborescence de la valeur du déplacement,
// les minimums tiennent aux deux bouts, un double-clic rend la hauteur par défaut, et la hauteur gardée
// se retrouve à une nouvelle ouverture de la fenêtre (une seconde liste des dossiers, montée hors écran,
// relit le stockage de la vraie fenêtre).
import { connectFoldersHandle } from "../../screens/folders-handle";
import { createLayout } from "../../screens/layout";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { centreOf, find, pointer, rectOf } from "./env";

const WAIT = 20_000;
const KEY = "malorean.folders-tree-height";
const SHIFT = 60;
/** Un déplacement qui sort de la fenêtre : la poignée s'arrête à ses bornes. */
const FAR = 5_000;

const handle = () => find<HTMLElement>(".folders-handle");
const tree = () => find<HTMLElement>(".folders-list");
const folders = () => find<HTMLElement>(".folders");
const heightOf = (element: Element | null) => (element === null ? 0 : rectOf(element).height);
const minOf = (element: Element | null) =>
  element === null ? 0 : Number.parseFloat(getComputedStyle(element).minHeight);
const near = (a: number, b: number) => Math.abs(a - b) <= 1;

/** Tire la poignée de `dy` pixels : pointerdown en son milieu, pointermove, pointerup. */
function dragBy(dy: number): void {
  const from = centreOf(rectOf(handle() as Element));
  pointer(handle() as Element, "pointerdown", from);
  pointer(document, "pointermove", { x: from.x, y: from.y + dy });
  pointer(document, "pointerup", { x: from.x, y: from.y + dy });
}

/** La poignée est visible, entre l'arborescence et « Récentes », dans la liste des dossiers, et reçoit le pointeur. */
function checkPlace(trial: Trial): void {
  const line = handle();
  const recent = find("[data-recent]");
  if (line === null || tree() === null || recent === null || folders() === null) {
    return trial.check("la poignée est dans la liste des dossiers", false);
  }
  const box = rectOf(line);
  trial.measure("poignéeDeHauteur", box);
  trial.check("la poignée a une surface", box.width > 0 && box.height > 0, JSON.stringify(box));
  const above = rectOf(tree() as Element);
  const below = rectOf(recent);
  trial.check(
    "la poignée est entre l'arborescence et « Récentes »",
    box.y >= above.y + above.height - 1 && box.y + box.height <= below.y + 0.3 * 16 + 1,
    `arborescence jusqu'à ${Math.round(above.y + above.height)}, poignée ${Math.round(box.y)}, Récentes à ${Math.round(below.y)}`,
  );
  const at = centreOf(box);
  const hit = document.elementFromPoint(at.x, at.y);
  trial.check("la poignée reçoit le pointeur (elementFromPoint)", hit === line);
  trial.check(
    "le curseur de la poignée est vertical",
    getComputedStyle(line).cursor === "row-resize",
    getComputedStyle(line).cursor,
  );
}

/** Un glissé change la hauteur de l'arborescence de la valeur du déplacement. */
function checkDrag(trial: Trial, first: number): void {
  const room = first - minOf(tree());
  const dy = room > 2 * SHIFT ? -SHIFT : SHIFT;
  dragBy(dy);
  const now = heightOf(tree());
  trial.check(
    `un glissé de ${dy} px change la hauteur de l'arborescence de ${dy} px`,
    near(now, first + dy),
    `avant ${Math.round(first)}, après ${Math.round(now)}`,
  );
  trial.check(
    "la hauteur est gardée",
    localStorage.getItem(KEY) === String(Math.round(now)),
    String(localStorage.getItem(KEY)),
  );
}

/** Aux deux bouts, chaque zone garde son minimum et le pied ne bouge pas. */
function checkBounds(trial: Trial): void {
  const footer = rectOf(find(".side-panel-footer") as Element).y;
  dragBy(-FAR);
  trial.check(
    "tirée tout en haut, l'arborescence garde son minimum",
    near(heightOf(tree()), minOf(tree())),
    `${Math.round(heightOf(tree()))} px pour un minimum de ${Math.round(minOf(tree()))}`,
  );
  dragBy(FAR);
  const tags = find(".tags-list");
  const recent = rectOf(find("[data-recent]") as Element);
  const lowest = tags !== null && !tags.hasAttribute("hidden") ? tags : null;
  trial.check(
    "tirée tout en bas, « Récentes » reste au-dessus du pied",
    recent.height > 0 && recent.y + recent.height <= footer + 1,
    `Récentes jusqu'à ${Math.round(recent.y + recent.height)}, pied à ${Math.round(footer)}`,
  );
  trial.check(
    "tirée tout en bas, le bloc des étiquettes garde son minimum",
    lowest === null || near(heightOf(lowest), minOf(lowest)),
    lowest === null ? "pas d'étiquette" : `${Math.round(heightOf(lowest))} px`,
  );
  trial.check(
    "le pied ne bouge pas",
    near(rectOf(find(".side-panel-footer") as Element).y, footer),
  );
}

/** L'écart entre la hauteur gardée et celle qu'une seconde liste des dossiers, montée hors écran, retrouve. */
function reopenedGap(stored: number): number {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:260px;height:${heightOf(folders())}px`;
  document.body.append(host);
  try {
    const layout = createLayout(host);
    layout.mainArea.hidden = false;
    connectFoldersHandle(layout, localStorage);
    return heightOf(layout.foldersList) - stored;
  } finally {
    host.remove();
  }
}

async function runHandle(trial: Trial): Promise<void> {
  await until("la poignée de hauteur", () => handle(), WAIT);
  checkPlace(trial);
  const first = heightOf(tree());
  checkDrag(trial, first);
  const gap = reopenedGap(Number(localStorage.getItem(KEY)));
  trial.check(
    "à une nouvelle ouverture, la hauteur gardée est retrouvée",
    Math.abs(gap) <= 1,
    `écart de ${Math.round(gap)} px`,
  );
  checkBounds(trial);
  handle()?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  trial.check(
    "un double-clic rend la hauteur par défaut",
    near(heightOf(tree()), first) && localStorage.getItem(KEY) === null,
    `avant ${Math.round(first)}, après ${Math.round(heightOf(tree()))}`,
  );
}

export const foldersHeightScenarios = (): Scenario[] => [
  {
    name: "Hauteur de l'arborescence des dossiers : poignée, glissé, minimums, double-clic, mémoire",
    run: runHandle,
  },
];
