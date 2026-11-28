// Déplacer un bloc de texte (spécification « deplacer-un-bloc », § 5.1) : le texte de la note après le
// déplacement. Fonctions pures : seules les lignes du bloc changent de place (et, pour un élément de
// liste, de retrait et de numéro) ; les lignes vides autour suivent les règles de la spécification.
import { blankLines, offsetOf, reindented, trimEnd, trimStart, withNumber } from "./block-lines";
import { renumbered, type Row } from "./renumber";
import type { ListItemInfo, TextBlock } from "./read-blocks";

/** Le texte après le déplacement, et la place du curseur : le début de la première ligne du bloc déplacé. */
export interface Moved {
  readonly text: string;
  readonly cursor: number;
}

/** Le remplacement le plus court qui mène de `before` à `after`. */
export function changeBetween(
  before: string,
  after: string,
): { readonly from: number; readonly to: number; readonly insert: string } {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before[start] === after[start]) start++;
  let tail = 0;
  while (
    tail < shortest - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail++;
  return { from: start, to: before.length - tail, insert: after.slice(start, after.length - tail) };
}

/** Deux éléments de la même liste ne sont séparés par aucune ligne vide, les autres blocs par une seule. */
const gapBetween = (before: number | undefined, after: number | undefined): number =>
  before !== undefined && before === after ? 0 : 1;

/** Où et comment le bloc se pose : l'élément de liste auquel il se joint, son retrait, sa liste. */
interface Landing {
  readonly indent: number;
  /** La liste qu'il rejoint ; `undefined` : il forme une liste à lui seul, ou n'est pas un élément. */
  readonly joined: ListItemInfo | undefined;
}

/**
 * Un élément de liste prend le retrait de l'élément du même genre (puce ou numéroté) devant lequel il est
 * déposé, à défaut de celui qui le précède ; entre deux autres blocs, il forme une liste à lui seul.
 */
function landingOf(
  block: TextBlock,
  before: TextBlock | undefined,
  after: TextBlock | undefined,
): Landing {
  const own = block.list;
  if (!own) return { indent: 0, joined: undefined };
  const kind = (neighbor: TextBlock | undefined) =>
    neighbor?.list?.ordered === own.ordered ? neighbor.list : undefined;
  const joined = kind(after) ?? kind(before);
  return { indent: joined?.indent ?? 0, joined };
}

const NOT_A_LIST: Row = { ordered: false, indent: 0, listId: null, start: 0 };

/** Les blocs dans l'ordre où ils seront, pour refaire les numéros des listes numérotées touchées. */
function newOrder(blocks: readonly TextBlock[], plan: Plan): { rows: Row[]; indexes: number[] } {
  const { index, end, slot, delta, landing } = plan;
  const inside = (i: number) => i >= index && i < end;
  const all = blocks.map((_, i) => i);
  const indexes = [
    ...all.filter((i) => i < slot && !inside(i)),
    ...all.filter(inside),
    ...all.filter((i) => i >= slot && !inside(i)),
  ];
  const rows = indexes.map((i): Row => {
    const list = (blocks[i] as TextBlock).list;
    if (!list) return NOT_A_LIST;
    if (!inside(i)) return { ...list };
    const { joined } = landing;
    return {
      ordered: list.ordered,
      indent: list.indent + delta,
      listId: joined?.listId ?? list.listId,
      start: i === index && joined ? joined.start : list.start,
    };
  });
  return { rows, indexes };
}

/**
 * Les lignes de la note avec les numéros refaits ; les listes touchées sont celle d'où l'élément part et
 * celle où il arrive.
 */
function renumberedLines(
  lines: readonly string[],
  blocks: readonly TextBlock[],
  plan: Plan,
): string[] {
  const own = (blocks[plan.index] as TextBlock).list;
  const affected = new Set(own ? [own.listId, plan.landing.joined?.listId ?? own.listId] : []);
  const order = newOrder(blocks, plan);
  const result = [...lines];
  renumbered(order.rows, affected).forEach((number, at) => {
    const block = blocks[order.indexes[at] as number] as TextBlock;
    if (number === null || !block.list || number === block.list.number) return;
    result[block.first - 1] = withNumber(result[block.first - 1] as string, block.list, number);
  });
  return result;
}

/**
 * Le bloc `index` peut-il être posé devant le bloc `slot` (ou à la fin de la note si `slot` est le nombre de
 * blocs) ? Pas devant lui-même, ni dans ses sous-éléments ; derrière lui, seulement pour un élément de
 * liste, qui peut changer de niveau.
 */
export function canDrop(blocks: readonly TextBlock[], index: number, slot: number): boolean {
  const block = blocks[index];
  if (!block || slot < 0 || slot > blocks.length) return false;
  const end = index + 1 + block.descendants;
  if (slot >= index && slot < end) return false;
  return slot !== end || block.list !== undefined;
}

