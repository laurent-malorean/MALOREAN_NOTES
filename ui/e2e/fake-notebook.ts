// Cahiers de recherche simulés pour les parcours : toutes les entrées au moment figé de la doublure
// (lundi 16 novembre 2026 à 18:30). Les vraies règles (titres d'année, de mois et de jour, retrait,
// ancres, index) sont testées côté Rust.

type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

/** Ce que la doublure prête à cette partie : nommer un fichier libre, avancer l'horloge. */
export interface NotebookHelpers {
  freeName(folder: string, wanted: string): string;
  slug(title: string): string;
  tick(): number;
}

const HEADINGS = "## 2026\n\n### Novembre\n\n#### Lundi 16";
const MOMENT = "2026-11-16-18h30";
const LABEL = "16 novembre 2026 à 18:30";
const TIME = "18:30";

/** Comme Rust, mais seulement sous la forme `type: cahier-de-recherche`. */
export const isNotebook = (content: string) =>
  /^---\n(?:.*\n)*?type: cahier-de-recherche\n(?:.*\n)*?---\n/.test(content);

const titleOf = (content: string) => /^# (.+)$/m.exec(content)?.[1]?.trim() ?? "Sans titre";

interface FakeEntry {
  anchor: string;
  label: string;
  text: string;
  line: number;
}

/** Les entrées : chaque `- HH:MM - texte`, ses lignes en retrait à la suite. */
export function fakeEntries(content: string): FakeEntry[] {
  const entries: FakeEntry[] = [];
  content.split("\n").forEach((line, index) => {
    const first = /^- \d\d:\d\d - (.*)$/.exec(line);
    const last = entries.at(-1);
    if (first) {
      const rank = entries.length + 1;
      const anchor = rank === 1 ? MOMENT : `${MOMENT}-${rank}`;
      entries.push({ anchor, label: LABEL, text: first[1] ?? "", line: index });
    } else if (last && /^ {2}/.test(line)) last.text += `\n${line.slice(2)}`;
  });
  return entries;
}

function appended(content: string, text: string): string {
  const lines = text
    .trim()
    .split("\n")
    .map((line, index) => (index === 0 ? `- ${TIME} - ${line}` : line ? `  ${line}` : ""));
  const base = content.replace(/\n+$/, "");
  const before = content.includes(HEADINGS) ? "\n" : `\n\n${HEADINGS}\n\n`;
  return `${base}${before}${lines.join("\n")}\n`;
}

export function fakeNotebook(state: FakeNotes, helpers: NotebookHelpers): Record<string, Handler> {
  const notebook = (path: string) => {
    const note = state.notes[path];
    if (!note || !isNotebook(note.content))
      throw { message: "cette note n'est pas un cahier de recherche" };
    return note;
  };
  return {
    create_research_notebook: ({ folder = "", title = "" }) => {
      const path = helpers.freeName(folder, helpers.slug(title));
      const content = `---\ntype: cahier-de-recherche\n---\n# ${title.trim()}\n`;
      state.notes[path] = { content, modified: helpers.tick() };
      return { path };
    },
    add_entry: ({ path = "", text = "", corrected }) => {
      const note = notebook(path);
      if (!text.trim()) throw { message: "l'entrée est vide" };
      const target = fakeEntries(note.content).find((entry) => entry.anchor === corrected);
      const written = target
        ? `Correction de [l'entrée du ${target.label}](#${target.anchor}) : ${text.trim()}`
        : text;
      state.notes[path] = { content: appended(note.content, written), modified: helpers.tick() };
      return fakeEntries(state.notes[path].content).at(-1);
    },
    list_research_notebooks: () =>
      Object.entries(state.notes)
        .filter(([, note]) => isNotebook(note.content))
        .map(([path, note]) => ({
          path,
          title: titleOf(note.content),
          folder: path.slice(0, Math.max(path.lastIndexOf("/"), 0)),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "fr")),
    list_entries: ({ path = "" }) => fakeEntries(notebook(path).content),
  };
}

/** Les entrées d'un cahier qui ont tous les mots cherchés, comme résultats de recherche. */
export function fakeEntryResults(
  path: string,
  content: string,
  has: (text: string) => boolean,
): { title: string; text: string; containerTitle: string }[] {
  if (!isNotebook(content)) return [];
  return fakeEntries(content)
    .filter((entry) => has(entry.text))
    .map((entry) => ({ title: entry.label, text: entry.text, containerTitle: titleOf(content) }));
}
