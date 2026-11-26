// Essai de l'application réelle (fiche 0090) : « Renommer… » dans le menu du clic droit, dans la vraie
// fenêtre, pour chaque sorte de contenu (note, cahier de recherche, carte mentale, canvas, CRM). Le choix est
// dans le menu de la liste et dans celui de l'onglet ; la fenêtre est préremplie avec le titre ; un titre
// vide est refusé dans la fenêtre, qui reste ouverte ; valider renomme le fichier sur le disque (un CRM
// emmène le dossier de ses fiches) et l'onglet prend le nouveau titre.
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { centreOf, find, findAll, notesFolder, readDisk, rectOf, type Env } from "./env";

const WAIT = 20_000;
const RENAME = "Renommer…";
const EMPTY = "Le titre est vide.";
const CRM = "un CRM et ses fiches";

const label = (entry: Element) => entry.querySelector(".context-menu-label")?.textContent ?? "";
const choice = () =>
  findAll<HTMLButtonElement>(".context-menu button").find((e) => label(e) === RENAME);
const prompt = () => find<HTMLDialogElement>("dialog[open]");
const field = () => find<HTMLInputElement>("dialog[open] .name-prompt-input");
const tabTitles = () => findAll(".tab .tab-title").map((tab) => tab.textContent ?? "");

function rightClick(target: Element): void {
  const at = centreOf(rectOf(target));
  const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y };
  target.dispatchEvent(new MouseEvent("contextmenu", init));
}

const exists = async (env: Env, path: string) =>
  (await readDisk(`${notesFolder(env)}/${path}`)) !== null;

/** Un contenu de chaque sorte : son titre de départ, ce qui le crée, et son fichier avant et après. */
interface Kind {
  readonly name: string;
  readonly title: string;
  readonly make: (env: Env) => Promise<string>;
  readonly typed: string;
  /** Le titre que l'application montre ensuite : celui d'un canvas est son nom de fichier. */
  readonly after: string;
  readonly renamed: string;
}

const KINDS: readonly Kind[] = [
  {
    name: "une note",
    title: "Essai renommage note",
    make: async (env) => {
      const note = await env.bridge.createNote("");
      const read = await env.bridge.readNote(note.path);
      await env.bridge.saveNote(note.path, "# Essai renommage note\ntexte\n", read.fingerprint);
      return "essai-renommage-note.md";
    },
    typed: "Note renommée par le menu",
    after: "Note renommée par le menu",
    renamed: "note-renommee-par-le-menu.md",
  },
  {
    name: "un cahier de recherche",
    title: "Essai renommage cahier",
    make: async (env) =>
      (await env.bridge.createResearchNotebook("", "Essai renommage cahier")).path,
    typed: "Cahier renommé par le menu",
    after: "Cahier renommé par le menu",
    renamed: "cahier-renomme-par-le-menu.md",
  },
  {
    name: "une carte mentale",
    title: "Essai renommage carte",
    make: async (env) => (await env.bridge.createMindMap("", "Essai renommage carte")).path,
    typed: "Carte renommée par le menu",
    after: "Carte renommée par le menu",
    renamed: "carte-renommee-par-le-menu.md",
  },
  {
    name: "un canvas",
    title: "essai-renommage-canvas",
    make: async (env) => (await env.bridge.createCanvas("", "Essai renommage canvas")).path,
    typed: "Canvas renommé par le menu",
    after: "canvas-renomme-par-le-menu",
    renamed: "canvas-renomme-par-le-menu.canvas",
  },
  {
    name: CRM,
    title: "Essai renommage CRM",
    make: async (env) => {
      const { path } = await env.bridge.createCrm("", "Essai renommage CRM");
      await env.bridge.createCrmCompany(path, "Acme");
      return path;
    },
    typed: "CRM renommé par le menu",
    after: "CRM renommé par le menu",
    renamed: "crm-renomme-par-le-menu.md",
  },
];

/** L'élément de la liste (ou l'onglet) de ce titre. */
const listed = (title: string) =>
  findAll<HTMLElement>(".note-item").find((item) => item.textContent?.includes(title)) ?? null;
const tabOf = (title: string) =>
  findAll<HTMLElement>('[role="tab"]').find((tab) => tab.textContent?.includes(title)) ?? null;

