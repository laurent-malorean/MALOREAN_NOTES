// Essai de l'application réelle (fiche 0054, fiches 0085 et 0098) : la bande du haut unique et le bouton des
// panneaux latéraux dans la vraie fenêtre. La bande est tout en haut, sur toute la largeur, seule : les outils y sont,
// les listes et les colonnes commencent dessous ; le bouton est à droite de la place des trois boutons de fenêtre
// du Mac, centré sur la première ligne de la bande, grand de 28 points au moins, reçoit le pointeur ; un clic cache
// les deux listes, le bouton reste à la même place et visible ; un second clic les rend. Le centrage des boutons de
// fenêtre du Mac eux-mêmes ne se mesure pas dans la page : il se voit à l'œil.
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import { type Rect, centreOf, find, findAll, rectOf } from "./env";

/** La place laissée aux trois boutons de fenêtre du Mac : 78 points (`--window-bar-inset`). */
const TRAFFIC_LIGHTS = 78;
/** La plus petite cible de clic : 28 points. */
const MINIMUM_TARGET = 28;
/** Le temps que la fenêtre se remette en page après avoir caché ou montré les panneaux. */
const SETTLE_MS = 300;
const WAIT = 5_000;

/** Une bande d'une ligne : une pilule (37,2 points), deux marges de 8 points et la ligne de séparation. */
const MAXIMUM_HEIGHT = 56;
/** Deux lignes d'outils : la deuxième ligne ajoute une pilule (37,2 points) et un écart de 6,4 points, soit environ 98 points au total. */
const TWO_ROWS_MAXIMUM_HEIGHT = 100;
/** La largeur utile à partir de laquelle les outils tiennent sur une ligne : 45,15 rem (fiches 0072 et 0098). */
const SINGLE_ROW_WIDTH = 45.15 * 16;

const bar = () => find<HTMLElement>(".window-bar");
const button = () => find<HTMLButtonElement>('.window-bar button[aria-label="Panneaux latéraux"]');
const folders = () => find<HTMLElement>(".folders");
const notes = () => find<HTMLElement>(".notes-panel");

