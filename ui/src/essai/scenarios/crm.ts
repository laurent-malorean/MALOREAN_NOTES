// Essai de l'application réelle (fiche 0054, fiche 0060) : créer un CRM par le vrai pont, voir ses cinq
// colonnes et ses cartes dans la vraie fenêtre (rectangles, hauteurs, cible d'un clic), puis glisser une
// carte d'une colonne à l'autre par les événements du pointeur et relire le statut écrit sur le disque.
import type { CrmActionDraftItem, CrmItem } from "../../bridge";
import { NO_FILTERS } from "../../state/crm";
import type { Scenario, Trial } from "../runner";
import { pause, until } from "../wait";
import { type Env, centreOf, find, findAll, notesFolder, pointer, readDisk, rectOf } from "./env";

const WAIT = 20_000;
/** La largeur d'une colonne du Kanban, au moins (spécification § 7.1). */
const COLUMN_MINIMUM = 272;
const COLUMNS = ["TODO", "Progress", "WaitingFor", "Done", "Cancel"];

const draft = (title: string, status: string): CrmActionDraftItem => ({
  ...{ title, status, date: "2026-11-24", people: [], channel: null, project: null },
  ...{ color: null, tags: [], linkedNotes: [], description: "" },
});

const column = (status: string) => find<HTMLElement>(`.crm-column[data-status="${status}"]`);
const cardOf = (title: string) =>
  findAll<HTMLElement>(".crm-card").find((c) => c.textContent?.includes(title));

/** Crée un CRM avec trois actions par le vrai pont, et l'ouvre comme l'utilisateur. */
async function openedCrm(env: Env): Promise<{ path: string; folder: string }> {
  const { path } = await env.bridge.createCrm("", "Essai CRM");
  await env.bridge.createCrmAction(path, draft("Appeler Marie", "TODO"));
  await env.bridge.createCrmAction(path, draft("Rédiger le devis", "TODO"));
  await env.bridge.createCrmAction(path, draft("Envoyer l'e-mail", "Progress"));
  env.open(path);
  await until("le Kanban à l'écran", () => find(".crm-board"), WAIT);
  await until("les trois cartes", () => (findAll(".crm-card").length === 3 ? true : null), WAIT);
  return { path, folder: `${notesFolder(env)}/${path.replace(/\.md$/, "")}/actions` };
}

/** Ce que la vraie fenêtre montre : les colonnes, leur largeur, les cartes et ce qui les reçoit au clic. */
function checkLayout(trial: Trial): void {
  const names = findAll(".crm-column-name").map((e) => e.textContent);
  trial.check(
    "le Kanban montre ses cinq colonnes dans l'ordre",
    names.join() === COLUMNS.join(),
    names.join(),
  );
  const widths = findAll<HTMLElement>(".crm-column").map((c) => Math.round(rectOf(c).width));
  trial.measure("largeursDesColonnes", widths);
  trial.check(
    "chaque colonne a au moins 272 points",
    widths.length === COLUMNS.length && widths.every((w) => w >= COLUMN_MINIMUM),
    widths.join(),
  );
  const heights = findAll(".crm-card").map((c) => Math.round(rectOf(c).height));
  trial.measure("hauteursDesCartes", heights);
  trial.check(
    "chaque carte a une hauteur",
    heights.length === 3 && heights.every((h) => h > 20),
    heights.join(),
  );
  const todo = column("TODO");
  const centre = todo === null ? null : centreOf(rectOf(todo));
  const hit = centre === null ? null : document.elementFromPoint(centre.x, centre.y);
  trial.check(
    "la colonne TODO est atteinte par le pointeur à son centre",
    hit !== null && todo?.contains(hit) === true,
    hit?.className ?? "rien",
  );
}

/** Glisse la carte `title` sur la colonne `status`, par les événements du pointeur, comme la souris. */
async function dragCard(title: string, status: string): Promise<void> {
  const card = cardOf(title);
  const target = column(status);
  if (card === undefined || target === null)
    throw new Error(`carte « ${title} » ou colonne ${status} absente`);
  const from = centreOf(rectOf(card));
  const to = centreOf(rectOf(target));
  pointer(card, "pointerdown", from);
  pointer(document, "pointermove", { x: from.x + 6, y: from.y });
  pointer(document, "pointermove", to);
  await pause(50);
  pointer(document, "pointerup", to);
}

async function statusOf(env: Env, path: string, title: string): Promise<string | null> {
  const crm: CrmItem = await env.bridge.readCrm(path, NO_FILTERS, null);
  return crm.actions.find((a) => a.title === title)?.status ?? null;
}

async function dragScenario(env: Env, trial: Trial): Promise<void> {
  const { path, folder } = await openedCrm(env);
  checkLayout(trial);
  await dragCard("Appeler Marie", "Progress");
  const moved = await until(
    "le statut changé par Rust",
    async () => ((await statusOf(env, path, "Appeler Marie")) === "Progress" ? true : null),
    WAIT,
  ).catch(() => null);
  trial.check(
    "glisser une carte sur Progress change son statut",
    moved !== null,
    String(await statusOf(env, path, "Appeler Marie")),
  );
  const shown = await until(
    "la carte dans la colonne Progress",
    () => (column("Progress")?.querySelector(".crm-card") ? true : null),
    WAIT,
  ).catch(() => null);
  trial.check(
    "la colonne Progress montre la carte déplacée",
    shown !== null && (column("Progress")?.querySelectorAll(".crm-card").length ?? 0) === 2,
    "",
  );
  const name = (await env.bridge.readCrm(path, NO_FILTERS, null)).actions.find(
    (a) => a.title === "Appeler Marie",
  )?.name;
  const file = name === undefined ? null : await readDisk(`${folder}/${name}.md`);
  const text = file === null ? "" : new TextDecoder().decode(file);
  trial.check(
    "le fichier de l'action, sur le disque, dit le nouveau statut",
    /statut:\s*Progress/.test(text),
    text.slice(0, 120),
  );
  await checkFichesFolderHidden(env, trial, path, file !== null);
}

/** Le dossier des fiches existe sur le disque (on vient d'y lire une fiche), mais la liste des dossiers ne le montre pas. */
async function checkFichesFolderHidden(
  env: Env,
  trial: Trial,
  crm: string,
  onDisk: boolean,
): Promise<void> {
  const stem = crm.replace(/\.md$/, "");
  const listed = await env.bridge.listFolders();
  trial.check(
    "le dossier des fiches du CRM existe sur le disque",
    onDisk,
    "aucune fiche lue dans son dossier",
  );
  trial.check(
    "la liste des dossiers ne contient ni le dossier des fiches du CRM ni ses sous-dossiers",
    !listed.some((folder) => folder === stem || folder.startsWith(`${stem}/`)),
    listed.join(),
  );
  const shown = findAll(".folders-list .folder-name").map((name) => name.textContent);
  trial.check(
    "la liste des dossiers montrée à l'écran n'a pas le dossier des fiches du CRM",
    !shown.includes(stem) && !shown.includes("actions"),
    shown.join(),
  );
}

export const crmScenarios = (env: Env): Scenario[] => [
  { name: "CRM : créer, voir le Kanban, glisser une carte", run: (t) => dragScenario(env, t) },
];
