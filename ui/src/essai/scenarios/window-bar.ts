// Essai de l'application réelle (fiche 0054, fiche 0085) : la barre de la fenêtre et le bouton des panneaux
// latéraux dans la vraie fenêtre. La barre est tout en haut, sur toute la largeur, sous elle la fenêtre commence ;
// le bouton est à droite de la place des trois boutons de fenêtre du Mac, grand de 28 points au moins, reçoit le
// pointeur ; un clic cache les deux listes, le bouton reste à la même place et visible ; un second clic les rend.
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import { type Rect, centreOf, find, rectOf } from "./env";

/** La place laissée aux trois boutons de fenêtre du Mac : 78 points (`--window-bar-inset`). */
const TRAFFIC_LIGHTS = 78;
/** La plus petite cible de clic : 28 points. */
const MINIMUM_TARGET = 28;
/** Le temps que la fenêtre se remette en page après avoir caché ou montré les panneaux. */
const SETTLE_MS = 300;
const WAIT = 5_000;

const bar = () => find<HTMLElement>(".window-bar");
const button = () => find<HTMLButtonElement>('.window-bar button[aria-label="Panneaux latéraux"]');
const folders = () => find<HTMLElement>(".folders");
const notes = () => find<HTMLElement>(".notes-panel");

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
  const main = find<HTMLElement>(".main-area");
  if (strip === null || main === null) return trial.check("la barre de la fenêtre existe", false);
  const box = rectOf(strip);
  trial.measure("barreDeLaFenêtre", box);
  trial.check(
    "la barre est tout en haut, sur toute la largeur",
    box.x === 0 && box.y === 0 && Math.abs(box.width - window.innerWidth) < 1,
    JSON.stringify(box),
  );
  trial.check(
    "on la saisit pour déplacer la fenêtre",
    strip.hasAttribute("data-tauri-drag-region"),
  );
  const below = rectOf(main).y;
  trial.check(
    "la fenêtre commence sous la barre",
    below >= box.y + box.height - 1,
    `barre jusqu'à ${Math.round(box.y + box.height)}, fenêtre à ${Math.round(below)}`,
  );
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
      name: "Barre de la fenêtre : bouton des panneaux latéraux",
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
