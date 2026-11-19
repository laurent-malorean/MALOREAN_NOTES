// Coller ou glisser une image ou un PDF dans la note ; ouvrir la cible d'un lien Markdown (pièce
// jointe, adresse web) par un clic sur son texte, ou un Cmd+clic.
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type { AttachmentOrigin } from "../bridge";
import { type LinkFinder, linkClicks } from "./links/link-click";

export interface AttachmentActions {
  /** Joint le fichier à la note ouverte ; rend le lien Markdown à insérer, `null` en cas d'échec. */
  attach(file: File, origin: AttachmentOrigin): Promise<string | null>;
  /** Ouvre ce que vise la cible d'un lien de la note : pièce jointe ou adresse web. */
  open(target: string): void;
}

const LINKS = new Set(["Link", "Image"]);
const FILES = "Files";
const URL = "URL";
const LINK_TEXT_END = "]";
/** Ce dont l'adresse n'est pas le texte montré : un lien, une image, la définition d'une référence. */
const AROUND_ADDRESS = new Set([...LINKS, "LinkReference"]);

/** La cible du lien ou de l'image qui contient la position `pos`, s'il y en a un. */
export function linkTargetAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && !LINKS.has(node.name)) node = node.parent;
  const url = node?.getChild(URL);
  return url ? state.sliceDoc(url.from, url.to) : null;
}

/** Le texte montré d'un lien Markdown, ou d'une adresse écrite telle quelle (ou entre `<…>`), et sa cible. */
function clickable(state: EditorState, node: SyntaxNode) {
  // Stryker disable next-line OptionalChaining,StringLiteral: une adresse est toujours dans un paragraphe ou un lien ; TypeScript exige le cas contraire.
  if (node.name === URL && !AROUND_ADDRESS.has(node.parent?.name ?? ""))
    return { from: node.from, to: node.to, target: state.sliceDoc(node.from, node.to) };
  const url = node.getChild(URL);
  if (url === null || node.name !== "Link") return null;
  const target = state.sliceDoc(url.from, url.to);
  // Un lien qui a une adresse a toujours son `]` : son texte va de `[` à lui.
  const textEnd = node
    .getChildren("LinkMark")
    .find((mark) => state.sliceDoc(mark.from, mark.to) === LINK_TEXT_END) as SyntaxNode;
  return { from: node.from + 1, to: textEnd.from, target };
}

/**
 * Le lien Markdown qui contient ou touche la position `pos` : son texte montré (pas son adresse),
 * ou l'adresse elle-même si elle est écrite telle quelle, ouvre sa cible par `open`. Une image
 * ne s'ouvre pas ainsi.
 */
export function markdownLinkFinder(open: (target: string) => void): LinkFinder {
  return (state, pos) => {
    for (const side of [1, -1] as const) {
      for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); node;) {
        const found = clickable(state, node);
        if (found) return [{ from: found.from, to: found.to, open: () => open(found.target) }];
        node = node.parent;
      }
    }
    return [];
  };
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
    linkClicks(markdownLinkFinder((target) => actions.open(target))),
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
