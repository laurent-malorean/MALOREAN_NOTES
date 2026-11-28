// La bande d'un événement (fiche 0104, spécification §§ 4.2, 7 et 9), au-dessus du texte de sa note. Une ligne
// d'en-tête : le lien vers la grille, le résumé de l'événement, son état s'il est clos, puis « Clore » (« Rouvrir »
// s'il est clos) et « Placer dans la corbeille » ; dessous, le titre en grand et les champs, regroupés en « Quand » et « Où ».
// Rust valide chaque geste ; un refus est montré tel quel dans la bande, jamais passé sous silence.
import type {
  Agenda12ClosedItem,
  Agenda12ClosingItem,
  Agenda12EventChangeItem,
  Agenda12EventDetailItem,
  CountryItem,
  SavedNote,
} from "../bridge";
import { closedDay, eventSummary } from "../state/agenda-12";
import { createEventFields, type EventFields } from "./agenda-12-event-fields";
import { appIcon } from "./app-icons";
import { actionButton, h } from "./crm-dom";
import "./agenda-12.css";

/** Ce que la bande demande à Rust. */
export interface Agenda12EventBackend {
  readonly readAgenda12Event: (path: string) => Promise<Agenda12EventDetailItem>;
  readonly changeAgenda12Event: (path: string, change: Agenda12EventChangeItem) => Promise<unknown>;
  readonly closeAgenda12Event: (
    path: string,
    closing: Agenda12ClosingItem,
  ) => Promise<Agenda12ClosedItem>;
  readonly reopenAgenda12Event: (path: string) => Promise<SavedNote>;
  readonly listCountries: () => Promise<CountryItem[]>;
}

/** L'événement à mettre à la corbeille : sa note, son titre (pour la confirmation), son agenda 12 (qui s'ouvre ensuite). */
export interface TrashedEvent {
  readonly path: string;
  readonly title: string;
  readonly agenda: string;
}

export interface EventBandDeps {
  readonly backend: Agenda12EventBackend;
  /** Le chemin de la note de l'événement. */
  readonly path: string;
  /** L'année en cours, d'après l'horloge (la liste des années part de là). */
  readonly currentYear: () => number;
  readonly error: (error: unknown) => void;
  /** Le message d'une erreur de Rust, prêt à montrer. */
  readonly errorText: (error: unknown) => string;
  /** Enregistre ce qui est tapé dans le texte de la note, avant un geste qui réécrit son fichier. */
  readonly flush: () => Promise<void>;
  /** Relit le texte de la note sur le disque, après un geste qui l'a réécrit. */
  readonly followText: () => Promise<void>;
  /** Ouvre la note `path` dans la colonne. */
  readonly open: (path: string) => Promise<void>;
  /** Demande comment clore l'événement titré `title` ; `null` si on annule. */
  readonly askClosing: (title: string) => Promise<Agenda12ClosingItem | null>;
  /** Place l'événement dans la corbeille, après confirmation, et ouvre son agenda 12. */
  readonly trashEvent: (event: TrashedEvent) => Promise<void>;
}

export interface EventBand {
  readonly element: HTMLElement;
  /** Relit l'événement et redessine ses champs. */
  reload(force?: boolean): Promise<void>;
  /** Met le curseur sur le titre, sélectionné. */
  focusTitle(): void;
  destroy(): void;
}

export const CLOSE_TEXT = "Clore";
export const REOPEN_TEXT = "Rouvrir";
export const TRASH_TEXT = "Placer dans la corbeille";

