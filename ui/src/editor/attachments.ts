// Coller ou glisser une image ou un PDF dans la note, et ouvrir une pièce jointe par Cmd+clic.
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type { AttachmentOrigin } from "../bridge";

export interface AttachmentActions {
  /** Joint le fichier à la note ouverte ; rend le lien Markdown à insérer, `null` en cas d'échec. */
  attach(file: File, origin: AttachmentOrigin): Promise<string | null>;
  /** Ouvre la pièce jointe que vise la cible d'un lien de la note. */
  open(target: string): void;
}

const LINKS = new Set(["Link", "Image"]);
const FILES = "Files";

/** La cible du lien ou de l'image qui contient la position `pos`, s'il y en a un. */
export function linkTargetAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && !LINKS.has(node.name)) node = node.parent;
  const url = node?.getChild("URL");
  return url ? state.sliceDoc(url.from, url.to) : null;
}

/**
 * Change à chaque note affichée (l'éditeur remplace tout son état) : un lien qui arrive après
 * un changement de note n'est pas inséré dans la mauvaise.
 */
const shownNote = StateField.define<object>({ create: () => ({}), update: (note) => note });

async function insertLinks(
  view: EditorView,
  files: readonly File[],
  originOf: (file: File) => AttachmentOrigin,
  actions: AttachmentActions,
  at: number,
) {
  const note = view.state.field(shownNote);
  const links: string[] = [];
  for (const file of files) {
    const link = await actions.attach(file, originOf(file));
    if (link !== null) links.push(link);
  }
  if (links.length === 0 || view.state.field(shownNote) !== note) return;
  const from = Math.min(at, view.state.doc.length);
  const insert = links.join("\n");
  view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
}

const filesOf = (list: FileList | null | undefined): File[] => [...(list ?? [])];

/** Un gestionnaire qui rend `true` a traité l'évènement : CodeMirror empêche alors l'action par défaut. */
export function attachments(actions: AttachmentActions): Extension {
  return [
    shownNote,
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = filesOf(event.clipboardData?.files);
        if (files.length === 0) return false;
        const { from, to } = view.state.selection.main;
        view.dispatch({ changes: { from, to } });
        const origin = (file: File): AttachmentOrigin => ({ kind: "pasted", mediaType: file.type });
        void insertLinks(view, files, origin, actions, from);
        return true;
      },
      // Survoler l'éditeur avec des fichiers doit être permis pour pouvoir les y déposer.
      dragover: (event) => event.dataTransfer?.types.includes(FILES) === true,
      drop(event, view) {
        const files = filesOf(event.dataTransfer?.files);
        if (files.length === 0) return false;
        // Lâché hors du texte : à la position la plus proche.
        // Stryker disable next-line BooleanLiteral: dans WebKit, les deux modes donnent alors la position la plus proche.
        const at = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
        const origin = (file: File): AttachmentOrigin => ({ kind: "dropped", fileName: file.name });
        void insertLinks(view, files, origin, actions, at);
        return true;
      },
      mousedown(event, view) {
        if (!event.metaKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        // Stryker disable next-line ConditionalExpression: un clic reçu par l'éditeur a toujours une position ; TypeScript exige le cas contraire.
        const target = pos === null ? null : linkTargetAt(view.state, pos);
        if (target === null) return false;
        actions.open(target);
        return true;
      },
    }),
  ];
}
