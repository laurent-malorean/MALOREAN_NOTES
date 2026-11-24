// Canvas (fiche 0052, spécification canvas-comportement.md) : le canvas comme l'écran le tient, et ses
// changements. Des fonctions pures : chaque changement rend un nouveau canvas, jamais le même modifié.
import type { CanvasArrowItem, CanvasCardItem, CanvasItem } from "../bridge";
import type { Rect } from "./mind-map-viewport";

export type Side = "top" | "right" | "bottom" | "left";
/** Une carte ou une flèche : ce qu'on sélectionne. */
export type Selectable = { readonly kind: "card" | "arrow"; readonly id: string };

/** La taille d'une carte texte neuve : celle d'Obsidian (spécification canvas.md § 4.1). */
export const TEXT_SIZE = { width: 250, height: 60 };
/** La taille d'une carte de note, de média ou de page web neuve : celle des exemples de canvas.md. */
export const FILE_SIZE = { width: 400, height: 300 };
/** La taille d'un groupe neuf. */
export const GROUP_SIZE = { width: 400, height: 300 };
/** Le côté du carré qui entoure les cartes d'un groupe créé à partir d'une sélection. */
export const GROUP_MARGIN = 20;

/** Un identifiant au format d'Obsidian : 16 caractères hexadécimaux minuscules. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const rectOf = (card: CanvasCardItem): Rect => ({
  x: card.x,
  y: card.y,
  w: card.width,
  h: card.height,
});

export const card = (canvas: CanvasItem, id: string) => canvas.cards.find((c) => c.id === id);
export const arrow = (canvas: CanvasItem, id: string) => canvas.arrows.find((a) => a.id === id);
export const isGroup = (c: CanvasCardItem) => c.kind === "group";

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Les cartes qui font partie du groupe : celles qui sont entièrement dans son cadre. */
export function members(canvas: CanvasItem, groupId: string): CanvasCardItem[] {
  const group = card(canvas, groupId);
  if (group === undefined || !isGroup(group)) return [];
  const frame = rectOf(group);
  return canvas.cards.filter((c) => c.id !== groupId && inside(frame, rectOf(c)));
}

/** Les identifiants de ces cartes et de celles des groupes parmi elles (déplacés avec leur groupe). */
export function withMembers(canvas: CanvasItem, ids: readonly string[]): string[] {
  const all = new Set(ids);
  for (const id of ids) for (const m of members(canvas, id)) all.add(m.id);
  return [...all];
}

/** Le plus petit rectangle qui contient ces rectangles ; `null` s'il n'y en a pas. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

const base = (id: string, x: number, y: number, size: { width: number; height: number }) => ({
  id,
  text: null,
  file: null,
  subpath: null,
  url: null,
  label: null,
  background: null,
  backgroundStyle: null,
  x: Math.round(x),
  y: Math.round(y),
  width: size.width,
  height: size.height,
  color: null,
  palette: null,
  extra: [],
});

/** Une carte texte neuve dont le coin haut gauche est en `x`, `y`. */
export const newTextCard = (x: number, y: number, text = ""): CanvasCardItem => ({
  ...base(newId(), x, y, TEXT_SIZE),
  kind: "text",
  text,
});

/** Une carte de note ou de média neuve. */
export const newFileCard = (x: number, y: number, file: string): CanvasCardItem => ({
  ...base(newId(), x, y, FILE_SIZE),
  kind: "file",
  file,
});

/** Une carte de page web neuve. */
export const newLinkCard = (x: number, y: number, url: string): CanvasCardItem => ({
  ...base(newId(), x, y, FILE_SIZE),
  kind: "link",
  url,
});

/** Un groupe neuf, vide. */
export const newGroup = (x: number, y: number): CanvasCardItem => ({
  ...base(newId(), x, y, GROUP_SIZE),
  kind: "group",
});

/** Ajoute la carte ; un groupe passe en tête, sous le reste (spécification canvas.md § 2). */
export function withCard(canvas: CanvasItem, added: CanvasCardItem): CanvasItem {
  const cards = isGroup(added) ? [added, ...canvas.cards] : [...canvas.cards, added];
  return { ...canvas, cards };
}

/** Le canvas sans ces cartes ni les flèches qui y touchent. */
export function withoutCards(canvas: CanvasItem, ids: readonly string[]): CanvasItem {
  const gone = new Set(ids);
  return {
    ...canvas,
    cards: canvas.cards.filter((c) => !gone.has(c.id)),
    arrows: canvas.arrows.filter((a) => !gone.has(a.from) && !gone.has(a.to)),
  };
}

export const withoutArrows = (canvas: CanvasItem, ids: readonly string[]): CanvasItem => ({
  ...canvas,
  arrows: canvas.arrows.filter((a) => !ids.includes(a.id)),
});

