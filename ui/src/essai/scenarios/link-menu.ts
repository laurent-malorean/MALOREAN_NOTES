// Essai de l'application réelle (fiches 0054 et 0071) : lier un contenu sans saisir son nom, dans la
// vraie fenêtre. `[[` ouvre le menu des liens sous le curseur, chaque ligne avec son icône et son
// dossier, entièrement dans la fenêtre, chaque ligne reçoit le pointeur ; deux contenus de même nom
// s'écrivent avec leur dossier ; un canvas s'écrit `nom.canvas` ; un lien ambigu est souligné ;
// `/` ouvre « Lien vers… » ; le bouton « Lien » propose les deux choix. Les liens écrits sont
// résolus par Rust.
import { EditorView } from "@codemirror/view";
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import { type Env, centreOf, find, findAll, rectOf } from "./env";

const WAIT = 20_000;
const TWIN = "Doublon essai";
/** Le canvas, titré « Lien essai » à sa création : son fichier s'appelle `lien-essai.canvas`. */
const CANVAS_TITLE = "Lien essai";
const CANVAS_NAME = "lien-essai";

const menu = () => find<HTMLElement>(".link-menu");
const rows = () => findAll<HTMLElement>(".link-menu-option");
const view = () => {
  const found = find<HTMLElement>(".cm-editor");
  const editor = found === null ? null : EditorView.findFromDOM(found);
  if (editor === null) throw new Error("éditeur absent");
  return editor;
};

/** Le rectangle est entièrement dans la fenêtre, avec une surface. */
const insideWindow = (element: Element | null) => {
  const rect = element === null ? null : rectOf(element);
  return (
    rect !== null &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= window.innerWidth &&
    rect.y + rect.height <= window.innerHeight
  );
};

/** Le pointeur atteint l'élément en son centre. */
function reachable(element: Element): boolean {
  const at = centreOf(rectOf(element));
  const hit = document.elementFromPoint(at.x, at.y);
  return hit !== null && element.contains(hit);
}

/** Tape `text` au curseur de l'éditeur, comme au clavier. */
function type(text: string): void {
  const editor = view();
  const { head } = editor.state.selection.main;
  editor.dispatch({
    changes: { from: head, insert: text },
    selection: { anchor: head + text.length },
  });
}

const press = (key: string) =>
  view().contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

const written = () => view().state.doc.toString();

/** Une note de ce titre dans `folder`. */
async function noteTitled(env: Env, folder: string, title: string): Promise<void> {
  const { bridge } = env;
  const note = await bridge.createNote(folder);
  const read = await bridge.readNote(note.path);
  await bridge.saveNote(note.path, `# ${title}\n`, read.fingerprint);
}

/** Les contenus de l'essai, puis une note à écrire, ouverte, l'éditeur prêt à la frappe. */
async function prepare(env: Env): Promise<void> {
  const { bridge } = env;
  await noteTitled(env, "", TWIN);
  await noteTitled(env, "Essai", TWIN);
  await bridge.createCanvas("", CANVAS_TITLE);
  const draft = await bridge.createNote("");
  env.open(draft.path);
  // La colonne montrait un canvas ou un CRM : l'éditeur n'est à l'écran qu'une fois la note chargée.
  await until(
    "l'éditeur de la note, à l'écran",
    () => {
      const content = find<HTMLElement>(".cm-content");
      return content !== null && rectOf(content).width > 0 && view().state.doc.length === 0
        ? content
        : null;
    },
    WAIT,
  );
  view().focus();
  await until(
    "le focus dans l'éditeur",
    () => (view().contentDOM === document.activeElement ? true : null),
    WAIT,
  );
}

/** Le menu ouvert par `[[doublon` : dans la fenêtre, ses deux lignes avec leur icône et leur dossier, atteintes par le pointeur. */
function checkMenu(trial: Trial): void {
  const shown = menu();
  trial.check(
    "le menu des liens est entièrement dans la fenêtre",
    insideWindow(shown),
    JSON.stringify(shown && rectOf(shown)),
  );
  const lines = rows();
  trial.check(
    "les deux contenus de même nom sont proposés",
    lines.length === 2,
    `${lines.length} lignes`,
  );
  const folders = lines.map((line) => line.querySelector(".link-menu-detail")?.textContent ?? "");
  trial.check(
    "chaque ligne montre le dossier du contenu",
    folders.includes("Racine") && folders.includes("Essai"),
    folders.join("|"),
  );
  const drawn = lines.filter((line) => insideWindow(line.querySelector("svg")));
  trial.check(
    "chaque ligne a l'icône de son type, visible",
    drawn.length === lines.length,
    `${drawn.length}/${lines.length}`,
  );
  const blocked = lines.filter((line) => !reachable(line));
  trial.check(
    "chaque ligne reçoit le pointeur",
    blocked.length === 0,
    `${blocked.length} bloquées`,
  );
}

