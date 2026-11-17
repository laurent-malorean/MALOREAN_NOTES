// Liens entrants : sous le texte, les notes qui pointent vers la note ouverte ; un clic en ouvre une.
import type { LinkingNoteItem } from "../bridge";

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function entry(note: LinkingNoteItem, open: (path: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "backlink";
  button.append(span("backlink-title", note.title));
  if (note.folder) button.append(span("backlink-folder", note.folder));
  button.addEventListener("click", () => open(note.path));
  return button;
}

/** Montre les liens entrants ; caché s'il n'y en a aucun. */
export function renderBacklinks(
  container: HTMLElement,
  notes: readonly LinkingNoteItem[],
  open: (path: string) => void,
): void {
  container.hidden = notes.length === 0;
  if (notes.length === 0) return container.replaceChildren();
  const title = document.createElement("h2");
  title.className = "backlinks-title";
  title.textContent = "Liens entrants";
  container.replaceChildren(title, ...notes.map((note) => entry(note, open)));
}
