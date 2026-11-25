// La fiche d'une entreprise ou d'une personne à l'écran (fiche 0063, spécification § 9) : Rust lit et
// écrit les fichiers ; l'écran affiche la vue complète du CRM, en retient la fiche, et, à chaque
// geste, la relit. Une saisie en cours (un champ, les notes) est retrouvée après le dessin.
import type { CrmBackend } from "./crm-view";
import { NO_FILTERS } from "../state/crm";
import { lookupsOf } from "../state/crm-card";
import type { FicheTarget } from "../state/crm-fiche";
import { companyFiche } from "./crm-fiche-company";
import { personFiche } from "./crm-fiche-person";
import { type FicheContext, newFicheState } from "./crm-fiche-ui";
import { h } from "./crm-dom";
import type { ActionHooks } from "./crm-hooks";
import "./crm-lists.css";

/** Ce que dit la fiche dont le fichier n'existe plus (§ 10). */
export const GONE_TEXT = "Cette fiche n'existe plus.";

export interface FicheViewDeps {
  readonly backend: CrmBackend;
  readonly target: FicheTarget;
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  readonly error: (error: unknown) => void;
  readonly openNote: (path: string) => void;
  readonly hooks: ActionHooks;
}

export interface FicheView {
  readonly element: HTMLElement;
  /** Relit le CRM sur le disque et redessine la fiche. */
  reload(): Promise<void>;
  destroy(): void;
}

class FicheScreen implements FicheView {
  readonly element = h("div", "crm-fiche");
  private readonly state = newFicheState();
  private data: Awaited<ReturnType<CrmBackend["readCrm"]>> | null = null;
  private focusKey: string | null = null;
  private generation = 0;
  private redrawing = false;

  constructor(private readonly deps: FicheViewDeps) {
    this.element.dataset.kind = deps.target.kind;
  }

  destroy(): void {
    this.generation += 1;
    this.element.remove();
  }

  async reload(): Promise<void> {
    const generation = (this.generation += 1);
    try {
      const { backend, target } = this.deps;
      const data = await backend.readCrm(target.crm, NO_FILTERS, null);
      if (generation !== this.generation) return;
      this.data = data;
      this.render();
    } catch (error) {
      if (generation === this.generation) this.deps.error(error);
    }
  }

  /** Un geste : l'écran relit toujours le CRM ensuite, réussi ou refusé, pour montrer ce qu'il en est. */
  private async gesture(run: () => Promise<unknown>): Promise<boolean> {
    let done = true;
    try {
      await run();
    } catch (error) {
      done = false;
      this.deps.error(error);
    }
    await this.reload();
    return done;
  }

  private context(data: NonNullable<FicheScreen["data"]>): FicheContext {
    const { deps } = this;
    return {
      ...{ crm: data, path: deps.target.crm, lookups: lookupsOf(data), state: this.state },
      backend: deps.backend,
      act: {
        redraw: () => this.render(),
        focus: (key) => void (this.focusKey = key),
        gesture: (run) => this.gesture(run),
        confirm: deps.confirm,
        openNote: deps.openNote,
        hooks: deps.hooks,
        redrawing: () => this.redrawing,
      },
    };
  }

  private content(data: NonNullable<FicheScreen["data"]>): HTMLElement[] {
    const { kind, name } = this.deps.target;
    const ctx = this.context(data);
    const company = kind === "company" ? data.companies.find((c) => c.name === name) : undefined;
    const person = kind === "person" ? data.people.find((p) => p.name === name) : undefined;
    if (company !== undefined) return companyFiche(ctx, company);
    if (person !== undefined) return personFiche(ctx, person);
    return [h("p", "crm-fiche-gone", GONE_TEXT)];
  }

  private render(): void {
    const data = this.data;
    if (data === null) return;
    const keep = this.keptFocus();
    this.redrawing = true;
    this.element.replaceChildren(...this.content(data));
    this.restoreFocus(keep);
    this.redrawing = false;
  }

  /** Le champ qui a le curseur, à retrouver après le dessin : une saisie en cours n'est pas perdue. */
  private keptFocus(): { key: string; start: number | null; end: number | null } | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return null;
    const key = active.dataset.keep;
    if (key === undefined || !this.element.contains(active)) return null;
    return { key, start: active.selectionStart, end: active.selectionEnd };
  }

  private restoreFocus(keep: ReturnType<FicheScreen["keptFocus"]>): void {
    const key = this.focusKey ?? keep?.key;
    this.focusKey = null;
    const field =
      key === undefined
        ? null
        : this.element.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[data-keep="${key}"]`,
          );
    if (field === null) return;
    field.focus();
    if (keep !== null && keep.start !== null && keep.end !== null)
      field.setSelectionRange(keep.start, keep.end);
    else if (field instanceof HTMLInputElement) field.select();
  }
}

export function createFicheView(deps: FicheViewDeps): FicheView {
  return new FicheScreen(deps);
}
