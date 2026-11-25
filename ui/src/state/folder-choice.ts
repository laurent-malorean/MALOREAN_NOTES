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

/** Le nom tapé pour un nouveau dossier, sans espaces autour ; `null` s'il est refusé. */
export function newFolderName(typed: string): string | null {
  const name = typed.trim();
  const lower = name.toLowerCase();
  const refused =
    name === "" ||
    name.startsWith(".") ||
    /[/\\\0]/.test(name) ||
    lower.endsWith(ATTACHMENT_SUFFIX) ||
    lower === DEPENDENCY_FOLDER;
  return refused ? null : name;
}
