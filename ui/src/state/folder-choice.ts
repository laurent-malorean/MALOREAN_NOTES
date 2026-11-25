// Choix de dossier : la liste des dossiers de l'espace de travail en arborescence, et le nom d'un
// nouveau dossier. Les règles de nom sont celles de Rust (`FolderName`), redites ici pour refuser
// un nom avant de l'enregistrer.
import { folderTree } from "./folders";

/** Une entrée du choix : le chemin du dossier, et ce qu'on en lit (indenté selon sa profondeur). */
export interface FolderChoiceEntry {
  readonly value: string;
  readonly label: string;
}

const INDENT = "  ";
const BRANCH = "⎿ ";
const ATTACHMENT_SUFFIX = ".assets";
const DEPENDENCY_FOLDER = "node_modules";

/** Le nom d'un dossier à sa profondeur : « Notes », « ⎿ Travail », puis un retrait de plus par niveau. */
export function folderLabel(path: string): string {
  const [entry] = folderTree([path]);
  const { name, depth } = entry as NonNullable<typeof entry>;
  return depth === 1 ? name : `${INDENT.repeat(depth - 2)}${BRANCH}${name}`;
}

/**
 * Les dossiers de l'espace de travail, dans l'ordre de l'arbre ; le choix en cours en plus, à la fin
 * et sous son chemin entier, quand il n'en fait pas (dossier du journal pas encore créé, dossier disparu).
 */
export function folderChoices(
  folders: readonly string[],
  current: string | null,
): FolderChoiceEntry[] {
  const entries = folders.map((path) => ({ value: path, label: folderLabel(path) }));
  const missing = current !== null && current !== "" && !folders.includes(current);
  return missing ? [...entries, { value: current, label: current }] : entries;
}

/** Le nom d'un seul dossier est-il accepté ? (déjà sans espaces autour) */
function folderNameAccepted(name: string): boolean {
  const lower = name.toLowerCase();
  return !(
    name === "" ||
    name.startsWith(".") ||
    /[\\\0]/.test(name) ||
    lower.endsWith(ATTACHMENT_SUFFIX) ||
    lower === DEPENDENCY_FOLDER
  );
}

/**
 * Le chemin tapé pour un nouveau dossier : un nom (« Carnet ») ou des noms séparés par « / »
 * (« Perso/Carnet »), sans espaces autour des noms ni « / » au début et à la fin ; `null` si l'un
 * des noms est refusé.
 */
export function newFolderPath(typed: string): string | null {
  const names = typed
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((name) => name.trim());
  return names.every(folderNameAccepted) ? names.join("/") : null;
}
