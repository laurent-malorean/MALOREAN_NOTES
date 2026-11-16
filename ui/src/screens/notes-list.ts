import type { NoteListItem } from "../bridge";
import { startDragging, stopDragging } from "./dragging";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Affiche la liste des notes ; un clic ouvre la note, qu'on peut aussi glisser vers un dossier. */
export function renderNotesList(
  container: HTMLElement,
  notes: readonly NoteListItem[],
  selected: string | null,
  onOpen: (path: string) => void,
): void {
  container.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement("button");
      item.className = "note-item";
      item.classList.toggle("selected", note.path === selected);
      const title = document.createElement("span");
      title.className = "note-title";
      title.textContent = note.title;
      const date = document.createElement("span");
      date.className = "note-date";
      date.textContent = dateFormat.format(new Date(note.modified));
      item.append(title, date);
      item.addEventListener("click", () => onOpen(note.path));
      item.draggable = true;
      item.addEventListener("dragstart", () => startDragging({ kind: "note", path: note.path }));
      item.addEventListener("dragend", stopDragging);
      return item;
    }),
  );
}
