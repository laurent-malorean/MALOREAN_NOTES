// Glisser dans le Kanban et dans Ma semaine (fiche 0060, spécification §§ 7.1 et 7.2) : le calcul
// de la place est dans `state/crm-drop.ts` ; ici, mesurer l'écran, marquer la cible, déposer.
import type { ColumnItem } from "../bridge";
import {
  type CardRect,
  type Drop,
  dropMove,
  type Move,
  nextCard,
  stagePlace,
} from "../state/crm-drop";
import { datum } from "./crm-dom";
import { startDrag } from "./crm-drag";

export interface BoardDrag {
  readonly board: HTMLElement;
  readonly columns: readonly ColumnItem[];
  readonly filtered: boolean;
  /** Une carte lâchée dans le Kanban. */
  readonly dropCard: (card: string, move: Move) => void;
  /** Une carte lâchée sur un jour de Ma semaine. */
  readonly dropOnDay: (card: string, day: string) => void;
  /** Une étape lâchée à cette place (à partir de 0). */
  readonly moveStage: (stage: string, to: number) => void;
}

const MARKS = ["drop-target", "drop-before", "drop-end", "drop-stage-before", "drop-stage-after"];

function clearMarks(board: HTMLElement): void {
  for (const element of board.querySelectorAll(`.${MARKS.join(", .")}`))
    element.classList.remove(...MARKS);
}

/** La colonne du tableau sous le pointeur, s'il y en a une. */
function columnAt(board: HTMLElement, x: number, y: number): HTMLElement | null {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>(".crm-column") ?? null;
  return column !== null && board.contains(column) ? column : null;
}

/** Les cartes montrées d'une colonne, sauf `except`, avec leur place à l'écran. */
function rectsOf(
  column: HTMLElement,
  except: HTMLElement,
): (CardRect & { element: HTMLElement })[] {
  return [...column.querySelectorAll<HTMLElement>(".crm-card")]
    .filter((card) => card !== except)
    .map((card) => {
      const box = card.getBoundingClientRect();
      return { name: datum(card, "card"), top: box.top, height: box.height, element: card };
    });
}

/** Marque où tombera la carte : la colonne, et le trait devant la carte suivante ou au bas des cartes. */
function markDrop(column: HTMLElement, next: HTMLElement | null): void {
  column.classList.add("drop-target");
  if (next !== null) next.classList.add("drop-before");
  else column.querySelector(".crm-cards")?.classList.add("drop-end");
}

/** Glisse la carte `card` d'une colonne du Kanban à une autre, ou dans la sienne. */
export function dragCard(event: PointerEvent, card: HTMLElement, ctx: BoardDrag): void {
  const name = datum(card, "card");
  const from = datum(card.closest(".crm-column") as HTMLElement, "status");
  startDrag<{ move: Move }>(event, card, {
    start: () => card.classList.add("dragging"),
    over: (x, y) => {
      clearMarks(ctx.board);
      const column = columnAt(ctx.board, x, y);
      const target = ctx.columns.find((c) => c.status === column?.dataset.status);
      if (column === null || target === undefined) return null;
      const rects = rectsOf(column, card);
      const next = nextCard(rects, y);
      const drop: Drop = { dragged: name, from, target, next, filtered: ctx.filtered };
      const move = dropMove(drop);
      if (move === null) return null;
      markDrop(column, rects.find((rect) => rect.name === next)?.element ?? null);
      return { move };
    },
    scroller: ctx.board,
    drop: ({ move }) => ctx.dropCard(name, move),
    end: () => {
      clearMarks(ctx.board);
      card.classList.remove("dragging");
    },
  });
}

/** Glisse la carte `card` sur un jour de Ma semaine : reçue n'importe où sur la colonne du jour, jamais dans « En retard ». */
export function dragToDay(event: PointerEvent, card: HTMLElement, ctx: BoardDrag): void {
  const name = datum(card, "card");
  startDrag<string>(event, card, {
    start: () => card.classList.add("dragging"),
    over: (x, y) => {
      clearMarks(ctx.board);
      const column = columnAt(ctx.board, x, y);
      const day = column?.dataset.day;
      if (column === null || day === undefined || column.contains(card)) return null;
      column.classList.add("drop-target");
      return day;
    },
    scroller: ctx.board,
    drop: (day) => ctx.dropOnDay(name, day),
    end: () => {
      clearMarks(ctx.board);
      card.classList.remove("dragging");
    },
  });
}

/** Glisse l'en-tête d'une étape : elle prend la place où on la lâche, parmi les autres étapes. */
export function dragStage(event: PointerEvent, header: HTMLElement, ctx: BoardDrag): void {
  const column = header.closest(".crm-column") as HTMLElement;
  const stage = datum(column, "status");
  const stages = [...ctx.board.querySelectorAll<HTMLElement>(".crm-column.stage")];
  const others = stages.filter((other) => other !== column);
  startDrag<number>(event, header, {
    start: () => column.classList.add("dragging"),
    over: (x) => {
      clearMarks(ctx.board);
      const rects = others.map((other) => {
        const box = other.getBoundingClientRect();
        return { stage: datum(other, "status"), left: box.left, width: box.width };
      });
      const place = stagePlace(rects, x);
      if (place === stages.indexOf(column)) return null;
      const before = others[place];
      if (before !== undefined) before.classList.add("drop-stage-before");
      else others.at(-1)?.classList.add("drop-stage-after");
      return place;
    },
    scroller: ctx.board,
    drop: (place) => ctx.moveStage(stage, place),
    end: () => {
      clearMarks(ctx.board);
      column.classList.remove("dragging");
    },
  });
}
