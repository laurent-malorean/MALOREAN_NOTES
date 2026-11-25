// Essai de l'application réelle (fiche 0054, fiches 0064 et 0072) : la bande du haut dans la vraie fenêtre. Les trois blocs
// d'icônes (mise en forme, copies, affichage) et le champ de recherche sont sur une seule ligne, rangés de gauche
// à droite sans se chevaucher ; chaque icône reçoit le pointeur ; quand la place de la zone du milieu manque
// (colonne Claude Code ouverte, bande resserrée), deux lignes propres : mise en forme et copies, puis affichage et
// recherche qui prend toute la largeur restante ; rien ne déborde.
import type { Scenario, Trial } from "../runner";
import { type Rect, centreOf, find, findAll, rectOf } from "./env";

const NAMES = ["Focus", "Plan", "Machine à écrire", "Panneaux", "Plein écran", "Claude"];
/** La largeur utile à partir de laquelle la bande tient sur une ligne : 44,1 rem. */
const SWITCH_WIDTH = 44.1 * 16;
/** Le minimum du champ de recherche : 6 rem. */
const SEARCH_MINIMUM = 96;
const ROOT_REM = 16;
const PADDING = 2 * 0.8 * ROOT_REM;
const GAP = 0.4 * ROOT_REM;
/** Le temps que la fenêtre se remette en page après avoir caché les panneaux. */
const SETTLE_MS = 300;
/** Écart toléré entre les milieux de deux éléments d'une même ligne. */
const SAME_ROW = 2;

const strip = () => find<HTMLElement>(".editor-tools");
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

function checkNames(trial: Trial): void {
  const missing = NAMES.filter((name) => named(name) === null);
  trial.check("les six boutons d'affichage ont leur nom", missing.length === 0, missing.join());
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
  const exact = Math.ceil(blocks + GAP + SEARCH_MINIMUM + PADDING) + 1;
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

/** La disposition suit la largeur réelle de la zone du milieu : une ligne au-dessus du seuil, deux dessous. */
function checkLayoutFollowsWidth(trial: Trial, when: string): void {
  const row = strip();
  const parts = partsOf();
  if (row === null || parts === null) return trial.check(`${when} : la bande est présente`, false);
  const width = innerWidth(row);
  const twoRows = parts.display.y > parts.format.y + parts.format.height - 1;
  trial.measure(`largeur de la bande ${when}`, [Math.round(width)]);
  trial.check(
    `${when} : ${twoRows ? "deux lignes" : "une ligne"} pour ${Math.round(width)} points de bande`,
    twoRows === width < SWITCH_WIDTH,
  );
  if (twoRows) checkTwoRows(trial, when);
  else checkOneRow(trial, when);
  checkPointer(trial, when);
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
    // Bande resserrée comme le ferait une colonne de gauche large : deux lignes, quelle que soit la fenêtre.
    squeezed(SWITCH_WIDTH - 60 + 2 * 0.8 * ROOT_REM, () =>
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
        const panels = named("Panneaux");
        const hidden = panels?.getAttribute("aria-pressed") === "true";
        if (hidden) panels?.click();
        try {
          await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
          const parts = checkOneRow(trial, "fenêtre réelle");
          checkPointer(trial, "fenêtre réelle");
          if (parts === null) return;
          checkSqueezed(trial, parts.display.x + parts.display.width - parts.format.x);
        } finally {
          if (hidden) named("Panneaux")?.click();
        }
      },
    },
    {
      name: "Bande du haut : colonne Claude Code ouverte",
      run: checkWithClaudeColumn,
    },
  ];
}
