// Le Kanban à l'écran (fiche 0060, spécification § 7.1) : une colonne par statut, ses cartes, le
// pied d'une colonne ouverte (ajout rapide), les étapes. Tout vient de `read_crm` : l'écran ne
// calcule ni les colonnes, ni l'ordre, ni les compteurs.
import type { ColumnItem, CrmItem } from "../bridge";
import { cardView, type Lookups } from "../state/crm-card";
import type { Move } from "../state/crm-drop";
import { cardElement } from "./crm-card";
import { type BoardDrag, dragCard, dragStage } from "./crm-board-drag";
import { actionButton, h } from "./crm-dom";
import { type QuickAdd, type QuickAddActions, quickAddButton, quickAddForm } from "./crm-quick-add";
import {
  addStageTile,
  removeButton,
  type StageActions,
  type StageEdit,
  stageName,
} from "./crm-stages";

/** Ce que l'écran garde entre deux dessins : la ligne d'ajout rapide, le champ d'étape, les « Afficher 10 de plus » cliqués. */
export interface BoardUi {
  readonly quick: QuickAdd | null;
  readonly stageEdit: StageEdit | null;
  /** Pour chaque colonne terminée, combien de pages de plus ont été demandées. */
  readonly closedMore: ReadonlyMap<string, number>;
}

export type BoardActions = QuickAddActions &
  StageActions & {
    readonly openAction: (name: string) => void;
    readonly openQuick: (key: string) => void;
    readonly showMore: (status: string) => void;
    readonly dropCard: (card: string, move: Move) => void;
    readonly dropOnDay: (card: string, day: string) => void;
    readonly moveStage: (stage: string, to: number) => void;
  };

export interface BoardContext {
  readonly crm: CrmItem;
  readonly lookups: Lookups;
  /** Un filtre est actif : une carte lâchée n'est pas placée. */
  readonly filtered: boolean;
  readonly ui: BoardUi;
  readonly act: BoardActions;
  /** Le dessin de l'écran est en cours : un champ retiré n'a pas été quitté par l'utilisateur. */
  readonly redrawing: () => boolean;
}

/** Les cartes de `refs` dans une colonne, chacune saisissable par `grab`. */
export function cardsElement(
  ctx: BoardContext,
  refs: readonly string[],
  grab: (event: PointerEvent, card: HTMLElement) => void,
): HTMLElement {
  const list = h("div", "crm-cards");
  for (const ref of refs) {
    const action = ctx.lookups.actions.get(ref);
    if (action === undefined) continue;
    const card = cardElement(cardView(action, ctx.lookups, ctx.crm.today));
    card.addEventListener("pointerdown", (event) => grab(event, card));
    card.addEventListener("click", () => ctx.act.openAction(ref));
    list.append(card);
  }
  return list;
}

/** Le pied d'une colonne ouverte : « + Ajouter une action », ou la ligne d'ajout rapide ouverte. */
export function footer(ctx: BoardContext, key: string): HTMLElement {
  const { quick } = ctx.ui;
  const foot = h("div", "crm-column-foot");
  foot.append(
    quick?.key === key
      ? quickAddForm(ctx.crm, quick, ctx.act)
      : quickAddButton(() => ctx.act.openQuick(key)),
  );
  return foot;
}

/** L'en-tête : le nom (celui d'une étape se change), le nombre de cartes, en rouge le nombre en retard. */
function header(ctx: BoardContext, column: ColumnItem, isStage: boolean): HTMLElement {
  const head = h("header", "crm-column-header");
  head.append(
    isStage
      ? stageName(column.status, ctx.ui.stageEdit, ctx.act, ctx.redrawing)
      : h("span", "crm-column-name", column.status),
    h("span", "crm-count", String(column.count)),
  );
  if (column.late > 0) {
    const late = h("span", "crm-late-count", String(column.late));
    late.title = `${String(column.late)} en retard`;
    head.append(late);
  }
  if (isStage) head.append(removeButton(column.status, ctx.act));
  return head;
}

/** Les cartes montrées d'une colonne : toutes, ou, pour une colonne terminée, les 10 premières puis 10 de plus à chaque clic. */
function shownCards(ctx: BoardContext, column: ColumnItem): readonly string[] {
  if (!column.closed) return column.cards;
  const pages = 1 + (ctx.ui.closedMore.get(column.status) ?? 0);
  return column.cards.slice(0, ctx.crm.closedPage * pages);
}

/** « Afficher 10 de plus (N restantes) » au pied d'une colonne terminée qui a d'autres cartes. */
function moreButton(ctx: BoardContext, column: ColumnItem, shown: number): HTMLElement | null {
  const left = column.cards.length - shown;
  if (left <= 0) return null;
  const text = `Afficher ${String(ctx.crm.closedPage)} de plus (${String(left)} restante${left > 1 ? "s" : ""})`;
  const button = actionButton("crm-more link", text);
  button.addEventListener("click", () => ctx.act.showMore(column.status));
  return button;
}

function columnElement(ctx: BoardContext, column: ColumnItem, drag: BoardDrag): HTMLElement {
  const isStage = ctx.crm.stages.includes(column.status);
  const section = h("section", `crm-column${isStage ? " stage" : ""}`);
  section.dataset.status = column.status;
  section.dataset.key = column.status;
  const head = header(ctx, column, isStage);
  if (isStage)
    head.addEventListener("pointerdown", (event) => {
      if (!(event.target as Element).closest("input, .crm-stage-remove"))
        dragStage(event, head, drag);
    });
  const shown = shownCards(ctx, column);
  section.append(
    head,
    cardsElement(ctx, shown, (event, card) => dragCard(event, card, drag)),
  );
  const more = moreButton(ctx, column, shown.length);
  if (more !== null) section.append(more);
  if (!column.closed) section.append(footer(ctx, `status:${column.status}`));
  return section;
}

/** Le Kanban : les colonnes, et « + Ajouter une étape » entre la dernière étape et « Done ». */
export function kanbanBoard(ctx: BoardContext): HTMLElement {
  const board = h("div", "crm-board");
  const drag: BoardDrag = {
    ...{ board, columns: ctx.crm.columns, filtered: ctx.filtered },
    ...{ dropCard: ctx.act.dropCard, dropOnDay: ctx.act.dropOnDay, moveStage: ctx.act.moveStage },
  };
  let tileAdded = false;
  for (const column of ctx.crm.columns) {
    if (column.closed && !tileAdded) {
      board.append(addStageTile(ctx.ui.stageEdit, ctx.act, ctx.redrawing));
      tileAdded = true;
    }
    board.append(columnElement(ctx, column, drag));
  }
  return board;
}
