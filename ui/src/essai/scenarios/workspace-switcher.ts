// Essai de l'application réelle (fiche 0054) : le sélecteur d'espace de travail au pied de la liste des
// dossiers, dans la vraie fenêtre. Ses rectangles sont mesurés (sous « Réglages », dans la liste des dossiers), le menu
// s'ouvre au-dessus de la barre sans déborder, chaque choix reçoit le pointeur, et choisir un espace l'ouvre.
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { type Env, type Rect, centreOf, find, findAll, notesFolder, rectOf } from "./env";

const WAIT = 20_000;
const OTHER = "essai-bis";

const bar = () => find<HTMLButtonElement>(".workspace-bar");
const menu = () => find<HTMLElement>(".context-menu");
const barName = () => find(".workspace-bar-name")?.textContent ?? "";

/** Le nom d'un choix du menu, sans sa coche ni son « ouvert ». */
const labelOf = (entry: Element) =>
  (entry.textContent ?? "")
    .replace("✓", "")
    .replace(/ ouvert$/, "")
    .trim();

const entries = () => findAll<HTMLButtonElement>("button", menu() ?? document);

/** Vrai si `inner` tient dans `outer` (à un pixel près). */
const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;

const WINDOW = () => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });

/** La barre est au pied de la liste des dossiers, sous « Réglages », et reçoit le clic. */
function checkBar(trial: Trial): void {
  const box = bar() === null ? null : rectOf(bar() as Element);
  const settings = find("[data-settings]");
  const folders = find(".folders");
  trial.check(
    "la barre du sélecteur a une surface",
    box !== null && box.width > 0 && box.height > 0,
    JSON.stringify(box),
  );
  if (box === null || settings === null || folders === null) return;
  const below = rectOf(settings);
  trial.check(
    "la barre est sous « Réglages »",
    box.y >= below.y + below.height - 1,
    `barre à ${Math.round(box.y)}, Réglages jusqu'à ${Math.round(below.y + below.height)}`,
  );
  trial.check(
    "la barre est dans la liste des dossiers",
    within(box, rectOf(folders)),
    JSON.stringify({ barre: box, liste: rectOf(folders) }),
  );
  const centre = centreOf(box);
  const hit = document.elementFromPoint(centre.x, centre.y);
  trial.check(
    "la barre reçoit le pointeur (elementFromPoint)",
    bar()?.contains(hit) === true,
    hit?.className.toString() ?? "rien",
  );
}

/** Le menu est au-dessus de la barre et entier dans la fenêtre. */
function checkMenuPlace(trial: Trial, shown: Element, anchor: Element): void {
  const box = rectOf(shown);
  const barBox = rectOf(anchor);
  trial.measure("menuDuSélecteur", box);
  trial.check(
    "le menu est au-dessus de la barre",
    box.y + box.height <= barBox.y + 1,
    `menu jusqu'à ${Math.round(box.y + box.height)}, barre à ${Math.round(barBox.y)}`,
  );
  trial.check("le menu est entier dans la fenêtre", within(box, WINDOW()), JSON.stringify(box));
}

/** Le menu liste l'espace ouvert (coche nommée « ouvert »), l'autre, puis ajouter. */
function checkMenuEntries(trial: Trial): void {
  const labels = entries().map(labelOf);
  const listed = ["essai", OTHER, "Ajouter un espace de travail…"];
  trial.check(
    "le menu liste l'espace ouvert, l'autre, puis ajouter",
    listed.every((label) => labels.includes(label)),
    labels.join(" | "),
  );
  const open = entries().find((entry) => labelOf(entry) === "essai");
  const named = open?.textContent?.endsWith(" ouvert") === true;
  trial.check(
    "l'espace ouvert a une coche nommée « ouvert »",
    named && open?.getAttribute("aria-checked") === "true",
    open?.textContent ?? "absent",
  );
}

/** Chaque choix du menu reçoit le pointeur en son centre. */
function checkMenuPointer(trial: Trial): void {
  for (const entry of entries()) {
    const at = centreOf(rectOf(entry));
    const hit = document.elementFromPoint(at.x, at.y);
    trial.check(
      `« ${labelOf(entry)} » reçoit le pointeur (elementFromPoint)`,
      hit !== null && entry.contains(hit),
      hit?.className.toString() ?? "rien",
    );
  }
}

function checkMenu(trial: Trial): void {
  const shown = menu();
  const anchor = bar();
  if (shown === null || anchor === null) return trial.check("le menu est ouvert", false);
  checkMenuPlace(trial, shown, anchor);
  checkMenuEntries(trial);
  checkMenuPointer(trial);
}

/** Ouvre le menu par un clic sur la barre, et attend qu'il soit là. */
async function openMenu(): Promise<void> {
  bar()?.click();
  await until("le menu du sélecteur", () => menu(), WAIT);
}

/** Choisit l'espace `name` dans le menu et attend que la barre le montre. */
async function choose(trial: Trial, name: string): Promise<void> {
  await openMenu();
  const entry = entries().find((candidate) => labelOf(candidate) === name);
  if (entry === undefined) throw new Error(`« ${name} » n'est pas dans le menu`);
  entry.click();
  await until(`l'espace « ${name} » ouvert`, () => (barName() === name ? true : null), WAIT);
  trial.check(
    `choisir « ${name} » l'ouvre : la barre en montre le nom`,
    barName() === name && menu() === null,
    barName(),
  );
}

async function runSwitcher(env: Env, trial: Trial): Promise<void> {
  // Un second espace de travail, sur un dossier de l'essai : le menu a de quoi choisir.
  const info = await env.bridge.addWorkspace(OTHER, `${notesFolder(env)}/Fixtures`);
  await env.showWorkspace(info);
  await env.showWorkspace(await env.bridge.openWorkspace("essai"));
  await until(
    "l'espace « essai » dans la barre",
    () => (barName() === "essai" ? true : null),
    WAIT,
  );
  checkBar(trial);
  await openMenu();
  checkMenu(trial);
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  trial.check("un clic ailleurs ferme le menu", menu() === null);
  await choose(trial, OTHER);
  await choose(trial, "essai");
}

export const workspaceSwitcherScenarios = (env: Env): Scenario[] => [
  {
    name: "Sélecteur d'espace de travail : barre du pied, menu au-dessus, choix",
    run: (t) => runSwitcher(env, t),
  },
];
