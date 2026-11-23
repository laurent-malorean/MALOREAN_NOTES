// Cartes mentales simulées pour les parcours : le format du fichier (liste à puces, détail en `>`,
// couleur en commentaire, `racines` dans l'en-tête) comme Rust l'écrit. Les vraies règles (retraits
// mêlés, lignes hors format, valeurs par défaut) sont testées côté Rust.
import type { MindMapItem, MindNodeItem } from "../src/bridge";
import { isMindMapContent } from "../src/state/mind-map";

type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

export interface MindMapHelpers {
  freeName(folder: string, wanted: string): string;
  slug(title: string): string;
  tick(): number;
}

/** Le type de contenu que le faux donne à une note, comme l'index de Rust. */
export function fakeContentType(content: string): "researchNotebook" | "mindMap" | "note" {
  if (/^---\n(?:.*\n)*?type: cahier-de-recherche\n(?:.*\n)*?---\n/.test(content))
    return "researchNotebook";
  return isMindMapContent(content) ? "mindMap" : "note";
}

const COLOR = /^(.*?)\s*<!--\s*couleur\s*:\s*(\S+?)\s*-->$/i;

function placesOf(yaml: string): { x: number; y: number }[] {
  const racines = /^racines:\s*\[(.*)\]\s*$/m.exec(yaml)?.[1] ?? "";
  return [...racines.matchAll(/\{x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+)\}/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
}

/** Une puce : le titre sans son commentaire de couleur, la couleur. */
function bulletNode(text: string): MindNodeItem {
  const colored = COLOR.exec(text.trim());
  return {
    title: colored?.[1] ?? text.trim(),
    color: colored?.[2] ?? null,
    detail: [],
    children: [],
  };
}

/** La ligne de détail `> texte` : son texte, ou rien si ce n'en est pas une. */
const detailLine = (rest: string) =>
  rest.startsWith(">") ? [rest.slice(1).replace(/^ /, "")] : [];

type Chain = { indent: number; node: MindNodeItem }[];

/** Le retrait d'une ligne (une tabulation vaut 4 espaces) et le reste de la ligne. */
function indented(line: string): [number, string] {
  const [, spaces = "", rest = ""] = /^([ \t]*)(.*)$/.exec(line) ?? [];
  return [spaces.replaceAll("\t", "    ").length, rest];
}

/** La puce, rangée sous le dernier nœud dont le retrait est plus petit. */
function attach(roots: MindNodeItem[], chain: Chain, indent: number, text: string): void {
  while ((chain.at(-1)?.indent ?? -1) >= indent) chain.pop();
  const node = bulletNode(text);
  (chain.at(-1)?.node.children ?? roots).push(node);
  chain.push({ indent, node });
}

/** Les puces et lignes de détail d'une liste, rangées selon leur retrait. */
function parseList(body: string): MindNodeItem[] {
  const roots: MindNodeItem[] = [];
  const chain: Chain = [];
  for (const line of body.split("\n")) {
    const [indent, rest] = indented(line);
    const bullet = /^[-*+][ \t](.*\S.*)$/.exec(rest)?.[1];
    if (bullet !== undefined) attach(roots, chain, indent, bullet);
    else
      [...chain]
        .reverse()
        .find((c) => c.indent < indent)
        ?.node.detail.push(...detailLine(rest));
  }
  return roots;
}

function parse(content: string): MindMapItem {
  const header = /^---\n([\s\S]*?)\n---\n/.exec(content);
  const roots = parseList(header ? content.slice(header[0].length) : content);
  const given = placesOf(header?.[1] ?? "");
  return { roots, places: roots.map((_, rank) => given[rank] ?? { x: 0, y: rank * 160 }) };
}

const lines = (node: MindNodeItem, depth: number): string[] => {
  const pad = "  ".repeat(depth);
  const color = node.color === null ? "" : ` <!-- couleur: ${node.color} -->`;
  return [
    `${pad}- ${node.title}${color}`,
    ...node.detail.map((line) => (line === "" ? `${pad}  >` : `${pad}  > ${line}`)),
    ...node.children.flatMap((child) => lines(child, depth + 1)),
  ];
};

function written(content: string, map: MindMapItem): string {
  const header = /^---\n([\s\S]*?)\n---\n/.exec(content);
  const yaml = (header?.[1] ?? "").split("\n").filter((line) => !line.startsWith("racines:"));
  if (map.roots.length > 0)
    yaml.push(`racines: [${map.places.map((p) => `{x: ${p.x}, y: ${p.y}}`).join(", ")}]`);
  const title = /^# .*$/m.exec(content.slice(header?.[0].length ?? 0))?.[0];
  const list = map.roots.flatMap((root) => lines(root, 0)).join("\n");
  return `---\n${yaml.join("\n")}\n---\n${title ?? ""}${title ? "\n" : ""}${list ? `\n${list}\n` : ""}`;
}

export function fakeMindMaps(state: FakeNotes, helpers: MindMapHelpers): Record<string, Handler> {
  const map = (path: string) => {
    const note = state.notes[path];
    if (!note || !isMindMapContent(note.content))
      throw { message: "cette note n'est pas une carte mentale" };
    return note;
  };
  return {
    create_mind_map: ({ folder = "", title = "" }) => {
      const path = helpers.freeName(folder, helpers.slug(title));
      const content = `---\ntype: carte-mentale\n---\n# ${title.trim()}\n`;
      state.notes[path] = { content, modified: helpers.tick() };
      return { path };
    },
    read_mind_map: ({ path = "" }) => parse(map(path).content),
    save_mind_map: ({ path = "", map: item }: Record<string, unknown>) => {
      const note = map(path as string);
      note.content = written(note.content, item as MindMapItem);
      note.modified = helpers.tick();
      return null;
    },
  };
}

/** Les nœuds d'une carte qui ont tous les mots cherchés, comme résultats de recherche. */
export function fakeNodeResults(
  path: string,
  content: string,
  has: (text: string) => boolean,
): { title: string; text: string; containerTitle: string; node: string }[] {
  if (!isMindMapContent(content)) return [];
  const mapTitle = /^# (.+)$/m.exec(content)?.[1]?.trim() ?? "Sans titre";
  const found: { title: string; text: string; containerTitle: string; node: string }[] = [];
  const visit = (nodes: MindNodeItem[], above: number[]) =>
    nodes.forEach((node, rank) => {
      const text = `${node.title}\n${node.detail.join("\n")}`;
      if (has(text))
        found.push({
          title: node.title,
          text,
          containerTitle: mapTitle,
          node: [...above, rank].join("."),
        });
      visit(node.children, [...above, rank]);
    });
  visit(parse(content).roots, []);
  return found;
}
