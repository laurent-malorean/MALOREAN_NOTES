// Essai de l'application réelle (fiche 0054) : la fenêtre de recherche dans la vraie fenêtre du Mac, en thème
// sombre, sur un espace de travail de plusieurs centaines de notes (fiche 0051 : elle s'écrasait à hauteur zéro).
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { type Env, type Rect, find, findAll, rectOf, searchFolder } from "./env";

const WAIT = 120_000;
const QUERY = "richesse";
const TALL_SHARE = 0.6;
const MODEL = "e5-small";

/** Tape `text` dans le champ du haut, comme au clavier : une saisie à chaque changement. */
function typeInField(text: string): HTMLInputElement {
  const field = find<HTMLInputElement>(".search-field");
  if (field === null) throw new Error("le champ de recherche est absent");
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return field;
}

/** L'espace de travail de recherche ouvert, son sens calculé quand le modèle est là. */
async function searchWorkspace(env: Env, trial: Trial): Promise<void> {
  const { bridge } = env;
  const info = await bridge.addWorkspace("recherche", searchFolder(env));
  await env.showWorkspace(info);
  const overview = await bridge.meaningOverview();
  const present = overview.models.some((m) => m.model === MODEL && m.downloaded);
  trial.measure("modèleDeSensPrésent", present);
  if (!present)
    return trial.note(
      "modèle de sens absent de l'espace de l'essai : la colonne « idées » ne peut pas répondre",
    );
  await bridge.chooseMeaningModel(MODEL);
  await bridge.rebuildMeaning();
  const done = await until(
    "le calcul du sens",
    async () => {
      const now = await bridge.meaningOverview();
      return !now.computing && now.withVector > 0 ? now : null;
    },
    WAIT,
  ).catch(() => null);
  trial.measure("vecteursCalculés", done?.withVector ?? 0);
}

const opaque = (colour: string) =>
  !/^rgba\(.*,\s*0(\.\d+)?\)$/.test(colour) && colour !== "transparent";

/** Les points de la fenêtre qui ne lui appartiennent pas (une autre couche la recouvre). */
function covered(box: Rect): number[][] {
  const points = [
    [0.25, 0.1],
    [0.75, 0.1],
    [0.5, 0.5],
    [0.25, 0.9],
  ];
  return points.filter(([fx, fy]) => {
    const at = document.elementFromPoint(
      box.x + box.width * (fx ?? 0),
      box.y + box.height * (fy ?? 0),
    );
    return at?.closest(".search-window") === null;
  });
}

/** Ce que la fenêtre montre : hauteur, fond, place, premier plan. */
function checkWindow(trial: Trial, win: HTMLElement, field: HTMLElement): void {
  const screen = window.innerHeight;
  const box = rectOf(win);
  trial.measure("fenêtre", { ...box, écran: screen });
  trial.check(
    "la fenêtre garde sa hauteur après les résultats (plus de 60 % de l'écran)",
    box.height > screen * TALL_SHARE,
    `${Math.round(box.height)} pixels sur ${screen}`,
  );
  const style = getComputedStyle(win);
  trial.check(
    "le fond de la fenêtre est opaque",
    opaque(style.backgroundColor),
    `fond : ${style.backgroundColor}`,
  );
  const under = rectOf(field).y + rectOf(field).height;
  trial.check(
    "la fenêtre est sous le champ de recherche",
    box.y >= under - 1,
    `fenêtre à ${Math.round(box.y)}, champ jusqu'à ${Math.round(under)}`,
  );
  trial.check(
    "la fenêtre est au premier plan (elementFromPoint)",
    covered(box).length === 0,
    `points recouverts : ${JSON.stringify(covered(box))}`,
  );
}

function checkColumns(trial: Trial): void {
  const match = findAll(".match-results .search-result").length;
  const ideas = findAll(".ideas-results .search-result").length;
  trial.measure("résultats", { match, idées: ideas });
  trial.check("la colonne « match » a des résultats", match > 0, `${match} résultats`);
  const said = (find(".ideas-results")?.textContent ?? "").trim();
  trial.check(
    "la colonne « idées » a des résultats",
    ideas > 0,
    ideas > 0 ? `${ideas} résultats` : said || "colonne vide",
  );
}

/** Les résultats de chaque colonne sont rangés en sections (fiche 0093) : titres comptés, Notes en dernier. */
function checkSections(trial: Trial): void {
  for (const column of [".match-results", ".ideas-results"]) {
    const titles = findAll(`${column} .search-section-title`).map((t) => t.textContent ?? "");
    const results = findAll(`${column} .search-result`).length;
    const counted = titles.reduce((sum, t) => sum + Number(/\((\d+)\)$/.exec(t)?.[1] ?? 0), 0);
    trial.measure(`sections ${column}`, titles);
    if (results === 0) continue;
    trial.check(
      `${column} : les résultats sont en sections dont les nombres font le total`,
      titles.length > 0 && counted === results,
      `${titles.join(", ")} pour ${results} résultats`,
    );
    trial.check(
      `${column} : la section « Notes » est la dernière`,
      !titles.some((t) => t.startsWith("Notes")) || (titles.at(-1) ?? "").startsWith("Notes"),
      titles.join(", "),
    );
  }
}

async function runSearch(env: Env, trial: Trial): Promise<void> {
  await searchWorkspace(env, trial);
  document.documentElement.dataset.appearance = "dark";
  const field = typeInField(QUERY);
  const win = await until(
    "la fenêtre de recherche",
    () => find<HTMLDialogElement>(".search-window[open]"),
    WAIT,
  );
  const during = rectOf(win).height;
  const screen = window.innerHeight;
  trial.check(
    "pendant le chargement, la fenêtre a déjà sa hauteur (plus de 60 % de l'écran)",
    during > screen * TALL_SHARE,
    `${Math.round(during)} pixels sur un écran de ${screen}`,
  );
  const hasMatches = () => (findAll(".match-results .search-result").length > 0 ? true : null);
  await until("des résultats dans la colonne « match »", hasMatches, WAIT);
  const answered = () =>
    findAll(".ideas-results .search-result").length > 0 ||
    find(".ideas-results .search-notice") !== null
      ? true
      : null;
  await until("la réponse de la colonne « idées »", answered, WAIT).catch(() => null);
  checkWindow(trial, win, field);
  checkColumns(trial);
  checkSections(trial);
}

export const searchScenarios = (env: Env): Scenario[] => [
  {
    name: "Recherche : fenêtre de résultats en thème sombre, 400 notes",
    run: (t) => runSearch(env, t),
  },
];
