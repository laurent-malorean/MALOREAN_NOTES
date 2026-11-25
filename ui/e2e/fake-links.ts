// Liens simulés pour les parcours : ce qu'on peut lier, et ce que désigne un lien écrit. Version
// simplifiée des règles de Rust (domaine, `links`), qui sont testées côté Rust : le nom d'un
// contenu, `nom.canvas` pour un canvas, `Dossier/nom` pour préciser le dossier.
import type { LinkResolutionItem, LinkableItem } from "../src/bridge";
import { fakeContentType } from "./fake-mind-map";

interface FakeNote {
  content: string;
  modified: number;
}

/** Ce que la doublure prête à cette partie : les notes et ses petites fonctions. */
export interface LinkHelpers {
  notes(): Record<string, FakeNote>;
  titleOf(content: string): string | null;
  folded(text: string): string;
  folderOf(path: string): string;
}

type Handler = (args: Record<string, string>) => unknown;

const isCanvas = (path: string) => path.endsWith(".canvas");
const stemOf = (path: string) => path.replace(/^.*\//, "").replace(/\.(md|canvas)$/, "");

export function fakeLinks(helpers: LinkHelpers): Record<string, Handler> {
  const { notes, titleOf, folded, folderOf } = helpers;
  /** Le nom qu'on écrit dans un lien : le titre, ou `nom.canvas`. */
  const nameOf = (path: string) =>
    isCanvas(path)
      ? `${stemOf(path)}.canvas`
      : (titleOf(notes()[path]?.content ?? "") ?? stemOf(path));
  const recentFirst = () => Object.entries(notes()).sort(([, a], [, b]) => b.modified - a.modified);
  const sameName = (path: string, name: string) =>
    folded(nameOf(path)).trim() === folded(name).trim();

  const resolve = (target: string): LinkResolutionItem => {
    const slash = target.lastIndexOf("/");
    const folder = slash === -1 ? null : target.slice(0, slash).trim();
    const name = slash === -1 ? target : target.slice(slash + 1);
    const paths = recentFirst()
      .map(([path]) => path)
      .filter(
        (path) =>
          sameName(path, name) && (folder === null || folded(folderOf(path)) === folded(folder)),
      );
    if (paths.length === 0) return { kind: "missing" };
    const [only] = paths;
    return paths.length === 1 && only !== undefined
      ? { kind: "found", path: only }
      : { kind: "ambiguous", paths };
  };

  const linkable = (): LinkableItem[] =>
    recentFirst().map(([path, note]) => {
      const written = nameOf(path);
      const twins = recentFirst().filter(([other]) => sameName(other, written));
      return {
        path,
        title: isCanvas(path) ? stemOf(path) : (titleOf(note.content) ?? "Sans titre"),
        folder: folderOf(path),
        contentType: isCanvas(path) ? "canvas" : fakeContentType(note.content),
        link: twins.length > 1 ? `${folderOf(path)}/${written}` : written,
      };
    });

  return {
    resolve_links: ({ targets = [] as unknown as string }) =>
      (targets as unknown as string[]).map(resolve),
    list_linkable: linkable,
  };
}
