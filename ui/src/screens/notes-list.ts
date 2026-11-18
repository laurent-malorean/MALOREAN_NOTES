import type { NoteListItem } from "../bridge";
import type { Placement } from "../state/columns";
import { showContextMenu } from "./context-menu";
import { COPY_LABEL, noteMenu, openOnClick } from "./note-menu";
import { startDragging, stopDragging } from "./dragging";
import { tagChips } from "./tags-view";

/** Ce que l'utilisateur peut demander depuis la liste des notes. */
export interface NoteActions {
  readonly open: (path: string) => void;
  readonly pin: (path: string) => void;
  readonly unpin: (path: string) => void;
  readonly trash: (path: string) => void;
  /** Ouvrir la note à cet emplacement (menu de la note). */
  readonly place: (path: string, placement: Placement) => void;
  /** Fermer l'onglet de la note dans la colonne active. */
  readonly closeNote: (path: string) => void;
  /** Filtrer la liste par une étiquette de la note. */
  readonly selectTag: (tag: string) => void;
  /** Exporter la note en PDF ou en Markdown. */
  readonly exportNote: (path: string) => void;
  /** Ouvrir la fenêtre d'impression du Mac sur la note mise en forme. */
  readonly printNote: (path: string) => void;
  /** Copier la note en texte mis en forme, pour la coller dans un mail ou un document. */
  readonly copyNote: (path: string) => void;
}

/** Les touches qui placent la note choisie dans la corbeille. */
const TRASH_KEYS = new Set(["Backspace", "Delete"]);

const PIN = "📌";

function pinMark(): HTMLElement {
  const pin = document.createElement("span");
  pin.className = "note-pin";
  pin.setAttribute("aria-label", "Épinglée");
  pin.textContent = PIN;
  return pin;
}

/**
 * Le clic droit propose le menu de la note, puis de l'épingler (ou de la désépingler si elle
 * l'est) et de la placer dans la corbeille ; les touches Effacer et Suppr la placent aussi dans
 * la corbeille.
 */
function offerActions(item: HTMLElement, note: NoteListItem, actions: NoteActions) {
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const pinning = note.pinned
      ? { label: "Désépingler", run: () => actions.unpin(note.path) }
      : { label: "Épingler", run: () => actions.pin(note.path) };
    const trashing = { label: "Placer dans la corbeille", run: () => actions.trash(note.path) };
    const exporting = { label: "Exporter…", run: () => actions.exportNote(note.path) };
    const printing = { label: "Imprimer…", run: () => actions.printNote(note.path) };
    const copying = { label: COPY_LABEL, run: () => actions.copyNote(note.path) };
    const placing = noteMenu({
      place: (placement) => actions.place(note.path, placement),
      close: () => actions.closeNote(note.path),
    });
    showContextMenu(event.clientX, event.clientY, [
      ...placing,
      pinning,
      exporting,
      printing,
      copying,
      trashing,
    ]);
  });
  item.addEventListener("keydown", (event) => {
    if (!TRASH_KEYS.has(event.key)) return;
    event.preventDefault();
    actions.trash(note.path);
  });
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * Affiche la liste des notes, avec les étiquettes de chacune sous sa date (un clic filtre la
 * liste par l'une d'elles) ; un clic ouvre la note (Cmd+clic : dans un nouvel onglet), un clic droit l'épingle, la désépingle ou
 * la place dans la corbeille, et on peut la glisser vers un dossier.
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
      const tags = tagChips(note.tags, actions.selectTag);
      item.append(...(tags ? [heading, date, tags] : [heading, date]));
      openOnClick(item, note.path, actions);
      offerActions(item, note, actions);
      item.draggable = true;
      item.addEventListener("dragstart", () => startDragging({ kind: "note", path: note.path }));
      item.addEventListener("dragend", stopDragging);
      return item;
    }),
  );
}
