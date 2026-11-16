import type { NoteListItem } from "../bridge";
import { showContextMenu } from "./context-menu";
import { startDragging, stopDragging } from "./dragging";

/** Ce que l'utilisateur peut demander depuis la liste des notes. */
export interface NoteActions {
  readonly open: (path: string) => void;
  readonly pin: (path: string) => void;
  readonly unpin: (path: string) => void;
}

const PIN = "📌";

function pinMark(): HTMLElement {
  const pin = document.createElement("span");
  pin.className = "note-pin";
  pin.setAttribute("aria-label", "Épinglée");
  pin.textContent = PIN;
  return pin;
}

/** Le clic droit propose d'épingler la note, ou de la désépingler si elle l'est. */
function offerPinning(item: HTMLElement, note: NoteListItem, actions: NoteActions) {
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const entry = note.pinned
      ? { label: "Désépingler", run: () => actions.unpin(note.path) }
      : { label: "Épingler", run: () => actions.pin(note.path) };
    showContextMenu(event.clientX, event.clientY, [entry]);
  });
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * Affiche la liste des notes ; un clic ouvre la note, un clic droit l'épingle ou la désépingle,
 * et on peut la glisser vers un dossier.
 */
export function renderNotesList(
  container: HTMLElement,
  notes: readonly NoteListItem[],
  selected: string | null,
  actions: NoteActions,
): void {
  container.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement("button");
      item.className = "note-item";
      item.classList.toggle("selected", note.path === selected);
      const title = document.createElement("span");
      title.className = "note-title";
      title.textContent = note.title;
      const heading = document.createElement("span");
      heading.className = "note-heading";
      heading.append(...(note.pinned ? [pinMark(), title] : [title]));
      const date = document.createElement("span");
      date.className = "note-date";
      date.textContent = dateFormat.format(new Date(note.modified));
      item.append(heading, date);
      item.addEventListener("click", () => actions.open(note.path));
      offerPinning(item, note, actions);
      item.draggable = true;
      item.addEventListener("dragstart", () => startDragging({ kind: "note", path: note.path }));
      item.addEventListener("dragend", stopDragging);
      return item;
    }),
  );
}
