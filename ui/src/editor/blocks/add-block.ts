// Le bouton d'insertion (spécification « deplacer-un-bloc », § 6) : une ligne vide sous le bloc, ou un nouvel
// élément de la même liste au même niveau sous un élément de liste. Fonction pure sur le texte de la note.
import { blankLines, isBlank, offsetOf, withNumber } from "./block-lines";
import type { Moved } from "./move-block";
import type { ListItemInfo, TextBlock } from "./read-blocks";
import { renumbered, type Row } from "./renumber";

/** La marque d'un nouvel élément sous `list` (sa puce ou son délimiteur, sa case à cocher), de numéro `number`. */
function newMarker(list: ListItemInfo, line: string, number: number): string {
  const mark = list.ordered
    ? `${String(number)}${line.charAt(list.indent + list.digits)}`
    : line.charAt(list.indent);
  return `${mark} ${list.task ? "[ ] " : ""}`;
}

/** Les numéros des éléments numérotés après l'ajout d'un nouvel élément de `block` à `index`. */
function numbersWithNew(blocks: readonly TextBlock[], index: number): (number | null)[] {
  const block = blocks[index] as TextBlock;
  const list = block.list as NonNullable<TextBlock["list"]>;
  const end = index + 1 + block.descendants;
  const row = (b: TextBlock): Row =>
    b.list ? { ...b.list } : { ordered: false, indent: 0, listId: null, start: 0 };
  const rows = [...blocks.slice(0, end).map(row), { ...list }, ...blocks.slice(end).map(row)];
  return renumbered(rows, new Set([list.listId]));
}

/** Un nouvel élément à la suite de `block` (et de ses sous-éléments). */
function addItem(lines: string[], blocks: readonly TextBlock[], index: number): Moved {
  const block = blocks[index] as TextBlock;
  const list = block.list as NonNullable<TextBlock["list"]>;
  const end = index + 1 + block.descendants;
  const numbers = numbersWithNew(blocks, index);
  numbers.forEach((number, at) => {
    const other = at < end ? blocks[at] : at === end ? undefined : blocks[at - 1];
    if (number === null || !other?.list || number === other.list.number) return;
    lines[other.first - 1] = withNumber(lines[other.first - 1] as string, other.list, number);
  });
  const first = lines[block.first - 1] as string;
  const item = first.slice(0, list.indent) + newMarker(list, first, numbers[end] as number);
  lines.splice(block.last, 0, item);
  return { text: lines.join("\n"), cursor: offsetOf(lines, block.last) + item.length };
}

/** Une ligne vide sous `block`, avec une ligne vide entre elle et les blocs voisins. */
function addLine(lines: string[], block: TextBlock): Moved {
  const at = block.last;
  const following = lines.slice(at).some((line) => !isBlank(line));
  if (!following) lines.splice(at, lines.length - at, ...blankLines(2));
  else if (isBlank(lines[at] as string)) lines.splice(at + 1, 0, "", "");
  else lines.splice(at, 0, "", "", "");
  return { text: lines.join("\n"), cursor: offsetOf(lines, at + 1) };
}

/**
 * La note après le clic sur « + » du bloc `index` : un nouvel élément sous un élément de liste (à la suite de
 * ses sous-éléments), une ligne vide sous un autre bloc. `cursor` est le début de la nouvelle ligne, ou la
 * fin de la marque d'un nouvel élément. `null` si le bloc n'existe pas.
 */
export function addBlockBelow(
  text: string,
  blocks: readonly TextBlock[],
  index: number,
): Moved | null {
  const block = blocks[index];
  if (!block) return null;
  const lines = text.split("\n");
  return block.list ? addItem(lines, blocks, index) : addLine(lines, block);
}
