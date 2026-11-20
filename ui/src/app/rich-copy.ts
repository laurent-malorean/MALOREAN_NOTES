// Copier en texte mis en forme : la note, ou la sélection, dans le presse-papiers du Mac, à la fois
// en HTML aux styles en ligne et en texte brut, prête à coller dans un mail ou un document
// (fiche 0027). Rust pose les deux formats ; l'interface n'a besoin d'aucun geste de l'utilisateur.
import type * as Bridge from "../bridge";
import { noteHtml } from "../rendering/note-html";
import { plainText } from "../rendering/note-text";
import { noteStyles, styledHtml, withEmbeddedImages } from "../rendering/rich-text";
import type { OpenColumns } from "./columns";
import { copyText } from "./note-copy";
import { imageIn } from "./panes";

export interface RichCopyDeps {
  readonly backend: Pick<typeof Bridge, "readNote" | "copyRichText" | "fileAddress">;
  readonly columns: Pick<OpenColumns, "current" | "flushedPath" | "activePane">;
  /** Le dossier de l'espace de travail ouvert, où sont les images des notes. */
  workspacePath(): string;
  /** La feuille d'impression, toujours dans le thème clair : les couleurs de la copie y sont lues. */
  readonly sheet: HTMLElement;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  run(action: Promise<unknown>): void;
}

/** L'image à l'adresse `src` en adresse `data:`, ou rien si elle ne se lit pas comme une image. */
async function imageData(src: string): Promise<string | null> {
  let blob: Blob;
  try {
    blob = await (await fetch(src)).blob();
  } catch {
    return null;
  }
  if (!blob.type.startsWith("image/")) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string | null);
    reader.readAsDataURL(blob);
  });
}

/** Pose `markdown`, écrit dans la note `path`, dans le presse-papiers, puis le dit. */
async function copy(deps: RichCopyDeps, path: string, markdown: string, done: string) {
  const html = await noteHtml(markdown, {
    resolveImage: (src) => imageIn(deps.workspacePath(), path, src, deps.backend.fileAddress),
  });
  const theme = getComputedStyle(deps.sheet);
  const styles = noteStyles((name) => theme.getPropertyValue(name));
  const rich = styledHtml(await withEmbeddedImages(html, imageData), styles);
  await deps.backend.copyRichText(rich, plainText(markdown));
  deps.show(done);
}

/**
 * Copie en texte mis en forme la note `path` (menu d'une note, d'un onglet) ; sans chemin (palette,
 * raccourci), la sélection de la colonne active, ou sa note entière si rien n'est sélectionné.
 */
export function copyNote(deps: RichCopyDeps, path?: string): void {
  copyText(deps, path, (text) =>
    copy(deps, text.path, text.markdown, text.selection ? "Sélection copiée" : "Note copiée"),
  );
}
