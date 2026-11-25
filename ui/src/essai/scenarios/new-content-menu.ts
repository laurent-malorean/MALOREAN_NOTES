// Essai de l'application réelle (fiches 0054 et 0067) : le menu de création, dans la vraie fenêtre.
// Le chevron est visible à côté du « + », dans l'en-tête de la colonne des notes ; un clic l'ouvre,
// entièrement dans la fenêtre, chaque entrée reçoit le pointeur ; « Canvas » crée un fichier
// `.canvas` sur le disque ; un appui maintenu 600 ms sur le « + » ouvre le même menu sans créer de note.
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import {
  type Env,
  type Rect,
  centreOf,
  find,
  findAll,
  notesFolder,
  pointer,
  readDisk,
  rectOf,
} from "./env";

const WAIT = 20_000;
/** L'appui maintenu de l'essai, plus long que celui de l'application (500 ms). */
const HELD_MS = 600;
const ENTRIES = [
  "Note",
  "Note depuis un modèle",
  "Cahier de recherche",
  "Carte mentale",
  "Canvas",
  "CRM",
];

const menu = () => find<HTMLElement>(".context-menu");
const entries = () => findAll<HTMLButtonElement>(".context-menu button");
const label = (entry: Element) => entry.querySelector(".context-menu-label")?.textContent ?? "";

/** Le rectangle est à l'écran, avec une surface, et le pointeur atteint l'élément en son centre. */
function reachable(element: Element | null): boolean {
  if (element === null) return false;
  const rect = rectOf(element);
  const at = centreOf(rect);
  const hit = document.elementFromPoint(at.x, at.y);
  return rect.width > 0 && rect.height > 0 && hit !== null && element.contains(hit);
}

/** `inner` tient dans `outer`. */
const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y >= outer.y &&
  inner.y + inner.height <= outer.y + outer.height;

/** Le chevron, à droite du « + », sur la même ligne, dans l'en-tête de la colonne des notes. */
function checkChevron(trial: Trial): void {
  const plus = find<HTMLElement>("[data-new]");
  const chevron = find<HTMLElement>("[data-new-menu]");
  const header = find<HTMLElement>(".notes-panel .side-panel-header");
  if (plus === null || chevron === null || header === null) throw new Error("boutons absents");
  const [p, c, h] = [rectOf(plus), rectOf(chevron), rectOf(header)];
  trial.measure("menuDeCréation", { plus: p, chevron: c, enTête: h });
  const sameLine = Math.abs(centreOf(c).y - centreOf(p).y) <= 2;
  trial.check(
    "le chevron est visible, à droite du « + », dans l'en-tête de la colonne des notes",
    c.width > 0 && c.height > 0 && c.x >= p.x + p.width - 1 && sameLine && within(c, h),
    JSON.stringify({ p, c, h }),
  );
  trial.check("le chevron reçoit le pointeur", reachable(chevron), "");
  trial.check(
    "le chevron a son nom accessible « Nouveau contenu »",
    chevron.getAttribute("aria-label") === "Nouveau contenu",
    "",
  );
}

/** Le menu est tenu entier dans la fenêtre, a ses six entrées dans l'ordre, et chacune reçoit le pointeur. */
function checkMenu(trial: Trial, where: string): void {
  const shown = menu();
  const rect = shown === null ? null : rectOf(shown);
  trial.check(
    `${where} : le menu est entièrement dans la fenêtre`,
    rect !== null &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= window.innerWidth &&
      rect.y + rect.height <= window.innerHeight,
    JSON.stringify(rect),
  );
  trial.check(
    `${where} : les six entrées, dans l'ordre`,
    entries().map(label).join("|") === ENTRIES.join("|"),
    entries().map(label).join("|"),
  );
  const blocked = entries().filter((entry) => !reachable(entry));
  trial.check(
    `${where} : chaque entrée reçoit le pointeur`,
    blocked.length === 0,
    blocked.map(label).join(),
  );
}

/** Ferme le menu par Échap, comme au clavier. */
async function closeMenu(trial: Trial, where: string): Promise<void> {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until("le menu fermé", () => (menu() === null ? true : null), WAIT);
  trial.check(`${where} : Échap ferme le menu`, menu() === null, "");
}

async function chevronScenario(env: Env, trial: Trial): Promise<void> {
  // Le dossier affiché est la racine : le canvas y sera créé.
  find<HTMLElement>('.folder-item[data-path=""]')?.click();
  await until("la racine affichée", () => find('.folder-item.selected[data-path=""]'), WAIT);
  checkChevron(trial);
  find<HTMLElement>("[data-new-menu]")?.click();
  await until("le menu de création", () => menu(), WAIT);
  checkMenu(trial, "chevron");
  const canvas = entries().find((entry) => label(entry) === "Canvas");
  if (canvas === undefined) throw new Error("entrée « Canvas » absente");
  canvas.click();
  const input = await until("le nom du canvas", () => find<HTMLInputElement>(".name-prompt-input"));
  input.value = "Essai menu";
  input.form?.requestSubmit();
  const file = `${notesFolder(env)}/essai-menu.canvas`;
  const written = await until("le canvas sur le disque", () => readDisk(file), WAIT).catch(
    () => null,
  );
  trial.check("« Canvas » du menu crée un fichier .canvas sur le disque", written !== null, file);
}

async function longPressScenario(env: Env, trial: Trial): Promise<void> {
  const plus = find<HTMLElement>("[data-new]");
  if (plus === null) throw new Error("« + » absent");
  const before = (await env.bridge.listAllNotes()).length;
  const at = centreOf(rectOf(plus));
  pointer(plus, "pointerdown", at);
  await pause(HELD_MS);
  trial.check("maintenu 600 ms, le « + » ouvre le menu", menu() !== null, "");
  checkMenu(trial, "appui prolongé");
  pointer(plus, "pointerup", at);
  plus.click();
  await pause(500);
  const after = (await env.bridge.listAllNotes()).length;
  trial.check("l'appui prolongé ne crée aucune note", after === before, `${before} -> ${after}`);
  trial.check("le menu reste ouvert au relâchement", menu() !== null, "");
  await closeMenu(trial, "appui prolongé");
}

export function newContentMenuScenarios(env: Env): Scenario[] {
  return [
    { name: "menu de création : chevron, entrées, canvas", run: (t) => chevronScenario(env, t) },
    { name: "menu de création : appui prolongé", run: (t) => longPressScenario(env, t) },
  ];
}
