// Ma semaine à l'écran (fiche 0060, spécification § 7.2) : les actions ouvertes rangées par jour,
// huit colonnes — « En retard » puis lundi à dimanche —, les flèches, « Aujourd'hui ». Glisser une
// carte sur un jour change sa date.
import { dayOfMonth, weekdayName, weekTitle } from "../state/crm-days";
import { type BoardContext, cardsElement, footer } from "./crm-board";
import { type BoardDrag, dragToDay } from "./crm-board-drag";
import { actionButton, h } from "./crm-dom";

/** Le titre de la colonne des actions d'avant le lundi affiché. */
export const LATE_TITLE = "En retard";

/** Ce que font les flèches et « Aujourd'hui », dits par l'écran. */
export interface WeekNavigation {
  readonly previous: () => void;
  readonly next: () => void;
  readonly today: () => void;
}

/** Les flèches « ‹ » et « › », « Aujourd'hui » et le titre de la semaine. */
function bar(ctx: BoardContext, nav: WeekNavigation): HTMLElement {
  const { week, today } = ctx.crm;
  const row = h("div", "crm-week-bar");
  const previous = actionButton("crm-week-arrow", "‹", "Semaine précédente");
  const next = actionButton("crm-week-arrow", "›", "Semaine suivante");
  const current = actionButton("crm-week-today", "Aujourd'hui");
  previous.addEventListener("click", nav.previous);
  next.addEventListener("click", nav.next);
  current.addEventListener("click", nav.today);
  row.append(
    previous,
    current,
    next,
    h("h2", "crm-week-title", weekTitle(week.monday, week.sunday, today)),
  );
  return row;
}

function column(
  key: string,
  title: string,
  refs: readonly string[],
  ctx: BoardContext,
  drag: BoardDrag,
) {
  const section = h("section", "crm-column");
  section.dataset.key = key;
  const head = h("header", "crm-column-header");
  head.append(h("span", "crm-column-name", title), h("span", "crm-count", String(refs.length)));
  section.append(
    head,
    cardsElement(ctx, refs, (event, card) => dragToDay(event, card, drag)),
  );
  return section;
}

/** Ma semaine : la barre, puis « En retard » et les sept jours, toujours tous visibles, aujourd'hui en évidence. */
export function weekView(ctx: BoardContext, nav: WeekNavigation): HTMLElement {
  const { week, today } = ctx.crm;
  const board = h("div", "crm-board crm-week");
  const drag: BoardDrag = {
    ...{ board, columns: ctx.crm.columns, filtered: ctx.filtered },
    ...{ dropCard: ctx.act.dropCard, dropOnDay: ctx.act.dropOnDay, moveStage: ctx.act.moveStage },
  };
  const late = column("late", LATE_TITLE, week.late, ctx, drag);
  late.classList.add("late");
  board.append(late);
  week.days.forEach(({ day, cards }, index) => {
    const title = `${weekdayName(index)} ${String(dayOfMonth(day))}`;
    const section = column(day, title, cards, ctx, drag);
    section.dataset.day = day;
    if (day === today) section.classList.add("today");
    section.append(footer(ctx, `day:${day}`));
    board.append(section);
  });
  const wrapper = h("div", "crm-week-view");
  wrapper.append(bar(ctx, nav), board);
  return wrapper;
}