class Band implements EventBand {
  readonly element = h("div", "agenda-band");
  private readonly back = actionButton("agenda-back", "");
  private readonly summary = h("p", "agenda-summary");
  private readonly closedText = h("span", "agenda-closed-on");
  private readonly close = actionButton("agenda-action agenda-close", CLOSE_TEXT);
  private readonly reopen = actionButton("agenda-action agenda-reopen", REOPEN_TEXT);
  private readonly trash = actionButton("agenda-icon-action agenda-trash", "", TRASH_TEXT);
  private readonly message = h("p", "agenda-band-message");
  private readonly fields: EventFields;
  private detail: Agenda12EventDetailItem | null = null;
  private generation = 0;
  private countries: Promise<CountryItem[]> | null = null;
  /** Les gestes se suivent l'un après l'autre : le suivant attend la fin du précédent (le texte de la note est réécrit à chacun). */
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly deps: EventBandDeps) {
    this.fields = createEventFields({
      error: deps.error,
      currentYear: deps.currentYear,
      change: (changes, notice) => void this.change(changes, notice),
      loadCountries: () => (this.countries ??= deps.backend.listCountries()),
    });
    this.message.setAttribute("role", "alert");
    this.message.hidden = true;
    this.back.addEventListener("click", () => this.go(() => this.openAgenda()));
    this.close.addEventListener("click", () => this.go(() => this.closing()));
    this.reopen.addEventListener("click", () => this.go(() => this.reopening()));
    this.trash.addEventListener("click", () => this.go(() => this.trashing()));
    this.trash.title = TRASH_TEXT;
    this.trash.append(appIcon("trash"));
    const actions = h("div", "agenda-band-actions");
    actions.append(this.close, this.reopen, this.trash);
    const head = h("header", "agenda-band-head");
    head.append(this.back, this.summary, this.closedText, actions);
    this.element.append(head, this.fields.element, this.message);
  }

  destroy(): void {
    this.generation += 1;
    this.element.remove();
  }

  focusTitle(): void {
    this.fields.title.focus();
    this.fields.title.select();
  }

  async reload(force = false): Promise<void> {
    const generation = (this.generation += 1);
    try {
      const detail = await this.deps.backend.readAgenda12Event(this.deps.path);
      if (generation !== this.generation) return;
      this.detail = detail;
      this.show(detail, force);
    } catch (error) {
      if (generation === this.generation) this.deps.error(error);
    }
  }

  private show(detail: Agenda12EventDetailItem, force: boolean): void {
    const { event, closed } = detail;
    this.back.textContent = `← ${detail.agendaTitle}`;
    this.summary.textContent = eventSummary(event);
    this.element.dataset.closed = String(closed);
    this.closedText.hidden = !closed;
    this.closedText.textContent =
      event.closedOn === null ? "Clos" : `Clos le ${closedDay(event.closedOn)}`;
    this.close.hidden = closed;
    this.reopen.hidden = !closed;
    this.fields.show(event, force);
  }

  /** Le message de la bande : un refus (`error`), ou ce que l'écran a fait de lui-même (`notice`). */
  private say(text: string, tone: "error" | "notice" = "error"): void {
    this.message.textContent = text;
    this.message.dataset.tone = tone;
    this.message.hidden = text === "";
  }

  /** Met le geste en file, la bande est « occupée » (`aria-busy`) tant qu'il en reste. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    this.pending += 1;
    this.element.setAttribute("aria-busy", "true");
    const done = this.queue.then(task).finally(() => {
      this.pending -= 1;
      if (this.pending === 0) this.element.removeAttribute("aria-busy");
    });
    this.queue = done;
    return done;
  }

  /** Un geste du bouton : son refus est montré dans la bande, et la bande relit ensuite ce qui est écrit. */
  private go(run: () => Promise<unknown>): Promise<void> {
    return this.enqueue(async () => {
      this.say("");
      try {
        await this.deps.flush();
        await run();
      } catch (error) {
        this.say(this.deps.errorText(error));
        await this.reload(true);
      }
    });
  }

  /**
   * Les gestes d'un champ : le texte tapé est enregistré d'abord, Rust réécrit une clé par geste, le texte et la
   * bande relisent le fichier. Le premier refus arrête la suite et se dit ; `notice` se dit quand tout a réussi.
   */
  private change(changes: readonly Agenda12EventChangeItem[], notice?: string): Promise<void> {
    return this.enqueue(async () => {
      this.say("");
      let done = false;
      try {
        await this.deps.flush();
        for (const change of changes)
          await this.deps.backend.changeAgenda12Event(this.deps.path, change);
        await this.deps.followText();
        done = true;
      } catch (error) {
        this.say(this.deps.errorText(error));
      }
      await this.reload(true);
      if (done && notice !== undefined) this.say(notice, "notice");
    });
  }

  private async openAgenda(): Promise<void> {
    if (this.detail !== null) await this.deps.open(this.detail.agenda);
  }

  /** « Clore » : la fenêtre demande comment, puis la grille s'ouvre, où la copie est visible. */
  private async closing(): Promise<void> {
    const { detail } = this;
    if (detail === null) return;
    const closing = await this.deps.askClosing(detail.event.title);
    if (closing === null) return;
    await this.deps.backend.closeAgenda12Event(this.deps.path, closing);
    await this.deps.open(detail.agenda);
  }

  /** « Placer dans la corbeille » : la fenêtre de confirmation s'ouvre d'abord ; sans événement lu, rien à placer. */
  private async trashing(): Promise<void> {
    const { detail } = this;
    if (detail === null) return;
    const { path, title } = { path: this.deps.path, title: detail.event.title };
    await this.deps.trashEvent({ path, title, agenda: detail.agenda });
  }

  /** « Rouvrir » : l'événement revient dans la grille, sa note s'ouvre sous son nouveau chemin. */
  private async reopening(): Promise<void> {
    const reopened = await this.deps.backend.reopenAgenda12Event(this.deps.path);
    await this.deps.open(reopened.path);
  }
}

export function createEventBand(deps: EventBandDeps): EventBand {
  return new Band(deps);
}