async function bracketsScenario(env: Env, trial: Trial): Promise<void> {
  await prepare(env);
  type("[[doublon");
  await until("le menu des liens", () => menu(), WAIT);
  await pause(200);
  checkMenu(trial);
  press("Enter");
  await until("le menu fermé", () => (menu() === null ? true : null), WAIT);
  const link = /\[\[([^\]]+)\]\]/.exec(written())?.[1] ?? "";
  trial.check(
    "le lien écrit contient le dossier du contenu choisi",
    link === "/Doublon essai" || link === "Essai/Doublon essai",
    link,
  );
  const [resolved, bare] = await env.bridge.resolveLinks([link, TWIN]);
  trial.check(
    "Rust résout le lien écrit vers un seul contenu",
    resolved?.kind === "found",
    JSON.stringify(resolved),
  );
  trial.check(
    "le nom seul des deux contenus est un lien ambigu pour Rust",
    bare?.kind === "ambiguous",
    JSON.stringify(bare),
  );
  type(" et [[Doublon essai]]");
  const underlined = await until(
    "le lien ambigu souligné",
    () => find(".cm-note-link-ambiguous"),
    WAIT,
  ).catch(() => null);
  trial.check(
    "le lien ambigu est souligné à l'écran",
    underlined !== null && insideWindow(underlined),
    "",
  );
}

async function canvasScenario(env: Env, trial: Trial): Promise<void> {
  type("\n[[lien ess");
  await until("le menu des liens", () => menu(), WAIT);
  trial.check(
    "le canvas est proposé",
    rows().some((line) => line.textContent?.includes(CANVAS_NAME)),
    rows()
      .map((r) => r.textContent)
      .join("|"),
  );
  press("Enter");
  await until("le menu fermé", () => (menu() === null ? true : null), WAIT);
  trial.check(
    "un canvas s'écrit avec son extension",
    written().includes(`[[${CANVAS_NAME}.canvas]]`),
    written(),
  );
}

async function slashScenario(env: Env, trial: Trial): Promise<void> {
  type("\n/doublon");
  await until("le menu « Lien vers… »", () => menu(), WAIT);
  trial.check(
    "« / » ouvre le menu « Lien vers… », uniquement des liens",
    menu()?.querySelector(".link-menu-title")?.textContent === "Lien vers…" &&
      menu()?.querySelectorAll("button").length === 0,
    menu()?.textContent ?? "",
  );
  press("Escape");
  await until("le menu fermé", () => (menu() === null ? true : null), WAIT);
  type(" ");
  const [lone] = await env.bridge.resolveLinks(["Essai/Doublon essai"]);
  trial.check(
    "le dossier devant le nom désigne un seul contenu",
    lone?.kind === "found",
    JSON.stringify(lone),
  );
}

async function buttonScenario(trial: Trial): Promise<void> {
  const editor = view();
  editor.focus();
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: "mot" },
    selection: { anchor: 0, head: 3 },
  });
  const button = find<HTMLButtonElement>('button[aria-label="Lien"]');
  if (button === null) throw new Error("bouton « Lien » absent");
  trial.check("le bouton « Lien » reçoit le pointeur", reachable(button), "");
  button.click();
  const dialog = await until(
    "la fenêtre du choix du lien",
    () => find<HTMLDialogElement>("dialog.picker[open]"),
    WAIT,
  );
  const choices = findAll("[role=option]", dialog).map((option) => option.textContent);
  trial.check(
    "le bouton « Lien » propose « Une note ou un contenu » et « Une page web »",
    choices.join("|") === "Une note ou un contenu|Une page web",
    choices.join("|"),
  );
  trial.check("le choix du lien est entièrement dans la fenêtre", insideWindow(dialog), "");
  findAll<HTMLElement>("[role=option]", dialog)[1]?.click();
  await until(
    "le lien vers une page web",
    () => (written().includes("](url)") ? true : null),
    WAIT,
  );
  trial.check(
    "« Une page web » pose un lien Markdown sur le texte sélectionné",
    written().startsWith("[mot](url)"),
    written().slice(0, 20),
  );
}

export function linkMenuScenarios(env: Env): Scenario[] {
  return [
    { name: "liens : [[, doublons, lien ambigu", run: (t) => bracketsScenario(env, t) },
    { name: "liens : canvas", run: (t) => canvasScenario(env, t) },
    { name: "liens : / et dossier devant le nom", run: (t) => slashScenario(env, t) },
    { name: "liens : bouton « Lien »", run: (t) => buttonScenario(t) },
  ];
}
