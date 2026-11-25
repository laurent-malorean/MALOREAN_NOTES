// Essai de l'application réelle (fiche 0054, fiche 0064) : la bande du haut dans la vraie fenêtre. Les trois blocs
// d'icônes (mise en forme, copies, affichage) et le champ de recherche sont sur une seule ligne, rangés de gauche
// à droite sans se chevaucher ; chaque icône reçoit le pointeur ; quand la place manque, la recherche rétrécit
// jusqu'à son minimum puis le bloc d'affichage passe à la ligne, et rien ne déborde.
import type { Scenario, Trial } from "../runner";
import { type Rect, centreOf, find, findAll, rectOf } from "./env";

const NAMES = ["Focus", "Plan", "Machine à écrire", "Panneaux", "Plein écran", "Claude"];
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
  const exact = Math.ceil(blocks + GAP + SEARCH_MINIMUM + PADDING);
  squeezed(exact, () => {
    const parts = checkOneRow(trial, "recherche au minimum");
    trial.check(
      "recherche au minimum : le champ est réduit à son minimum, pas au-dessous",
      parts !== null && Math.round(parts.search.width) === SEARCH_MINIMUM,
      String(parts?.search.width),
    );
  });
  squeezed(exact - 40, () => {
    const parts = partsOf();
    const row = strip();
    if (parts === null || row === null) return trial.check("bande resserrée présente", false);
    const { format, copy, display, search } = parts;
    trial.check(
      "place manquante : le bloc d'affichage passe sous les deux autres, la recherche reste sur la première ligne",
      display.y >= format.y + format.height - 1 &&
        Math.abs(middle(copy) - middle(format)) < SAME_ROW,
      JSON.stringify([format, display].map((r) => Math.round(r.y))),
    );
    trial.check(
      "place manquante : le champ garde au moins son minimum, rien ne déborde ni ne se chevauche",
      Math.round(search.width) >= SEARCH_MINIMUM &&
        row.scrollWidth <= row.clientWidth &&
        [format, copy, display, search].every((rect, i, all) =>
          all.slice(i + 1).every((other) => apart(rect, other)),
        ),
      `${Math.round(search.width)} / ${row.scrollWidth - row.clientWidth}`,
    );
    checkPointer(trial, "place manquante");
  });
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
  ];
}
