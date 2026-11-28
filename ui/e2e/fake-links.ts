// Liens simulés pour les parcours : ce qu'on peut lier, et ce que désigne un lien écrit. Version
// simplifiée des règles de Rust (domaine, `links`), qui sont testées côté Rust : le nom d'un
// contenu, `nom.canvas` pour un canvas, `Dossier/nom` pour préciser le dossier.
import type { LinkResolutionItem, LinkableItem } from "../src/bridge";
import { isNotebook } from "./fake-notebook";
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

/**
 * Comme Rust : le texte entier est d'abord un titre ; sinon `#` et des chiffres seuls visent une
 * entrée d'un cahier (`notebook` dit si le contenu en est un).
 */
function withEntry(
  target: string,
  resolveName: (name: string) => LinkResolutionItem,
  notebook: (path: string) => boolean,
): LinkResolutionItem {
  const named = resolveName(target);
  const entry = /^(.*)#(\d+)$/.exec(target.trim());
  if (named.kind !== "missing" || entry === null) return named;
  const base = resolveName(entry[1] ?? "");
  if (base.kind !== "found") return base;
  return notebook(base.path)
    ? { kind: "entry", path: base.path, number: Number(entry[2]) }
    : { kind: "missing" };
}

/** Liens entre notes simplifiés : `[[titre]]`, majuscules et accents ignorés ; `Cahier#0007` compte comme un lien vers le cahier. */
function linkedTitles(content: string, folded: (text: string) => string) {
  return [...content.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g)].flatMap((m) => {
    const target = m[1]?.trim() ?? "";
    return [folded(target), folded(target.replace(/#\d+$/, ""))];
  });
}

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

  const resolveName = (target: string): LinkResolutionItem => {
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

  const resolve = (target: string) =>
    withEntry(target, resolveName, (path) => isNotebook(notes()[path]?.content ?? ""));

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

  const backlinks = ({ path = "" }) => {
    const title = folded(titleOf(notes()[path]?.content ?? "") ?? "");
    return Object.entries(notes())
      .filter(
        ([other, note]) => other !== path && linkedTitles(note.content, folded).includes(title),
      )
      .sort(([, a], [, b]) => b.modified - a.modified)
      .map(([other, note]) => ({
        path: other,
        title: titleOf(note.content) ?? "Sans titre",
        folder: folderOf(other),
      }));
  };

  return {
    list_backlinks: backlinks,
    resolve_links: ({ targets = [] as unknown as string }) =>
      (targets as unknown as string[]).map(resolve),
    list_linkable: linkable,
  };
}
