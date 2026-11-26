// Essai de l'application réelle (fiche 0054, fiche 0062) : la fenêtre d'une action dans la vraie
// fenêtre. Un clic sur une carte l'ouvre ; elle est à droite sur toute la hauteur et chaque champ y est
// visible et reçoit le pointeur ; un changement de statut s'écrit dans le fichier ; « + Ajouter une
// action » d'un CRM sans personne l'ouvre, et « Enregistrer » crée un fichier sur le disque.
import type { CrmActionDraftItem, CrmItem } from "../../bridge";
import { NO_FILTERS } from "../../state/crm";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import {
  type Env,
  centreOf,
  find,
  findAll,
  notesFolder,
  readDisk,
  rectOf,
  shownMessages,
} from "./env";

const WAIT = 20_000;
/** La largeur de la fenêtre d'une action, au plus (spécification § 8). */
const PANEL_MAXIMUM = 600;

const draft = (title: string): CrmActionDraftItem => ({
  ...{ title, status: "TODO", date: "2026-11-24", people: [], channel: null, project: null },
  ...{ color: null, tags: [], linkedNotes: [], description: "" },
});

const panel = () => find<HTMLElement>(".crm-aw-panel");
const control = (label: string) => find<HTMLElement>(`.crm-aw-panel [aria-label="${label}"]`);
const text = (bytes: Uint8Array | null) => (bytes === null ? "" : new TextDecoder().decode(bytes));

/** Un clic sur une carte, comme le fait la souris. */
function clickCard(title: string): void {
  const card = findAll<HTMLElement>(".crm-card").find((c) => c.textContent?.includes(title));
  if (card === undefined) throw new Error(`carte « ${title} » absente`);
  card.click();
}

/** Le champ est à l'écran, a une taille, et reçoit le pointeur en son centre : rien ne le recouvre. */
function pointable(element: HTMLElement | null): boolean {
  if (element === null) return false;
  const rect = rectOf(element);
  const at = centreOf(rect);
  const hit = document.elementFromPoint(at.x, at.y);
  return rect.width > 0 && rect.height > 0 && hit !== null && element.contains(hit);
}

/** La fenêtre : à droite, sur toute la hauteur, 600 points au plus ; ses champs reçoivent le pointeur. */
function checkPanel(trial: Trial): void {
  const shown = panel();
  const rect = shown === null ? null : rectOf(shown);
  trial.measure(
    "fenêtreDUneAction",
    rect === null ? [] : [rect.x, rect.y, rect.width, rect.height],
  );
  trial.check(
    "la fenêtre est collée au bord droit, sur toute la hauteur, 600 points au plus",
    rect !== null &&
      Math.round(rect.x + rect.width) === window.innerWidth &&
      Math.round(rect.height) === window.innerHeight &&
      rect.width <= PANEL_MAXIMUM,
    JSON.stringify(rect),
  );
  const labels = ["Statut", "Date", "Canal", "Projet", "Titre", "Description"];
  const missing = labels.filter((label) => !pointable(control(label)));
  trial.check(
    "les champs de la fenêtre sont visibles et reçoivent le pointeur",
    missing.length === 0,
    missing.join(),
  );
  const swatches = findAll<HTMLElement>(".crm-aw-swatch");
  trial.check(
    "les dix pastilles de couleur reçoivent le pointeur",
    swatches.length === 10 && swatches.every((swatch) => pointable(swatch)),
    String(swatches.length),
  );
}

