import type { Screen } from "../state/screen";
import type { Layout } from "./layout";
import { renderNotesList } from "./notes-list";

/** Met la fenêtre en accord avec l'état de l'écran ; chaque cas est traité. */
export function renderScreen(
  layout: Layout,
  screen: Screen,
  onOpen: (fileName: string) => void,
): void {
  switch (screen.kind) {
    case "welcome":
      layout.welcome.hidden = false;
      layout.workspace.hidden = true;
      return;
    case "library":
      layout.welcome.hidden = true;
      layout.workspace.hidden = false;
      layout.libraryName.textContent = screen.library.name;
      renderNotesList(layout.notesList, screen.notes, screen.selected, onOpen);
      return;
    /* istanbul ignore next -- cas impossible : le compilateur vérifie que tous les cas sont traités */
    default: {
      const unhandled: never = screen;
      return unhandled;
    }
  }
}
