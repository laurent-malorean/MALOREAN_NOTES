// Essai de l'application réelle (fiche 0054, fiches 0064 et 0072) : la bande du haut dans la vraie fenêtre. Les trois blocs
// d'icônes (mise en forme, copies, affichage) et le champ de recherche sont sur une seule ligne, rangés de gauche
// à droite sans se chevaucher ; chaque icône reçoit le pointeur ; quand la place de la zone du milieu manque
// (colonne Claude Code ouverte, bande resserrée), deux lignes propres : mise en forme et copies, puis affichage et
// recherche qui prend toute la largeur restante ; rien ne déborde. Chaque ligne est centrée dans la zone de
// l'éditeur (à droite de la réserve des boutons de fenêtre du Mac quand les panneaux sont cachés), colonne Claude
// Code ouverte ou non (fiches 0092 et 0098) ; la bande est unique, aucun bouton ne passe sous la réserve gauche.
import type { Scenario, Trial } from "../runner";
import { type Rect, centreOf, find, findAll, rectOf } from "./env";

const NAMES = ["Focus", "Plan", "Machine à écrire", "Plein écran", "Claude"];
/** La largeur utile à partir de laquelle la bande tient sur une ligne : 44,1 rem. */
const SWITCH_WIDTH = 44.1 * 16;
/** La largeur de la mise en forme et des copies côte à côte (première ligne). */
const FIRST_ROW_WIDTH = 423;
/** Le minimum du champ de recherche : 6 rem. */
const SEARCH_MINIMUM = 96;
const ROOT_REM = 16;
const GAP = 0.4 * ROOT_REM;
/** Le temps que la fenêtre se remette en page après avoir caché les panneaux. */
const SETTLE_MS = 300;
/** Écart toléré entre les milieux de deux éléments d'une même ligne. */
const SAME_ROW = 2;

const strip = () => find<HTMLElement>(".editor-tools");

/** Les marges gauche et droite de la bande des outils : celle de gauche contient la réserve quand les panneaux sont cachés. */
function padding(): number {
  const row = strip();
  if (row === null) return 0;
  const style = getComputedStyle(row);
  return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}
const part = (selector: string) => find<HTMLElement>(selector);

interface Parts {
  readonly format: Rect;
  readonly copy: Rect;
  readonly display: Rect;
  readonly search: Rect;
}

function partsOf(): Parts | null {
  const found = [
    ".format-bar > :nth-child(1)",
    ".format-bar > :nth-child(2)",
    ".display-tools",
    ".search-field",
  ].map(part);
  if (found.some((element) => element === null)) return null;
  const [format, copy, display, search] = found.map((element) => rectOf(element as HTMLElement));
  return {
    format: format as Rect,
    copy: copy as Rect,
    display: display as Rect,
    search: search as Rect,
  };
}

const middle = (rect: Rect) => rect.y + rect.height / 2;
const apart = (a: Rect, b: Rect) =>
  a.x + a.width <= b.x + 0.5 ||
  b.x + b.width <= a.x + 0.5 ||
  a.y + a.height <= b.y + 0.5 ||
  b.y + b.height <= a.y + 0.5;

/** Les points de la fenêtre où le pointeur n'atteint pas l'élément : une autre couche le recouvre. */
function pointable(element: HTMLElement | null): boolean {
  if (element === null) return false;
  const rect = rectOf(element);
  const at = centreOf(rect);
  const hit = document.elementFromPoint(at.x, at.y);
  return rect.width > 0 && rect.height > 0 && hit !== null && element.contains(hit);
}

const named = (name: string) =>
  find<HTMLButtonElement>(`.display-tools button[aria-label="${name}"]`);

/** Le bouton des panneaux latéraux : dans la réserve gauche de la bande du haut, plus dans le bloc d'affichage. */
const sidePanels = () =>
  find<HTMLButtonElement>('.window-bar button[aria-label="Panneaux latéraux"]');

