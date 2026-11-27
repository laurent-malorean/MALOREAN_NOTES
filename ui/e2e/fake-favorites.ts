// Favoris simulés pour les parcours (fiche 0102) : la note des favoris de l'espace ouvert, l'étoile d'un contenu.
// Version simplifiée des règles de Rust (domaine, `favorites`) : un favori est une ligne faite d'un seul lien
// `[[nom]]`, avec ou sans marque de liste ; le lien est le titre (ou `nom.canvas`). Les vraies règles sont
// testées côté Rust. Le paramètre d'adresse `favorites` (`Favoris.md`) choisit la note au lancement.

interface FakeNote {
  content: string;
  modified: number;
}

/** Ce que la doublure prête à cette partie : les notes, et de quoi les changer comme le ferait un autre programme. */
export interface FavoritesHelpers {
  notes(): Record<string, FakeNote>;
  titleOf(content: string): string | null;
  freeName(folder: string, wanted: string): string;
  slug(title: string | null): string;
  /** Change (ou crée) une note puis l'annonce par `workspace-changed`, comme la surveillance du dossier. */
  write(path: string, content: string): void;
}

type Handler = (args: Record<string, string>) => unknown;

const LIST_MARK = /^\s*(?:[-*]|\d+\.)?\s*/;
const stemOf = (path: string) => path.replace(/^.*\//, "").replace(/\.(md|canvas)$/, "");
/** L'en-tête d'une note (entre `---`), qui ne compte pas dans les lignes. */
const HEADER = /^---\n(?:.*\n)*?---\n/;

/** Les lignes du corps de la note, fins de ligne comprises ; l'en-tête est à part. */
function split(content: string) {
  const header = HEADER.exec(content)?.[0] ?? "";
  const lines = content.slice(header.length).split(/(?<=\n)/);
  return { header, lines: lines.filter((line) => line !== "") };
}

/** Ce que la doublure sait de la note des favoris : laquelle, et qui y figure. */
function rules(params: URLSearchParams, helpers: FavoritesHelpers) {
  const { notes, titleOf } = helpers;
  let chosen: string | null = params.get("favorites");
  const current = () => (chosen !== null && chosen in notes() ? chosen : null);
  const item = (path: string) => ({
    path,
    title: titleOf(notes()[path]?.content ?? "") ?? stemOf(path),
  });
  const linkOf = (path: string) =>
    path.endsWith(".canvas")
      ? `${stemOf(path)}.canvas`
      : (titleOf(notes()[path]?.content ?? "") ?? stemOf(path));
  const designates = (line: string, path: string) =>
    line.replace(LIST_MARK, "").trim() === `[[${linkOf(path)}]]`;
  const need = () => {
    const note = current();
    if (note === null) throw { message: "Aucune note des favoris n'est choisie." };
    return note;
  };
  const isFavorite = (path: string) => {
    const note = current();
    if (note === null || note === path) return false;
    return split(notes()[note]?.content ?? "").lines.some((line) => designates(line, path));
  };
  const choose = (path: string | null) => void (chosen = path);
  return { current, item, linkOf, designates, need, isFavorite, choose };
}

type Rules = ReturnType<typeof rules>;

/** La note des favoris : la lire, la choisir, la créer, ne plus en avoir. */
function noteHandlers(rule: Rules, helpers: FavoritesHelpers): Record<string, Handler> {
  const { notes, write } = helpers;
  return {
    favorites_note: () => {
      const note = rule.current();
      return note === null ? null : rule.item(note);
    },
    choose_favorites_note: ({ path = "" }) => {
      if (!(path in notes())) throw { message: `la note « ${path} » n'existe pas` };
      rule.choose(path);
      return rule.item(path);
    },
    create_favorites_note: ({ title = "", folder = "" }) => {
      if (title.trim() === "") throw { message: "le titre est vide" };
      const path = helpers.freeName(folder, helpers.slug(title));
      write(path, `# ${title.trim()}\n`);
      rule.choose(path);
      return rule.item(path);
    },
    stop_using_favorites_note: () => (rule.choose(null), null),
  };
}

/** L'étoile : un contenu est-il en favori, l'ajouter, le retirer, annuler le retrait. */
function starHandlers(rule: Rules, helpers: FavoritesHelpers): Record<string, Handler> {
  const { notes, write } = helpers;
  const body = () => split(notes()[rule.need()]?.content ?? "");
  return {
    is_favorite: ({ path = "" }) => rule.isFavorite(path),
    add_favorite: ({ path = "" }) => {
      const note = rule.need();
      if (path === note)
        throw { message: "La note des favoris ne se met pas elle-même en favori." };
      if (!(path in notes())) throw { message: `la note « ${path} » n'existe pas` };
      if (rule.isFavorite(path)) return null;
      const text = notes()[note]?.content ?? "";
      const end = text === "" || text.endsWith("\n") ? "" : "\n";
      write(note, `${text}${end}- [[${rule.linkOf(path)}]]\n`);
      return null;
    },
    remove_favorite: ({ path = "" }) => {
      const { header, lines } = body();
      const found = (text: string) => rule.designates(text, path);
      const removed = lines.flatMap((text, index) => (found(text) ? [{ index, text }] : []));
      if (removed.length > 0) write(rule.need(), header + lines.filter((l) => !found(l)).join(""));
      return removed;
    },
    restore_favorites: ({ removed = [] as unknown as string }) => {
      const { header, lines } = body();
      for (const { index, text } of removed as unknown as { index: number; text: string }[])
        lines.splice(index, 0, text);
      write(rule.need(), header + lines.join(""));
      return null;
    },
  };
}

export function fakeFavorites(
  params: URLSearchParams,
  helpers: FavoritesHelpers,
): Record<string, Handler> {
  const rule = rules(params, helpers);
  return { ...noteHandlers(rule, helpers), ...starHandlers(rule, helpers) };
}
