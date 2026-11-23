// Notes proches : sous le texte, à la suite des liens entrants, les notes dont le sens ressemble à celui de la note ouverte ; un clic en ouvre une.
import type { NoteListItem } from "../bridge";
import { folderOf } from "../state/folders";

const TITLE = "Notes proches";
const NONE = "Aucune note proche (le sens n'est pas encore calculé)";

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function entry(note: NoteListItem, open: (path: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "backlink";
  button.append(span("backlink-title", note.title));
  const folder = folderOf(note.path);
  if (folder) button.append(span("backlink-folder", folder));
  button.addEventListener("click", () => open(note.path));
  return button;
}

/**
 * Montre les notes proches ; `null` : la liste est masquée. Une liste vide le dit, et dit pourquoi
 * elle peut l'être.
 */
export function renderRelatedNotes(
  container: HTMLElement,
  notes: readonly NoteListItem[] | null,
  open: (path: string) => void,
): void {
  container.hidden = notes === null;
  if (notes === null) return container.replaceChildren();
  const title = document.createElement("h2");
  title.className = "backlinks-title";
  title.textContent = TITLE;
  const items =
    notes.length === 0 ? [span("related-none", NONE)] : notes.map((n) => entry(n, open));
  container.replaceChildren(title, ...items);
}