/** La largeur utile des outils (la zone de l'éditeur sans ses marges) : c'est elle qui décide d'une ou de deux lignes. */
function toolsWidth(): number {
  const tools = find<HTMLElement>(".editor-tools");
  if (tools === null) return 0;
  const style = getComputedStyle(tools);
  return tools.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/**
 * La bande tient sur une ligne d'outils quand la zone de l'éditeur a la place (722 points) : sinon deux lignes
 * (fiche 0072), qui ne dépassent jamais deux lignes d'outils. À 1100 points avec les deux listes montrées, la zone
 * n'a que 620 points : deux lignes, voulues ; les listes cachées, elle en a plus de 900 : une ligne.
 */
function checkHeight(trial: Trial, when: string): void {
  const strip = bar();
  if (strip === null) return trial.check(`${when} : la bande existe`, false);
  const height = rectOf(strip).height;
  const width = toolsWidth();
  const oneRow = width >= SINGLE_ROW_WIDTH;
  trial.check(
    oneRow
      ? `${when} : ${Math.round(width)} points utiles, la bande tient sur une ligne d'outils (${MAXIMUM_HEIGHT} points au plus)`
      : `${when} : ${Math.round(width)} points utiles, la bande tient sur deux lignes d'outils (${TWO_ROWS_MAXIMUM_HEIGHT} points au plus)`,
    height <= (oneRow ? MAXIMUM_HEIGHT : TWO_ROWS_MAXIMUM_HEIGHT),
    String(Math.round(height)),
  );
}

const shown = (element: HTMLElement | null) =>
  element !== null && rectOf(element).width > 0 && rectOf(element).height > 0;

const same = (a: Rect, b: Rect) =>
  [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].every((gap) => Math.abs(gap) < 1);

/** Le pointeur atteint-il le bouton (aucune autre couche ne le recouvre) ? */
function pointable(element: HTMLElement): boolean {
  const at = centreOf(rectOf(element));
  const hit = document.elementFromPoint(at.x, at.y);
  return hit !== null && element.contains(hit);
}

function checkBar(trial: Trial): void {
  const strip = bar();
  const columns = find<HTMLElement>(".columns");
  if (strip === null || columns === null) return trial.check("la bande du haut existe", false);
  const box = rectOf(strip);
  trial.measure("bandeDuHaut", box);
  trial.check(
    "la bande est tout en haut, sur toute la largeur",
    box.x === 0 && box.y === 0 && Math.abs(box.width - window.innerWidth) < 1,
    JSON.stringify(box),
  );
  trial.check(
    "la bande est seule : les outils et le bouton des panneaux y sont, aucune autre barre",
    findAll<HTMLElement>(".window-bar").length === 1 &&
      strip.querySelector(".format-bar") !== null &&
      strip.querySelector(".search-field") !== null &&
      find<HTMLElement>(".editor .editor-tools") === null,
  );
  trial.check(
    "on la saisit pour déplacer la fenêtre (elle et ses vides)",
    strip.hasAttribute("data-tauri-drag-region") &&
      strip.querySelector(".window-left")?.hasAttribute("data-tauri-drag-region") === true,
  );
  trial.check(
    "les listes et les colonnes commencent sous la bande",
    [folders(), notes(), columns].every(
      (element) => element !== null && rectOf(element).y >= box.y + box.height - 1,
    ),
    `bande jusqu'à ${Math.round(box.y + box.height)}, colonnes à ${Math.round(rectOf(columns).y)}`,
  );
  checkHeight(trial, "panneaux montrés");
}

function checkButton(trial: Trial, element: HTMLButtonElement): void {
  const box = rectOf(element);
  trial.measure("boutonDesPanneaux", box);
  trial.check(
    "le bouton est à droite des boutons de fenêtre du Mac",
    box.x >= TRAFFIC_LIGHTS - 1 && box.x < TRAFFIC_LIGHTS + 20,
    `x = ${Math.round(box.x)}`,
  );
  trial.check(
    `le bouton fait ${MINIMUM_TARGET} points au moins`,
    box.width >= MINIMUM_TARGET && box.height >= MINIMUM_TARGET,
    `${Math.round(box.width)} sur ${Math.round(box.height)}`,
  );
  const pill = find<HTMLElement>(".format-bar > :nth-child(1)");
  trial.check(
    "le bouton est centré sur la première ligne de la bande",
    pill !== null && Math.abs(centreOf(box).y - centreOf(rectOf(pill)).y) < 1,
    JSON.stringify([centreOf(box).y, pill === null ? null : centreOf(rectOf(pill)).y]),
  );
  trial.check("le bouton reçoit le pointeur", pointable(element));
  trial.check(
    "le bouton est une icône seule, avec la bulle d'aide du raccourci",
    (element.textContent ?? "").trim() === "" &&
      element.querySelector("svg") !== null &&
      element.title === "Panneaux latéraux (Cmd+0)",
    element.title,
  );
}

async function settle(): Promise<void> {
  await pause(SETTLE_MS);
}

/** Un clic cache les deux listes ; le bouton reste visible, à la même place, et dit l'état. */
async function checkHide(trial: Trial, element: HTMLButtonElement): Promise<void> {
  const before = rectOf(element);
  const iconShown = element.innerHTML;
  element.click();
  await settle();
  trial.check(
    "un clic cache la liste des dossiers et celle des notes",
    !shown(folders()) && !shown(notes()),
  );
  const after = button();
  trial.check(
    "panneaux cachés, le bouton reste visible, à la même place, et reçoit le pointeur",
    after !== null && same(rectOf(after), before) && pointable(after),
    JSON.stringify(after === null ? null : rectOf(after)),
  );
  trial.check(
    "panneaux cachés, le bouton le dit (non enfoncé, autre icône)",
    after?.getAttribute("aria-pressed") === "false" && after.innerHTML !== iconShown,
  );
  // Les listes cachées, la zone de l'éditeur s'élargit : la bande tient sur une ligne d'outils.
  trial.check(
    "panneaux cachés, la bande tient sur une ligne d'outils",
    toolsWidth() >= SINGLE_ROW_WIDTH && rectOf(bar() as HTMLElement).height <= MAXIMUM_HEIGHT,
    String(Math.round(toolsWidth())),
  );
}

/** Un second clic montre de nouveau les deux listes, et le bouton retrouve son icône. */
async function checkShow(trial: Trial, iconShown: string): Promise<void> {
  button()?.click();
  await settle();
  trial.check(
    "un second clic montre de nouveau les deux listes",
    shown(folders()) && shown(notes()),
  );
  trial.check(
    "panneaux montrés, le bouton le dit (enfoncé, icône d'avant)",
    button()?.getAttribute("aria-pressed") === "true" && button()?.innerHTML === iconShown,
  );
}

export function windowBarScenarios(): Scenario[] {
  return [
    {
      name: "Bande du haut : bouton des panneaux latéraux",
      async run(trial) {
        const element = await until("le bouton des panneaux latéraux", button, WAIT);
        checkBar(trial);
        checkButton(trial, element);
        // On part des panneaux montrés, et on les rend dans l'état où on les a trouvés.
        const wasHidden = element.getAttribute("aria-pressed") === "false";
        if (wasHidden) {
          element.click();
          await settle();
        }
        try {
          const iconShown = element.innerHTML;
          await checkHide(trial, element);
          await checkShow(trial, iconShown);
        } finally {
          if (wasHidden) button()?.click();
        }
      },
    },
  ];
}
