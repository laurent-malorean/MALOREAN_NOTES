// Export simulé pour les parcours : la fenêtre d'enregistrement rend un fichier choisi d'avance,
// chaque fichier exporté est gardé en mémoire, chaque impression aussi. Les vraies règles sont testées côté Rust.

type Handler = (args: Record<string, string>) => unknown;

/** La partie de la doublure qui exporte. */
export interface FakeExports {
  notes: Record<string, { content: string }>;
  /** Le fichier que rendra la prochaine fenêtre d'enregistrement ; `null` : l'utilisateur annule ;
   * absent : le nom proposé, dans le dossier où elle s'ouvre. */
  nextExport?: string | null;
  /** Chaque fenêtre d'enregistrement ouverte : le nom proposé et le dossier demandé. */
  saveDialogs: { name: string; folder: string | null }[];
  /** Les fichiers exportés, par emplacement : le texte d'un Markdown, le HTML imprimé d'un PDF. */
  exported: Record<string, string>;
  /** Chaque fenêtre d'impression ouverte : le HTML de la feuille d'impression à ce moment. */
  printed: string[];
}

const sheet = () => document.querySelector(".print-sheet")?.innerHTML ?? "";
const DOCUMENTS = "/Users/moi/Documents";
const EXTENSIONS: Record<string, string> = { pdf: "pdf", markdown: "md" };

export function fakeExport(exports: FakeExports): Record<string, Handler> {
  return {
    choose_export_file: ({ title = "", format = "", folder }) => {
      const name = `${title}.${EXTENSIONS[format] ?? ""}`;
      exports.saveDialogs.push({ name, folder: folder ?? null });
      const path =
        exports.nextExport === undefined ? `${folder ?? DOCUMENTS}/${name}` : exports.nextExport;
      return path === null ? null : { path, folder: path.slice(0, path.lastIndexOf("/")) };
    },
    export_markdown: ({ path = "", destination = "" }) => {
      exports.exported[destination] = exports.notes[path]?.content ?? "";
      return null;
    },
    export_pdf: ({ destination = "" }) => {
      exports.exported[destination] = sheet();
      return null;
    },
    print_page: () => {
      exports.printed.push(sheet());
      return null;
    },
  };
}
