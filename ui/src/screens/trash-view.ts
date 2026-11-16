// La corbeille, montrée à la place des notes : chaque élément avec son emplacement d'origine
// et de quoi le restaurer ; la vider demande une confirmation, car c'est définitif.
import type { TrashInfo } from "../bridge";
import { nameOf, parentOf } from "../state/folders";

/** Ce que l'utilisateur peut demander depuis la corbeille. */
export interface TrashActions {
  readonly restoreNote: (path: string) => void;
  readonly restoreFolder: (path: string) => void;
  readonly empty: () => void;
}

const EMPTY = "La corbeille est vide";
const PLACE_SEPARATOR = " / ";

/** L'emplacement d'origine d'un élément rangé dans `folder`, depuis la bibliothèque. */
function origin(libraryName: string, folder: string): string {
  return [libraryName, ...(folder ? folder.split("/") : [])].join(PLACE_SEPARATOR);
}

function row(kind: "note" | "folder", label: string, place: string, restore: () => void) {
  const element = document.createElement("div");
  element.className = `trash-row trash-${kind}`;
  const text = document.createElement("span");
  text.className = "trash-text";
  const name = document.createElement("span");
  name.className = "trash-label";
  name.textContent = label;
  const where = document.createElement("span");
  where.className = "trash-origin";
  where.textContent = place;
  text.append(name, where);
  const button = document.createElement("button");
  button.className = "link";
  button.textContent = "Restaurer";
  button.addEventListener("click", restore);
  element.append(text, button);
  return element;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** « Vider la corbeille », puis une confirmation : seule action qu'on ne peut pas annuler. */
function emptyButton(empty: () => void): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "trash-header";
  const ask = () => {
    const confirm = document.createElement("div");
    confirm.className = "trash-confirm";
    const question = document.createElement("span");
    question.textContent = "Supprimer définitivement tout ce que contient la corbeille ?";
    confirm.append(
      question,
      button("Vider définitivement", "danger", empty),
      button("Annuler", "link", idle),
    );
    bar.replaceChildren(confirm);
  };
  const idle = () => bar.replaceChildren(button("Vider la corbeille", "link", ask));
  idle();
  return bar;
}

/** Affiche la corbeille : les notes de la racine, puis chaque dossier suivi de ses notes. */
export function renderTrash(
  container: HTMLElement,
  libraryName: string,
  trash: TrashInfo,
  actions: TrashActions,
): void {
  if (trash.folders.length === 0 && trash.notes.length === 0) {
    const message = document.createElement("p");
    message.className = "search-message";
    message.textContent = EMPTY;
    return container.replaceChildren(message);
  }
  const notesIn = (folder: string) =>
    trash.notes
      .filter((note) => parentOf(note.path) === folder)
      .map((note) =>
        row("note", note.title, origin(libraryName, folder), () => actions.restoreNote(note.path)),
      );
  container.replaceChildren(
    emptyButton(actions.empty),
    ...notesIn(""),
    ...trash.folders.flatMap((folder) => [
      row("folder", nameOf(folder), origin(libraryName, parentOf(folder)), () =>
        actions.restoreFolder(folder),
      ),
      ...notesIn(folder),
    ]),
  );
}