function checkNames(trial: Trial): void {
  const missing = NAMES.filter((name) => named(name) === null);
  trial.check("les cinq boutons d'affichage ont leur nom", missing.length === 0, missing.join());
  const withText = findAll<HTMLElement>(".display-tools button").filter(
    (button) => (button.textContent ?? "").trim() !== "" || button.querySelector("svg") === null,
  );
  trial.check("chaque bouton est une icône seule", withText.length === 0, String(withText.length));
}

function checkPointer(trial: Trial, when: string): void {
  const buttons = [
    ...findAll<HTMLElement>(".format-bar button"),
    ...findAll<HTMLElement>(".display-tools button"),
  ];
  const blind = buttons.filter((button) => !pointable(button));
  trial.check(
    `${when} : chaque icône reçoit le pointeur (${buttons.length} icônes)`,
    buttons.length === 17 && blind.length === 0,
    blind.map((button) => button.getAttribute("aria-label")).join(),
  );
}

/** Une seule ligne : mêmes milieux, de gauche à droite, sans chevauchement, rien qui déborde. */
function checkOneRow(trial: Trial, when: string): Parts | null {
  const parts = partsOf();
  const row = strip();
  if (parts === null || row === null) {
    trial.check(`${when} : la bande est présente`, false);
    return null;
  }
  const { format, copy, display, search } = parts;
  const rects = [format, copy, display, search];
  trial.measure(
    `bande${when}`,
    rects.map((r) => [r.x, r.y, r.width, r.height].map(Math.round)),
  );
  trial.check(
    `${when} : les trois blocs et la recherche sont sur une seule ligne`,
    rects.every((rect) => Math.abs(middle(rect) - middle(format)) < SAME_ROW),
    JSON.stringify(rects.map((r) => Math.round(middle(r)))),
  );
  trial.check(
    `${when} : ils se suivent de gauche à droite sans se chevaucher`,
    rects.every(
      (rect, i) => i === 0 || (rects[i - 1] as Rect).x + (rects[i - 1] as Rect).width <= rect.x,
    ),
  );
  trial.check(
    `${when} : rien ne déborde`,
    row.scrollWidth <= row.clientWidth,
    String(row.scrollWidth - row.clientWidth),
  );
  return parts;
}

/** La bande resserrée à `width` points, le temps de la mesure ; la place des autres éléments de la fenêtre ne compte plus. */
function squeezed<T>(width: number, measure: () => T): T {
  const row = strip();
  if (row === null) return measure();
  const before = row.style.width;
  row.style.width = `${width}px`;
  try {
    return measure();
  } finally {
    row.style.width = before;
  }
}

function checkSqueezed(trial: Trial, blocks: number): void {
  // Un point de plus : le seuil de bascule laisse un demi-point de marge sur la largeur nécessaire.
  const exact = Math.ceil(blocks + GAP + SEARCH_MINIMUM + padding()) + 1;
  squeezed(exact, () => {
    const parts = checkOneRow(trial, "recherche au minimum");
    trial.check(
      "recherche au minimum : le champ est réduit à son minimum (à 2 points près), pas au-dessous",
      parts !== null &&
        parts.search.width >= SEARCH_MINIMUM - 0.5 &&
        parts.search.width <= SEARCH_MINIMUM + 2,
      String(parts?.search.width),
    );
  });
  squeezed(exact - 40, () => {
    checkTwoRows(trial, "place manquante");
    checkPointer(trial, "place manquante");
  });
}

