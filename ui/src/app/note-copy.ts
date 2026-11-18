// Ce que copie une copie de note, quel que soit son format (fiche 0027) : depuis un menu, la note
// cliquée, enregistrée puis relue ; depuis la palette ou un raccourci, la sélection de la colonne
// active, ou sa note entière si rien n'y est sélectionné. Copier en Markdown pose ce texte tel quel.
import type * as Bridge from "../bridge";
import { activeNote } from "../state/columns";
import type { OpenColumns } from "./columns";

/** Le texte Markdown à copier, écrit dans la note `path` : la note entière ou une sélection. */
export interface CopiedText {
  readonly path: string;
  readonly markdown: string;
  readonly selection: boolean;
}

export interface NoteCopyDeps {
  readonly backend: Pick<typeof Bridge, "readNote">;
  readonly columns: Pick<OpenColumns, "current" | "flushedPath" | "activePane">;
  run(action: Promise<unknown>): void;
}

export interface MarkdownCopyDeps extends NoteCopyDeps {
  readonly backend: Pick<typeof Bridge, "readNote" | "copyPlainText">;
  /** Montre un message quelques secondes. */
  show(message: string): void;
}

async function wholeNote(deps: NoteCopyDeps, path: string): Promise<CopiedText> {
  const note = await deps.backend.readNote(await deps.columns.flushedPath(path));
  return { path: note.path, markdown: note.content, selection: false };
}

/**
 * Donne à `copy` la note `path` entière (menu d'une note, d'un onglet) ; sans chemin (palette,
 * raccourci), la sélection de la colonne active, ou sa note entière ; rien sans note active.
 */
export function copyText(
  deps: NoteCopyDeps,
  path: string | undefined,
  copy: (text: CopiedText) => Promise<void>,
): void {
  if (path !== undefined) return deps.run(wholeNote(deps, path).then(copy));
  const shown = activeNote(deps.columns.current());
  if (shown === null) return;
  const selection = deps.columns.activePane().editor.selectedText();
  deps.run(
    selection === ""
      ? wholeNote(deps, shown).then(copy)
      : copy({ path: shown, markdown: selection, selection: true }),
  );
}

/** Copie en texte brut le texte Markdown de la note `path`, ou de la sélection, tel quel. */
export function copyMarkdown(deps: MarkdownCopyDeps, path?: string): void {
  copyText(deps, path, async ({ markdown, selection }) => {
    await deps.backend.copyPlainText(markdown);
    deps.show(selection ? "Sélection copiée" : "Markdown copié");
  });
}
