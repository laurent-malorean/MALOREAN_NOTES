// Canvas simulés pour les parcours : le fichier est du JSON, que le faux lit et réécrit sans le mettre en
// forme comme Rust. Le format exact (tabulations, ordre des champs, propriétés inconnues) est testé côté Rust.
import type { CanvasFileItem, CanvasItem } from "../src/bridge";

type Handler = (args: Record<string, string>) => unknown;

interface FakeNotes {
  notes: Record<string, { content: string; modified: number }>;
}

const EMPTY = '{\n\t"nodes":[],\n\t"edges":[]\n}';

interface FileCard {
  id: string;
  type: string;
  [key: string]: unknown;
}

const palette: Record<string, string> = {
  "1": "rouge",
  "2": "orange",
  "3": "jaune",
  "4": "vert",
  "5": "turquoise",
  "6": "violet",
};
const hex: Record<string, string> = {
  bleu: "#2563eb",
  rose: "#ec6aa8",
  marron: "#92643a",
  ardoise: "#64748b",
};
const preset = Object.fromEntries(Object.entries(palette).map(([k, v]) => [v, k]));

function sidesOf(from: FileCard, to: FileCard): [string, string] {
  const dx = Number(to.x) + Number(to.width) / 2 - (Number(from.x) + Number(from.width) / 2);
  const dy = Number(to.y) + Number(to.height) / 2 - (Number(from.y) + Number(from.height) / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Ce que Rust rend à l'écran : le canvas du fichier, côtés déduits, couleur de la palette. */
function read(text: string): CanvasItem {
  const file = JSON.parse(text) as { nodes?: FileCard[]; edges?: Record<string, string>[] };
  const nodes = file.nodes ?? [];
  const known = (c?: string) => {
    if (c === undefined) return null;
    return palette[c] ?? Object.keys(hex).find((name) => hex[name] === c.toLowerCase()) ?? null;
  };
  return {
    cards: nodes.map((n) => ({
      ...{
        id: n.id,
        kind: n.type,
        subpath: null,
        background: null,
        backgroundStyle: null,
        extra: [],
      },
      ...{
        text: (n.text as string) ?? null,
        file: (n.file as string) ?? null,
        url: (n.url as string) ?? null,
      },
      ...{ label: (n.label as string) ?? null, color: (n.color as string) ?? null },
      ...{ x: Number(n.x), y: Number(n.y), width: Number(n.width), height: Number(n.height) },
      palette: known(n.color as string | undefined),
    })),
    arrows: (file.edges ?? []).map((e) => {
      const from = nodes.find((n) => n.id === e.fromNode) as FileCard;
      const to = nodes.find((n) => n.id === e.toNode) as FileCard;
      const [a, b] = sidesOf(from, to);
      return {
        ...{ id: e.id ?? "", from: e.fromNode ?? "", to: e.toNode ?? "", extra: [] },
        ...{ fromSide: e.fromSide ?? a, toSide: e.toSide ?? b, label: e.label ?? null },
        ...{ fromEnd: e.fromEnd ?? "none", toEnd: e.toEnd ?? "arrow", color: e.color ?? null },
        palette: known(e.color),
      };
    }),
    extra: [],
  };
}

const colorOf = (item: { color: string | null; palette: string | null }) =>
  item.palette === null ? item.color : (preset[item.palette] ?? hex[item.palette] ?? item.color);

function write(canvas: CanvasItem): string {
  const nodes = canvas.cards.map((c) => ({
    ...{
      id: c.id,
      type: c.kind,
      text: c.text ?? undefined,
      file: c.file ?? undefined,
      url: c.url ?? undefined,
    },
    ...{
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      color: colorOf(c) ?? undefined,
      label: c.label ?? undefined,
    },
  }));
  const edges = canvas.arrows.map((a) => ({
    ...{ id: a.id, fromNode: a.from, fromSide: a.fromSide, toNode: a.to, toSide: a.toSide },
    ...{
      fromEnd: a.fromEnd === "none" ? undefined : a.fromEnd,
      toEnd: a.toEnd === "arrow" ? undefined : a.toEnd,
    },
    ...{ color: colorOf(a) ?? undefined, label: a.label ?? undefined },
  }));
  return JSON.stringify({ nodes, edges }, null, "\t");
}

export function fakeCanvases(
  state: FakeNotes,
  helpers: {
    freeName(folder: string, wanted: string): string;
    slug(title: string): string;
    tick(): number;
  },
): Record<string, Handler> {
  const file = (path: string) => {
    const note = state.notes[path];
    if (!note || !path.endsWith(".canvas")) throw { message: "ce fichier n'est pas un canvas" };
    return note;
  };
  const result = (text: string): CanvasFileItem => ({ canvas: read(text), text });
  return {
    create_canvas: ({ folder = "", title = "" }) => {
      let path = helpers.freeName(folder, helpers.slug(title)).replace(/\.md$/, ".canvas");
      for (let n = 2; path in state.notes; n++)
        path = path.replace(/(-\d+)?\.canvas$/, `-${n}.canvas`);
      state.notes[path] = { content: EMPTY, modified: helpers.tick() };
      return { path };
    },
    read_canvas: ({ path = "" }) => result(file(path).content),
    save_canvas: ({ path = "", canvas }: Record<string, unknown>) => {
      const note = file(path as string);
      const text = write(canvas as CanvasItem);
      if (text !== note.content) {
        note.content = text;
        note.modified = helpers.tick();
      }
      return result(text);
    },
  };
}