/** La largeur utile de la bande (sans ses marges). */
function innerWidth(row: HTMLElement): number {
  const style = getComputedStyle(row);
  return row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Deux lignes propres : mise en forme et copies ; affichage et recherche, qui va jusqu'au bord ; rien ne déborde. */
function checkTwoRows(trial: Trial, when: string): void {
  const parts = partsOf();
  const row = strip();
  if (parts === null || row === null) return trial.check(`${when} : la bande est présente`, false);
  const { format, copy, display, search } = parts;
  const edge = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
  trial.measure(
    `deux lignes ${when}`,
    [format, copy, display, search].map((r) => [r.x, r.y, r.width, r.height].map(Math.round)),
  );
  trial.check(
    `${when} : mise en forme et copies sur la première ligne`,
    Math.abs(middle(copy) - middle(format)) < SAME_ROW && format.x + format.width <= copy.x,
  );
  trial.check(
    `${when} : affichage et recherche sur la seconde ligne, sous la première`,
    Math.abs(middle(search) - middle(display)) < SAME_ROW &&
      display.y >= format.y + format.height - 1 &&
      display.x + display.width <= search.x,
    JSON.stringify([format, display].map((r) => Math.round(r.y))),
  );
  trial.check(
    `${when} : la recherche prend toute la largeur restante, sans tronquer son minimum`,
    Math.abs(search.x + search.width - edge) < 1 && search.width >= SEARCH_MINIMUM - 0.5,
    String(Math.round(search.width)),
  );
  trial.check(
    `${when} : rien ne déborde ni ne se chevauche`,
    row.scrollWidth <= row.clientWidth &&
      [format, copy, display, search].every((rect, i, all) =>
        all.slice(i + 1).every((other) => apart(rect, other)),
      ),
    String(row.scrollWidth - row.clientWidth),
  );
}

/** Zone du milieu plus étroite que la mise en forme et les copies côte à côte : rien ne déborde, la recherche est seule, pleine largeur. */
function checkNarrowest(trial: Trial, when: string): void {
  const parts = partsOf();
  const row = strip();
  if (parts === null || row === null) return trial.check(`${when} : la bande est présente`, false);
  const { display, search } = parts;
  const edge = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
  trial.check(
    `${when} : rien ne déborde`,
    row.scrollWidth <= row.clientWidth,
    String(row.scrollWidth - row.clientWidth),
  );
  trial.check(
    `${when} : la recherche, entière, est sous les icônes d'affichage`,
    search.y >= display.y + display.height - 1 &&
      search.width >= SEARCH_MINIMUM - 0.5 &&
      Math.abs(search.x + search.width - edge) < 1,
    JSON.stringify([display, search].map((r) => Math.round(r.y))),
  );
}

/** La disposition suit la largeur réelle de la zone du milieu : une ligne au-dessus du seuil, deux dessous, sobre en dessous de la place des deux blocs. */
function checkLayoutFollowsWidth(trial: Trial, when: string): void {
  const row = strip();
  const parts = partsOf();
  if (row === null || parts === null) return trial.check(`${when} : la bande est présente`, false);
  const width = innerWidth(row);
  trial.measure(`largeur de la bande ${when}`, [Math.round(width)]);
  if (width < FIRST_ROW_WIDTH)
    return checkNarrowest(trial, `${when} (${Math.round(width)} points)`);
  const twoRows = parts.display.y > parts.format.y + parts.format.height - 1;
  trial.check(
    `${when} : ${twoRows ? "deux lignes" : "une ligne"} pour ${Math.round(width)} points de bande`,
    twoRows === width < SWITCH_WIDTH,
  );
  if (twoRows) checkTwoRows(trial, when);
  else checkOneRow(trial, when);
}

/** Écart toléré entre le milieu d'une ligne de la bande et celui de la zone de l'éditeur (fiche 0092). */
const CENTRE_TOLERANCE = 1;

/** Chaque ligne de la bande (ses quatre éléments regroupés par leur milieu vertical) est centrée dans la zone de l'éditeur. */
function checkCentred(trial: Trial, when: string): void {
  const parts = partsOf();
  const row = strip();
  const editor = find<HTMLElement>(".editor");
  const reserve = find<HTMLElement>(".window-left");
  if (parts === null || row === null || editor === null || reserve === null) {
    return trial.check(`${when} : la bande et la zone de l'éditeur sont présentes`, false);
  }
  // La zone de l'éditeur, sans la réserve gauche quand elle la recouvre (panneaux cachés).
  const left = Math.max(rectOf(editor).x, rectOf(reserve).x + rectOf(reserve).width);
  const area = { x: left, width: rectOf(editor).x + rectOf(editor).width - left };
  const lines: { left: number; right: number; middle: number }[] = [];
  for (const rect of [parts.format, parts.copy, parts.display, parts.search]) {
    const line = lines.find((l) => Math.abs(l.middle - middle(rect)) < SAME_ROW);
    if (line) {
      line.left = Math.min(line.left, rect.x);
      line.right = Math.max(line.right, rect.x + rect.width);
    } else lines.push({ left: rect.x, right: rect.x + rect.width, middle: middle(rect) });
  }
  const offsets = lines.map((l) => (l.left + l.right) / 2 - (area.x + area.width / 2));
  trial.measure(
    `centrage ${when}`,
    offsets.map((offset) => Math.round(offset * 100) / 100),
  );
  trial.check(
    `${when} : chaque ligne de la bande est centrée dans la zone de l'éditeur (${lines.length} ligne(s))`,
    offsets.every((offset) => Math.abs(offset) <= CENTRE_TOLERANCE),
    JSON.stringify(offsets.map(Math.round)),
  );
  trial.check(
    `${when} : aucun bouton coupé hors de la zone de l'éditeur`,
    findAll<HTMLElement>(".format-bar button, .display-tools button, .search-field").every(
      (element) => {
        const rect = rectOf(element);
        return rect.x >= area.x - 0.5 && rect.x + rect.width <= area.x + area.width + 0.5;
      },
    ),
  );
}

/** Ouvre la colonne Claude Code, mesure la bande dans la vraie fenêtre, la ferme. */
async function checkWithClaudeColumn(trial: Trial): Promise<void> {
  const claude = named("Claude");
  const column = find<HTMLElement>(".claude-column");
  if (claude === null || column === null)
    return trial.check("la colonne Claude Code existe", false);
  const open = !column.hidden;
  if (!open) claude.click();
  try {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    trial.check("la colonne Claude Code est ouverte", !column.hidden);
    checkLayoutFollowsWidth(trial, "colonne Claude Code ouverte");
    checkCentred(trial, "colonne Claude Code ouverte");
    checkPointer(trial, "colonne Claude Code ouverte");
    // Bande resserrée comme le ferait une colonne de gauche large : deux lignes, quelle que soit la fenêtre.
    squeezed(SWITCH_WIDTH - 60 + padding(), () =>
      checkLayoutFollowsWidth(trial, "colonne Claude Code ouverte, bande étroite"),
    );
  } finally {
    if (!open) named("Claude")?.click();
  }
}

export function displayToolsScenarios(): Scenario[] {
  return [
    {
      name: "Bande du haut : trois blocs d'icônes et la recherche",
      async run(trial) {
        checkNames(trial);
        // Panneaux cachés, le temps de la mesure : la bande a alors toute la largeur de la fenêtre (900 points au moins).
        const panels = sidePanels();
        const hidden = panels?.getAttribute("aria-pressed") === "true";
        if (hidden) panels?.click();
        try {
          await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
          const parts = checkOneRow(trial, "fenêtre réelle");
          checkCentred(trial, "fenêtre réelle, panneaux cachés");
          checkPointer(trial, "fenêtre réelle");
          if (parts === null) return;
          checkSqueezed(trial, parts.display.x + parts.display.width - parts.format.x);
        } finally {
          if (hidden) sidePanels()?.click();
        }
        if (hidden) {
          // Panneaux montrés : la zone est plus étroite, la bande reste centrée dans ce qui reste.
          await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
          checkCentred(trial, "fenêtre réelle, panneaux montrés");
        }
      },
    },
    {
      name: "Bande du haut : colonne Claude Code ouverte",
      run: checkWithClaudeColumn,
    },
  ];
}
