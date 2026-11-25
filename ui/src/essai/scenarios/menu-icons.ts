// Essai de l'application réelle (fiches 0054 et 0073) : le menu d'une note, d'un dossier et d'un onglet dans la
// vraie fenêtre. Chaque choix a son icône, visible, de la couleur de son texte ; les icônes sont dans une même
// colonne, les noms au même bord ; le menu est entier dans la fenêtre et chaque choix reçoit le pointeur.
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import { type Env, centreOf, find, findAll, rectOf } from "./env";

const WAIT = 20_000;
/** Le plus petit côté d'une icône visible, en pixels. */
const MIN_ICON = 12;

const NOTE_ENTRIES = 11;
const TAB_ENTRIES = 8;
/** Le clic droit sur la racine : pas de « Placer dans la corbeille ». */
const ROOT_FOLDER_ENTRIES = 5;

const menu = () => find<HTMLElement>(".context-menu");
const entries = () => findAll<HTMLButtonElement>(".context-menu button");
const label = (entry: Element) => entry.querySelector(".context-menu-label")?.textContent ?? "";

/** Un clic droit sur l'élément, au centre de son rectangle. */
function rightClick(target: Element): void {
  const at = centreOf(rectOf(target));
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
    }),
  );
}

/** Ce qui ne va pas dans le choix : icône absente, trop petite, d'une autre couleur que le texte, lue, hors d'atteinte. */
function entryProblems(entry: HTMLButtonElement): string[] {
  const svg = entry.querySelector<SVGElement>(".context-menu-icon svg");
  if (svg === null) return [`${label(entry)} : pas d'icône`];
  const found: string[] = [];
  const rect = rectOf(svg);
  if (rect.width < MIN_ICON || rect.height < MIN_ICON)
    found.push(`${label(entry)} : icône de ${rect.width} sur ${rect.height}`);
  if (getComputedStyle(svg).stroke !== getComputedStyle(entry).color)
    found.push(`${label(entry)} : icône d'une autre couleur que le texte`);
  if (svg.getAttribute("aria-hidden") !== "true") found.push(`${label(entry)} : icône lue`);
  const at = centreOf(rectOf(entry));
  const hit = document.elementFromPoint(at.x, at.y);
  if (hit === null || !entry.contains(hit))
    found.push(`${label(entry)} : le pointeur ne l'atteint pas`);
  return found;
}

/** Le bord gauche de l'élément de chaque choix, arrondi. */
const leftEdges = (selector: string) =>
  entries().map((entry) => Math.round(rectOf(entry.querySelector(selector) as Element).x));

/** Ce que le menu ouvert a de faux : le nombre de choix, chaque choix, l'alignement des icônes et des noms. */
function problems(count: number): string[] {
  const found = entries().flatMap(entryProblems);
  if (entries().length !== count) found.push(`${entries().length} choix au lieu de ${count}`);
  const icons = new Set(leftEdges(".context-menu-icon svg"));
  const names = new Set(leftEdges(".context-menu-label"));
  if (icons.size > 1) found.push(`icônes non alignées : ${[...icons].join(", ")}`);
  if (names.size > 1) found.push(`noms non alignés : ${[...names].join(", ")}`);
  return found;
}

/** Ouvre le menu par un clic droit sur `target`, mesure les icônes, puis le ferme par Échap. */
async function checkMenu(
  trial: Trial,
  where: string,
  target: Element,
  count: number,
): Promise<void> {
  rightClick(target);
  await until(`le menu ${where}`, () => menu(), WAIT);
  const shown = rectOf(menu() as HTMLElement);
  trial.measure(`menuIcônes ${where}`, { menu: shown, icônes: entries().length });
  trial.check(
    `${where} : le menu est entièrement dans la fenêtre`,
    shown.x >= 0 &&
      shown.y >= 0 &&
      shown.x + shown.width <= window.innerWidth &&
      shown.y + shown.height <= window.innerHeight,
    JSON.stringify(shown),
  );
  const wrong = problems(count);
  trial.check(
    `${where} : chaque choix a son icône visible, de la couleur du texte, alignée`,
    wrong.length === 0,
    wrong.join(" ; "),
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(`le menu ${where} fermé`, () => (menu() === null ? true : null), WAIT);
}

async function iconsScenario(env: Env, trial: Trial): Promise<void> {
  // Une note existe dans la racine, et la racine est affichée : la liste a au moins une note.
  await env.bridge.createNote("");
  find<HTMLElement>('.folder-item[data-path=""]')?.click();
  await pause(500);
  const note = await until("une note dans la liste", () => find<HTMLElement>(".note-item"), WAIT);
  await checkMenu(trial, "menu d'une note", note, NOTE_ENTRIES);
  note.click();
  const tab = await until("l'onglet de la note", () => find<HTMLElement>('[role="tab"]'), WAIT);
  await checkMenu(trial, "menu d'un onglet", tab, TAB_ENTRIES);
  const folder = find<HTMLElement>('.folder-item[data-path=""]');
  if (folder === null) throw new Error("dossier racine absent");
  await checkMenu(trial, "menu d'un dossier", folder, ROOT_FOLDER_ENTRIES);
}

export function menuIconsScenarios(env: Env): Scenario[] {
  return [{ name: "menus du clic droit : icônes alignées", run: (t) => iconsScenario(env, t) }];
}