/**
 * Le texte de la note quand le bloc `index` (dans l'ordre de `blocks`) est posé devant le bloc `slot`, ou à
 * la fin de la note si `slot` est le nombre de blocs. `null` quand rien ne change : dépôt refusé (voir
 * `canDrop`), ou élément de liste posé juste derrière lui sans changer de niveau.
 */
export function moveBlock(
  text: string,
  blocks: readonly TextBlock[],
  index: number,
  slot: number,
): Moved | null {
  if (!canDrop(blocks, index, slot)) return null;
  const block = blocks[index] as TextBlock;
  const end = index + 1 + block.descendants;
  const before = blocks[slot === end ? index - 1 : slot - 1];
  const landing = landingOf(block, before, blocks[slot]);
  const delta = block.list ? landing.indent - block.list.indent : 0;
  const plan: Plan = { index, end, slot, delta, landing };
  const lines = renumberedLines(text.split("\n"), blocks, plan);
  const out = slot === end ? inPlace(lines, block, delta) : relocated(lines, blocks, plan);
  const result = out.lines.join("\n");
  return result === text ? null : { text: result, cursor: offsetOf(out.lines, out.at) };
}

interface Plan {
  readonly index: number;
  readonly end: number;
  readonly slot: number;
  readonly delta: number;
  readonly landing: Landing;
}

/** Les lignes de la note après le déplacement, et la ligne où commence le bloc. */
interface Placement {
  readonly lines: string[];
  readonly at: number;
}

/** Le bloc ne change pas de place, seulement de niveau. */
function inPlace(lines: readonly string[], block: TextBlock, delta: number): Placement {
  const first = block.first - 1;
  const moved = reindented(lines.slice(first, block.last), delta);
  return { lines: [...lines.slice(0, first), ...moved, ...lines.slice(block.last)], at: first };
}

/** Les lignes vides à laisser : là où le bloc était, avant lui et après lui là où il se pose. */
interface Gaps {
  readonly closing: number;
  readonly before: number;
  readonly after: number;
}

function gapsOf(blocks: readonly TextBlock[], plan: Plan): Gaps {
  const { index, end, slot, landing } = plan;
  const listId = landing.joined?.listId;
  return {
    closing: gapBetween(blocks[index - 1]?.list?.listId, blocks[end]?.list?.listId),
    before: gapBetween(blocks[slot - 1]?.list?.listId, listId),
    after: gapBetween(listId, blocks[slot]?.list?.listId),
  };
}

/** Le bloc quitte sa place (ses voisins se rejoignent) et se pose devant `slot` (ses nouveaux voisins le séparent). */
function relocated(lines: readonly string[], blocks: readonly TextBlock[], plan: Plan): Placement {
  const block = blocks[plan.index] as TextBlock;
  const moved = reindented(lines.slice(block.first - 1, block.last), plan.delta);
  const gaps = gapsOf(blocks, plan);
  return plan.slot > plan.end
    ? movedDown(lines, blocks, { plan, moved, gaps })
    : movedUp(lines, blocks, { plan, moved, gaps });
}

interface Move {
  readonly plan: Plan;
  readonly moved: readonly string[];
  readonly gaps: Gaps;
}

/** Le bloc descend : sa place se referme au-dessus de la lignes d'arrivée, où il se pose. */
function movedDown(lines: readonly string[], blocks: readonly TextBlock[], move: Move): Placement {
  const { plan, moved, gaps } = move;
  const { index, slot } = plan;
  const block = blocks[index] as TextBlock;
  const first = block.first - 1;
  const point =
    slot < blocks.length
      ? (blocks[slot] as TextBlock).first - 1
      : (blocks.at(-1) as TextBlock).last;
  const head = lines.slice(0, first);
  const middle = trimEnd(trimStart(lines.slice(block.last, point)));
  const seam =
    index === 0 ? [...head, ...middle] : [...trimEnd(head), ...blankLines(gaps.closing), ...middle];
  const next =
    slot < blocks.length ? [...blankLines(gaps.after), ...lines.slice(point)] : lines.slice(point);
  const out = [...seam, ...blankLines(gaps.before), ...moved];
  return { lines: [...out, ...next], at: out.length - moved.length };
}

/** Le bloc monte : il se pose devant la ligne d'arrivée, et sa place se referme sous lui. */
function movedUp(lines: readonly string[], blocks: readonly TextBlock[], move: Move): Placement {
  const { plan, moved, gaps } = move;
  const { index, end, slot } = plan;
  const block = blocks[index] as TextBlock;
  const point = (blocks[slot] as TextBlock).first - 1;
  const lead = lines.slice(0, point);
  const head = slot === 0 ? lead : [...trimEnd(lead), ...blankLines(gaps.before)];
  const middle = trimEnd(lines.slice(point, block.first - 1));
  const rest = lines.slice(block.last);
  const seam =
    end < blocks.length
      ? [...middle, ...blankLines(gaps.closing), ...trimStart(rest)]
      : [...middle, ...rest];
  return { lines: [...head, ...moved, ...blankLines(gaps.after), ...seam], at: head.length };
}