/** Change le statut dans la liste de la fenêtre, comme un choix à la souris. */
function chooseStatus(status: string): void {
  const select = control("Statut") as HTMLSelectElement | null;
  if (select === null) throw new Error("liste du statut absente");
  select.value = status;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Une checklist de deux éléments dont un coché, pour la barre de progression et l'élément barré. */
async function addChecklist(env: Env, path: string, action: string): Promise<void> {
  const body = (change: object) =>
    env.bridge.changeCrmAction(path, action, { kind: "body", change } as never);
  await body({ kind: "addChecklist", name: "Essai" });
  await body({ kind: "addItem", list: 0, text: "Fait" });
  await body({ kind: "addItem", list: 0, text: "À faire" });
  await body({ kind: "checkItem", list: 0, item: 0, done: true });
}

/** La barre de progression à 50 % et l'élément coché barré. */
function checkChecklist(trial: Trial): void {
  const bar = find<HTMLElement>(".crm-aw-bar");
  trial.check(
    "la checklist a une barre de progression à 50 %",
    bar?.getAttribute("role") === "progressbar" && bar.getAttribute("aria-valuenow") === "50",
    bar?.outerHTML.slice(0, 120) ?? "absente",
  );
  const lines = (label: string) => {
    const item = control(label);
    return item === null ? "absent" : getComputedStyle(item).textDecorationLine;
  };
  trial.check(
    "un élément coché est barré, un élément à faire ne l'est pas",
    lines("Élément Fait") === "line-through" && lines("Élément À faire") === "none",
    `${lines("Élément Fait")} / ${lines("Élément À faire")}`,
  );
}

/** Le calendrier de l'application : grand, en français, semaine du lundi. */
async function checkCalendar(trial: Trial): Promise<void> {
  find<HTMLButtonElement>(".crm-aw .date-open")?.click();
  const calendar = await until("le calendrier", () => find(".date-popup"), WAIT).catch(() => null);
  const width = calendar === null ? 0 : rectOf(calendar).width;
  const month = find(".date-month")?.textContent ?? "";
  trial.check(
    "le calendrier de l'application est grand (300 points au moins), en français, semaine du lundi",
    width >= 300 && find(".date-weekday")?.textContent === "L" && /^[a-zéû]+ \d{4}$/i.test(month),
    `${String(width)} ${month}`,
  );
  control("Date")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/** La liste des étiquettes qui existent, à la prise du curseur dans le champ. */
async function checkTagList(trial: Trial): Promise<void> {
  const tags = control("Ajouter une étiquette");
  tags?.focus();
  const listed = await until("la liste des étiquettes", () => find(".tag-suggestion"), WAIT).catch(
    () => null,
  );
  trial.check(
    "le champ d'étiquettes propose celles qui existent déjà",
    listed?.textContent?.includes("autre") === true,
    listed?.textContent ?? "aucune liste",
  );
  tags?.blur();
}

async function actionScenario(env: Env, trial: Trial): Promise<void> {
  const { path } = await env.bridge.createCrm("", "Essai fenêtre");
  const name = await env.bridge.createCrmAction(path, draft("Appeler Marie"));
  await env.bridge.createCrmAction(path, { ...draft("Relancer"), tags: ["autre"] });
  await addChecklist(env, path, name);
  const file = `${notesFolder(env)}/${path.replace(/\.md$/, "")}/actions/${name}.md`;
  env.open(path);
  await until("les cartes", () => (findAll(".crm-card").length === 2 ? true : null), WAIT);
  clickCard("Appeler Marie");
  await until("la fenêtre de l'action", () => panel(), WAIT);
  trial.check(
    "un clic sur la carte ouvre la fenêtre de cette action",
    (control("Titre") as HTMLInputElement | null)?.value === "Appeler Marie",
    "",
  );
  checkPanel(trial);
  checkChecklist(trial);
  await checkCalendar(trial);
  await checkTagList(trial);
  chooseStatus("Progress");
  const written = await until(
    "le statut écrit sur le disque",
    async () => (/statut:\s*Progress/.test(text(await readDisk(file))) ? true : null),
    WAIT,
  ).catch(() => null);
  trial.check(
    "changer le statut dans la fenêtre l'écrit dans le fichier",
    written !== null,
    text(await readDisk(file)).slice(0, 120),
  );
  find<HTMLButtonElement>(".crm-aw-close")?.click();
  await until("la fenêtre fermée", () => (panel() === null ? true : null), WAIT);
  trial.check("« Fermer » ferme la fenêtre", panel() === null, "");
}

/** Un CRM sans personne : « + Ajouter une action » ouvre la fenêtre, « Enregistrer » crée le fichier. */
/** Ce que le CRM contient et ce que la fenêtre dit, quand l'action créée n'est pas là. */
async function whatHappened(env: Env, path: string): Promise<string> {
  const crm: CrmItem = await env.bridge.readCrm(path, NO_FILTERS, null);
  const titles = crm.actions.map((a) => a.title).join(", ");
  return `actions : [${titles}] ; messages : ${shownMessages()}`;
}

async function creationScenario(env: Env, trial: Trial): Promise<void> {
  const { path } = await env.bridge.createCrm("", "Essai création");
  env.open(path);
  // Le CRM d'avant a encore son Kanban : celui-ci est le bon quand il dit qu'il n'a aucune action.
  await until("le Kanban du nouveau CRM", () => find(".crm-empty"), WAIT);
  const add = find<HTMLButtonElement>('.crm-column[data-status="TODO"] .crm-add-action');
  if (add === null) throw new Error("« + Ajouter une action » absent");
  add.click();
  await until("la fenêtre d'une nouvelle action", () => panel(), WAIT);
  trial.check(
    "sans personne, « + Ajouter une action » ouvre la fenêtre d'une nouvelle action",
    find(".crm-aw-heading")?.textContent === "Nouvelle action",
    "",
  );
  const title = control("Titre") as HTMLInputElement | null;
  if (title === null) throw new Error("champ du titre absent");
  title.value = "Rédiger le devis";
  title.dispatchEvent(new Event("change", { bubbles: true }));
  find<HTMLButtonElement>(".crm-aw-save-action")?.click();
  const created = await until(
    "l'action créée par Rust",
    async () => {
      const crm: CrmItem = await env.bridge.readCrm(path, NO_FILTERS, null);
      return crm.actions.find((a) => a.title === "Rédiger le devis") ?? null;
    },
    WAIT,
  ).catch(() => null);
  const file =
    created === null
      ? null
      : await readDisk(
          `${notesFolder(env)}/${path.replace(/\.md$/, "")}/actions/${created.name}.md`,
        );
  trial.check(
    "« Enregistrer » crée le fichier de l'action sur le disque",
    /statut:\s*TODO/.test(text(file)),
    text(file).slice(0, 120) || (await whatHappened(env, path)),
  );
  await until("la fenêtre fermée", () => (panel() === null ? true : null), WAIT).catch(() => null);
  trial.check("la fenêtre se ferme une fois l'action créée", panel() === null, "");
}

export const crmActionScenarios = (env: Env): Scenario[] => [
  {
    name: "CRM : fenêtre d'une action (ouvrir, champs, statut)",
    run: (t) => actionScenario(env, t),
  },
  { name: "CRM : créer une action par la fenêtre", run: (t) => creationScenario(env, t) },
];
