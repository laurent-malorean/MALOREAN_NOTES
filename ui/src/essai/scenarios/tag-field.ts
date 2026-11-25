// Essai de l'application réelle (fiche 0054) : le champ d'étiquettes, dans la vraie fenêtre, sur chaque
// sorte de contenu (note, cahier de recherche, carte mentale, canvas, fiche d'entreprise du CRM). Sous les
// onglets de la colonne, le champ et son « + » sont visibles et reçoivent le pointeur ; ajouter une
// étiquette l'écrit dans le fichier (l'en-tête, ou la racine d'un canvas) ; la croix la retire.
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { type Env, centreOf, find, findAll, notesFolder, readDisk, rectOf } from "./env";

const WAIT = 20_000;
const TAG = "essai";

const bar = () => find<HTMLElement>(".column .tag-bar");
const field = () => find<HTMLInputElement>('.column .tag-bar [aria-label="Ajouter une étiquette"]');
const plus = () => find<HTMLButtonElement>(".column .tag-bar .tag-add");
const chips = () => findAll(".column .tag-bar .tag-chip").map((chip) => chip.textContent ?? "");
const text = (bytes: Uint8Array | null) => (bytes === null ? "" : new TextDecoder().decode(bytes));

/** Le rectangle est à l'écran, avec une surface, et le pointeur atteint l'élément en son centre. */
function reachable(element: Element | null): boolean {
  if (element === null) return false;
  const rect = rectOf(element);
  const at = centreOf(rect);
  const hit = document.elementFromPoint(at.x, at.y);
  return rect.width > 0 && rect.height > 0 && hit !== null && element.contains(hit);
}

/** Les contenus essayés : leur nom, ce qui le crée, le chemin à ouvrir, et la preuve que le fichier porte l'étiquette. */
interface Kind {
  readonly name: string;
  readonly make: (env: Env) => Promise<string>;
  readonly carries: (file: string) => boolean;
}

const inHeader = (file: string) => new RegExp(`^tags: \\[.*\\b${TAG}\\b.*\\]$`, "m").test(file);
const atRoot = (file: string) => file.includes(`"tags":["${TAG}"]`);

const KINDS: readonly Kind[] = [
  {
    name: "une note",
    make: async (env) => (await env.bridge.createNote("")).path,
    carries: inHeader,
  },
  {
    name: "un cahier de recherche",
    make: async (env) => (await env.bridge.createResearchNotebook("", "Essai champ cahier")).path,
    carries: inHeader,
  },
  {
    name: "une carte mentale",
    make: async (env) => (await env.bridge.createMindMap("", "Essai champ carte")).path,
    carries: inHeader,
  },
  {
    name: "un canvas",
    make: async (env) => (await env.bridge.createCanvas("", "Essai champ canvas")).path,
    carries: atRoot,
  },
  {
    name: "la fiche d'une entreprise du CRM",
    make: async (env) => {
      const { path } = await env.bridge.createCrm("", "Essai champ CRM");
      const company = await env.bridge.createCrmCompany(path, "Acme");
      return `${path.replace(/\.md$/, "")}/entreprises/${company}.md`;
    },
    carries: inHeader,
  },
];

/** Tape l'étiquette dans le champ et valide par Entrée, comme le clavier. */
function typeTag(): void {
  const input = field();
  if (input === null) throw new Error("champ d'étiquettes absent");
  input.value = TAG;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
}

async function onDisk(env: Env, path: string): Promise<string> {
  return text(await readDisk(`${notesFolder(env)}/${path}`));
}

async function contentScenario(env: Env, trial: Trial, kind: Kind): Promise<void> {
  const path = await kind.make(env);
  env.open(path);
  await until("le champ d'étiquettes", () => (field() === null ? null : true), WAIT);
  const column = find<HTMLElement>(".column");
  const rect = bar() === null ? null : rectOf(bar() as HTMLElement);
  trial.check(
    `${kind.name} : la barre d'étiquettes est sous les onglets, dans la colonne`,
    rect !== null && column !== null && rect.width > 0 && rect.height > 0 && rect.y > 0,
    JSON.stringify(rect),
  );
  trial.check(
    `${kind.name} : le champ et le « + » reçoivent le pointeur`,
    reachable(field()) && reachable(plus()),
    "",
  );
  typeTag();
  const written = await until(
    "l'étiquette écrite sur le disque",
    async () => (kind.carries(await onDisk(env, path)) ? true : null),
    WAIT,
  ).catch(() => null);
  trial.check(
    `${kind.name} : ajouter une étiquette l'écrit dans le fichier`,
    written !== null,
    (await onDisk(env, path)).slice(0, 160),
  );
  const shown = await until(
    "la pastille",
    () => (chips().some((chip) => chip.startsWith(TAG)) ? true : null),
    WAIT,
  ).catch(() => null);
  trial.check(`${kind.name} : la pastille s'affiche avec sa croix`, shown !== null, chips().join());
  find<HTMLButtonElement>(`.column .tag-bar [aria-label="Retirer l'étiquette ${TAG}"]`)?.click();
  const removed = await until(
    "l'étiquette retirée du fichier",
    async () => (kind.carries(await onDisk(env, path)) ? null : true),
    WAIT,
  ).catch(() => null);
  trial.check(
    `${kind.name} : la croix retire l'étiquette du fichier`,
    removed !== null && chips().length === 0,
    chips().join(),
  );
}

export function tagFieldScenarios(env: Env): Scenario[] {
  return [
    {
      name: "champ d'étiquettes sur chaque contenu",
      run: async (trial) => {
        for (const kind of KINDS) await contentScenario(env, trial, kind);
      },
    },
  ];
}
