// Les étiquettes d'un contenu simulées pour les parcours : lire et changer celles d'une note (l'en-tête,
// seulement sous la forme `tags: [a, b]`) ou d'un canvas (la propriété `tags` de la racine du fichier).
// Doublure simple ; les vraies règles (formes de liste, propriétés gardées) sont testées côté Rust.
type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

const HEADER = /^---\n((?:.*\n)*?)---\n/;
const TAGS_LINE = /^tags: \[.*\]\n/m;

/** Les étiquettes écrites : sans espaces autour ni `#` de tête, sans les vides ni les doublons (la casse ne compte pas). */
function written(tags: readonly string[]): string[] {
  const kept: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#/, "").trim();
    if (tag === "" || /[,[\]{}:"'\n]/.test(tag)) continue;
    if (!kept.some((known) => known.toLowerCase() === tag.toLowerCase())) kept.push(tag);
  }
  return kept;
}

function retagged(content: string, tags: readonly string[]): string {
  const line = tags.length === 0 ? "" : `tags: [${tags.join(", ")}]\n`;
  const header = HEADER.exec(content);
  if (header === null) return line === "" ? content : `---\n${line}---\n${content}`;
  const inside = header[1] ?? "";
  const next = TAGS_LINE.test(inside) ? inside.replace(TAGS_LINE, line) : `${inside}${line}`;
  return next === ""
    ? content.slice(header[0].length)
    : `---\n${next}---\n${content.slice(header[0].length)}`;
}

export function fakeTags(
  backend: FakeNotes,
  tools: { tagsOf: (content: string) => string[]; tick: () => number },
): Record<string, Handler> {
  const noteOf = (path: string) => {
    const note = backend.notes[path];
    if (!note) throw { message: `la note « ${path} » n'existe pas` };
    return note;
  };
  const read = (path: string, content: string) =>
    path.endsWith(".canvas")
      ? ((JSON.parse(content) as { tags?: string[] }).tags ?? [])
      : tools.tagsOf(content);
  return {
    note_tags: ({ path = "" }) => read(path, noteOf(path).content),
    change_note_tags: (args) => {
      const path = args.path ?? "";
      const note = noteOf(path);
      const tags = written((args.tags as unknown as string[]) ?? []);
      if (path.endsWith(".canvas")) {
        const parsed = JSON.parse(note.content) as Record<string, unknown>;
        const rest = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "tags"));
        note.content = JSON.stringify(tags.length === 0 ? rest : { ...rest, tags }, null, "\t");
      } else note.content = retagged(note.content, tags);
      note.modified = tools.tick();
      return tags;
    },
  };
}