/** La carte changée : ses champs remplacés par `patch`. */
export function withCardChanged(
  canvas: CanvasItem,
  id: string,
  patch: Partial<CanvasCardItem>,
): CanvasItem {
  return { ...canvas, cards: canvas.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** La flèche changée : ses champs remplacés par `patch`. */
export function withArrowChanged(
  canvas: CanvasItem,
  id: string,
  patch: Partial<CanvasArrowItem>,
): CanvasItem {
  return { ...canvas, arrows: canvas.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

/** Ces cartes déplacées de `dx`, `dy` (en nombres entiers). */
export function moved(
  canvas: CanvasItem,
  ids: readonly string[],
  dx: number,
  dy: number,
): CanvasItem {
  const set = new Set(ids);
  return {
    ...canvas,
    cards: canvas.cards.map((c) =>
      set.has(c.id) ? { ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) } : c,
    ),
  };
}

/** Ces cartes passées au premier plan, dans leur ordre (un groupe reste sous les autres, § 7.3). */
export function broughtToFront(canvas: CanvasItem, ids: readonly string[]): CanvasItem {
  const set = new Set(ids);
  const rest = canvas.cards.filter((c) => !set.has(c.id));
  const front = canvas.cards.filter((c) => set.has(c.id));
  return { ...canvas, cards: [...rest, ...front] };
}

/** La même couleur de la palette (ou aucune) pour ces cartes et flèches. */
export function colored(
  canvas: CanvasItem,
  selection: readonly Selectable[],
  palette: string | null,
): CanvasItem {
  const has = (kind: Selectable["kind"], id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);
  const paint = <T extends { id: string; color: string | null; palette: string | null }>(
    kind: Selectable["kind"],
    item: T,
  ): T => (has(kind, item.id) ? { ...item, palette, color: null } : item);
  return {
    ...canvas,
    cards: canvas.cards.map((c) => paint("card", c)),
    arrows: canvas.arrows.map((a) => paint("arrow", a)),
  };
}

/** Une flèche neuve entre deux cartes : une pointe à l'arrivée (le défaut du format). */
export function withArrow(
  canvas: CanvasItem,
  from: { id: string; side: Side },
  to: { id: string; side: Side },
): { canvas: CanvasItem; id: string } {
  const id = newId();
  const added: CanvasArrowItem = {
    id,
    from: from.id,
    fromSide: from.side,
    fromEnd: "none",
    to: to.id,
    toSide: to.side,
    toEnd: "arrow",
    color: null,
    palette: null,
    label: null,
    extra: [],
  };
  return { canvas: { ...canvas, arrows: [...canvas.arrows, added] }, id };
}

/** Le sens d'une flèche : non directionnel, unidirectionnel (vers la seconde carte), bidirectionnel. */
export type Sense = "none" | "single" | "both";

const ENDS: Record<Sense, { fromEnd: string; toEnd: string }> = {
  none: { fromEnd: "none", toEnd: "none" },
  single: { fromEnd: "none", toEnd: "arrow" },
  both: { fromEnd: "arrow", toEnd: "arrow" },
};

/** Le sens d'une flèche ; `null` pour une pointe au seul départ, que le format permet mais pas le menu. */
export function senseOf(a: CanvasArrowItem): Sense | null {
  const found = (Object.keys(ENDS) as Sense[]).find(
    (s) => ENDS[s].fromEnd === a.fromEnd && ENDS[s].toEnd === a.toEnd,
  );
  return found ?? null;
}

export const withSense = (canvas: CanvasItem, id: string, sense: Sense): CanvasItem =>
  withArrowChanged(canvas, id, ENDS[sense]);

/** Un groupe qui entoure ces cartes (avec une marge), placé sous elles. */
export function withGroupAround(
  canvas: CanvasItem,
  ids: readonly string[],
): { canvas: CanvasItem; id: string } {
  const frame = boundsOf(ids.flatMap((id) => card(canvas, id) ?? []).map(rectOf));
  const group = newGroup(0, 0);
  const placed: CanvasCardItem =
    frame === null
      ? group
      : {
          ...group,
          x: frame.x - GROUP_MARGIN,
          y: frame.y - GROUP_MARGIN,
          width: frame.w + 2 * GROUP_MARGIN,
          height: frame.h + 2 * GROUP_MARGIN,
        };
  return { canvas: withCard(canvas, placed), id: placed.id };
}

/** Le texte de la barre de titre d'une carte : son nom (note ou média) ou son adresse. */
export function cardTitle(c: CanvasCardItem): string {
  if (c.kind === "file") return (c.file ?? "").replace(/^.*\//, "").replace(/\.md$/i, "");
  if (c.kind === "link") return c.url ?? "";
  return c.label ?? "";
}