/** Le clic droit sur `target` ouvre le menu, avec « Renommer… » : le choix est cliqué, la fenêtre s'ouvre. */
async function openPrompt(trial: Trial, where: string, target: Element): Promise<void> {
  rightClick(target);
  const entry = await until(`« ${RENAME} » dans le menu ${where}`, () => choice(), WAIT);
  trial.check(`${where} : « ${RENAME} » a son icône`, entry.querySelector("svg") !== null);
  entry.click();
  await until(`la fenêtre du titre (${where})`, () => field(), WAIT);
}

/** Valide la fenêtre par son bouton, et attend qu'elle se ferme. */
async function validate(): Promise<void> {
  find<HTMLButtonElement>("dialog[open] button.primary")?.click();
  await until("la fenêtre du titre fermée", () => (prompt() === null ? true : null), WAIT);
}

/** Le menu de l'onglet : la fenêtre est préremplie, un titre vide est dit dans la fenêtre qui reste ouverte. */
async function refuseEmptyTitle(trial: Trial, kind: Kind): Promise<void> {
  await openPrompt(trial, `de l'onglet de ${kind.name}`, tabOf(kind.title) as HTMLElement);
  const prefilled = field()?.value;
  trial.check(
    `${kind.name} : la fenêtre est préremplie avec le titre`,
    prefilled === kind.title,
    prefilled,
  );
  (field() as HTMLInputElement).value = "   ";
  find<HTMLButtonElement>("dialog[open] button.primary")?.click();
  const message = await until(
    "le message du titre vide",
    () => find("dialog[open] .name-prompt-error")?.textContent || null,
    WAIT,
  );
  trial.check(`${kind.name} : un titre vide est dit dans la fenêtre`, message === EMPTY, message);
  trial.check(`${kind.name} : la fenêtre reste ouverte`, prompt() !== null);
}

/** Un CRM emmène le dossier de ses fiches. */
async function checkFiches(env: Env, trial: Trial, before: string, after: string): Promise<void> {
  const stem = (name: string) => name.replace(/\.md$/, "");
  const moved = await exists(env, `${stem(after)}/entreprises/acme.md`);
  trial.check("le CRM a emmené le dossier de ses fiches", moved);
  const left = await exists(env, `${stem(before)}/entreprises/acme.md`);
  trial.check("l'ancien dossier des fiches a disparu", !left);
}

/** Le menu de la liste propose aussi « Renommer… » : annuler ne change rien. */
async function cancelFromList(env: Env, trial: Trial, kind: Kind): Promise<void> {
  find<HTMLElement>('.folder-item[data-path=""]')?.click();
  const item = await until("le contenu dans la liste", () => listed(kind.after), WAIT);
  await openPrompt(trial, `de la liste, pour ${kind.name}`, item);
  const current = field()?.value;
  trial.check(
    `${kind.name} : la fenêtre de la liste a le titre actuel`,
    current === kind.after,
    current,
  );
  find<HTMLButtonElement>("dialog[open] button.link")?.click();
  await until("la fenêtre annulée", () => (prompt() === null ? true : null), WAIT);
  trial.check(`${kind.name} : annuler ne change rien`, await exists(env, kind.renamed));
}

async function kindScenario(env: Env, trial: Trial, kind: Kind): Promise<void> {
  const path = await kind.make(env);
  env.open(path);
  await until(`l'onglet « ${kind.title} »`, () => tabOf(kind.title), WAIT);
  await refuseEmptyTitle(trial, kind);
  (field() as HTMLInputElement).value = kind.typed;
  field()?.dispatchEvent(new Event("input", { bubbles: true }));
  await validate();
  await until(
    `${kind.name} : le fichier renommé`,
    async () => ((await exists(env, kind.renamed)) ? true : null),
    WAIT,
  );
  trial.check(`${kind.name} : l'ancien fichier a disparu`, !(await exists(env, path)));
  await until(`${kind.name} : l'onglet au nouveau titre`, () => tabOf(kind.after), WAIT);
  const shown = tabTitles().filter((title) => title === kind.after).length;
  trial.check(`${kind.name} : un seul onglet de ce contenu`, shown === 1);
  if (kind.name === CRM) await checkFiches(env, trial, path, kind.renamed);
  await cancelFromList(env, trial, kind);
}

export function renameScenarios(env: Env): Scenario[] {
  return KINDS.map((kind) => ({
    name: `renommer par le menu : ${kind.name}`,
    run: (trial) => kindScenario(env, trial, kind),
  }));
}
