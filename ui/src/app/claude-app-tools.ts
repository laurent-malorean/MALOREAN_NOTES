// Outils de l'application qui touchent à l'interface (fiche 0040) : quand Claude montre une note,
// elle s'ouvre dans la colonne active ; quand il demande ce que l'utilisateur regarde, la note de
// la colonne active et le texte qui y est sélectionné sont rendus à Rust, à ce moment-là.
import type * as Bridge from "../bridge";
import { activeNote, type Columns } from "../state/columns";

export interface AppToolsDeps {
  readonly backend: Pick<typeof Bridge, "onClaudeShowsNote" | "onClaudeAsksView" | "answerView">;
  /** Les colonnes d'édition, et l'éditeur de la colonne active pour le texte sélectionné. */
  readonly columns: {
    current(): Columns;
    activePane?(): { readonly editor: { selectedText(): string } };
  };
  /** Ouvre une note dans la colonne active. */
  openNote(path: string): void;
  error(error: unknown): void;
}

/** Ce que l'utilisateur regarde : la note de la colonne active, et le texte qui y est sélectionné. */
function view({ columns }: AppToolsDeps) {
  const note = activeNote(columns.current());
  const selection = note === null ? "" : (columns.activePane?.().editor.selectedText() ?? "");
  return { note, selection };
}

export function connectAppTools(deps: AppToolsDeps): void {
  void deps.backend.onClaudeShowsNote((path) => deps.openNote(path));
  void deps.backend.onClaudeAsksView((request) => {
    const { note, selection } = view(deps);
    deps.backend.answerView(request, note, selection).catch(deps.error);
  });
}
