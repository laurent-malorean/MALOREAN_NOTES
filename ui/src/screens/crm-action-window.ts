// La fenêtre d'une action (fiche 0062, spécification § 8) : un panneau à droite de la fenêtre de
// l'application, qui crée, modifie, change le statut ou supprime une action. Une action existante
// s'enregistre à chaque geste (Rust écrit, l'écran relit) ; une nouvelle garde un brouillon et ne
// s'écrit qu'à « Enregistrer ». La mise à jour venue d'ailleurs attend la fin d'une saisie (§ 10).
import type { CrmActionChangeItem, CrmActionDraftItem, CrmItem } from "../bridge";
import type { ChecklistItem } from "../bridge/generated/ChecklistItem";
import type { CommentItem } from "../bridge/generated/CommentItem";
import {
  type ActionFields,
  applyChange,
  blankFields,
  draftOf,
  emailsToCopy,
  fieldsOf,
  type Prefill,
  removeChecklistQuestion,
  removeCommentQuestion,
} from "../state/crm-action-window";
import { checklistsSection, commentsSection } from "./crm-action-body";
import {
  colorSection,
  descriptionSection,
  peopleSection,
  projectSection,
  statusSection,
  titleSection,
  type TextField,
  type WindowActions,
  type WindowModel,
} from "./crm-action-fields";
import { linkedNotesSection, tagsSection } from "./crm-action-links";
import { actionButton, h } from "./crm-dom";
import "./crm-action-window.css";

/** Ce que la fenêtre demande à l'écran du CRM et à l'application. */
export interface WindowEnvironment {
  /** Un geste sur l'action ; l'écran relit ensuite le CRM. Dit si Rust l'a écrit. */
  readonly change: (action: string, change: CrmActionChangeItem) => Promise<boolean>;
  readonly create: (draft: CrmActionDraftItem) => Promise<boolean>;
  readonly remove: (action: string) => Promise<boolean>;
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  /** Fait choisir une note par la recherche de notes ; rend son titre, `null` si on annule. */
  readonly chooseNote: () => Promise<string | null>;
  readonly openNote: (title: string) => void;
  readonly openAddress: (url: string) => void;
  /** Met le texte dans le presse-papiers. */
  readonly copy: (text: string) => Promise<void>;
  readonly notice: (message: string) => void;
  readonly error: (error: unknown) => void;
  /** Ouvre la fiche d'une personne ; sans elle, la fenêtre ne propose pas le lien. */
  readonly openPerson?: (reference: string) => void;
  /** La fenêtre vient de se fermer. */
  readonly closed: () => void;
}

/** Ce que la fenêtre ouvre : une action qui existe, ou une nouvelle. */
export type Start =
  | { readonly kind: "existing"; readonly name: string }
  | { readonly kind: "new"; readonly prefill: Prefill };

export interface ActionWindow {
  /** Le nom de l'action montrée ; `null` pour une nouvelle. */
  readonly name: string | null;
  /** Le CRM vient d'être relu : la fenêtre se met à jour, ou se ferme si l'action n'existe plus. */
  update(crm: CrmItem): void;
  /** Ferme la fenêtre ; ce qui est tapé d'une action existante est enregistré d'abord. */
  close(): void;
}

/** Le texte de la fenêtre d'une nouvelle action, et celui de son bouton. */
export const NEW_TITLE = "Nouvelle action";
export const EXISTING_TITLE = "Action";
export const SAVE_TEXT = "Enregistrer";
export const DELETE_TEXT = "Supprimer";
export const CLOSE_TEXT = "Fermer";
export const EMAILS_COPIED = "E-mails copiés.";

/** Les gestes dont le contrôle montre déjà la valeur : la fenêtre n'a pas à se redessiner quand Rust la confirme. */
const SELF_SHOWN: ReadonlySet<string> = new Set(["title", "status", "date", "channel", "project"]);

const showsItself = (change: CrmActionChangeItem): boolean =>
  SELF_SHOWN.has(change.kind) || (change.kind === "body" && change.change.kind === "description");

/** Ce qui change l'apparence de la fenêtre : si deux lectures se ressemblent là-dessus, elle ne se redessine pas. */
const signature = (model: WindowModel): string =>
  JSON.stringify([
    ...[model.fields, model.action?.checklists, model.action?.comments],
    model.crm.people.map((p) => [p.name, p.title, p.company, p.email]),
    model.crm.companies.map((c) => [c.name, c.title]),
    model.crm.projects.map((p) => [p.name, p.title]),
    model.crm.tags,
    model.crm.columns.map((c) => c.status),
  ]);

interface KeptFocus {
  readonly field: string;
  readonly start: number | null;
  readonly end: number | null;
}

class Window implements ActionWindow {
  private readonly root = h("div", "crm-aw");
  private readonly panel = h("aside", "crm-aw-panel");
  private readonly body = h("div", "crm-aw-body");
  private readonly drafts = new Map<string, string>();
  private crm: CrmItem;
  private draft: ActionFields;
  private shown: WindowModel;
  private pending: WindowModel | null = null;
  private editingComment: number | null = null;
  private adding: string | null = null;
  private pointerDown = false;
  private open = true;
  private saving = false;
  private readonly actions: WindowActions;

  constructor(
    crm: CrmItem,
    private readonly start: Start,
    private readonly env: WindowEnvironment,
  ) {
    this.crm = crm;
    this.draft = blankFields(start.kind === "new" ? start.prefill : {}, crm);
    // Le CRM n'ouvre une action existante que si elle y est (`createActionWindow`).
    this.shown = this.model() as WindowModel;
    this.actions = this.makeActions();
    this.panel.tabIndex = -1;
    this.panel.setAttribute("aria-label", this.name === null ? NEW_TITLE : EXISTING_TITLE);
    this.panel.append(this.head(), this.body, this.foot());
    const backdrop = h("div", "crm-aw-backdrop");
    backdrop.addEventListener("click", () => this.close());
    this.root.append(backdrop, this.panel);
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      this.close();
    });
    this.root.addEventListener("pointerdown", () => (this.pointerDown = true), true);
    this.root.addEventListener("focusout", () => setTimeout(this.settle, 0));
    document.addEventListener("pointerup", this.released);
    document.addEventListener("pointercancel", this.released);
    this.render(this.shown);
    document.body.append(this.root);
    // Une nouvelle action commence par son titre ; une action existante n'a pas de champ en cours de saisie.
    const title = this.panel.querySelector<HTMLElement>('[data-field="title"]');
    (this.name === null && title !== null ? title : this.panel).focus();
  }

  get name(): string | null {
    return this.start.kind === "existing" ? this.start.name : null;
  }

  update(crm: CrmItem): void {
    if (!this.open) return;
    this.crm = crm;
    const model = this.model();
    // L'action a disparu (supprimée ailleurs) : rien à enregistrer, la fenêtre se ferme.
    if (model === null) return this.dispose();
    if (signature(model) === signature(this.shown)) {
      this.pending = null;
      return;
    }
    this.pending = model;
    this.settle();
  }

  close(): void {
    if (!this.open) return;
    if (this.name !== null) this.commitTyped();
    this.dispose();
  }

  /** Le modèle de ce qui doit être montré ; `null` si l'action montrée n'existe plus. */
  private model(): WindowModel | null {
    if (this.name === null) return { crm: this.crm, fields: this.draft, action: null };
    const action = this.crm.actions.find((a) => a.name === this.name);
    if (action === undefined) return null;
    return { crm: this.crm, fields: fieldsOf(action, this.crm), action };
  }

  private dispose(): void {
    this.open = false;
    document.removeEventListener("pointerup", this.released);
    document.removeEventListener("pointercancel", this.released);
    this.root.remove();
    this.env.closed();
  }

  private head(): HTMLElement {
    const head = h("header", "crm-aw-head");
    const close = actionButton("crm-aw-close link", CLOSE_TEXT);
    close.addEventListener("click", () => this.close());
    head.append(h("h2", "crm-aw-heading", this.name === null ? NEW_TITLE : EXISTING_TITLE), close);
    return head;
  }

  private foot(): HTMLElement {
    const foot = h("footer", "crm-aw-foot");
    if (this.name === null) {
      const save = actionButton("crm-aw-save-action", SAVE_TEXT);
      save.addEventListener("click", () => void this.save());
      foot.append(save);
    } else {
      const remove = actionButton("crm-aw-delete danger", DELETE_TEXT);
      remove.addEventListener("click", () => void this.remove());
      foot.append(remove);
    }
    return foot;
  }

  /** Dessine le modèle ; le défilement, le champ qui a le curseur et le texte d'ajout sont retrouvés. */
  private render(model: WindowModel): void {
    const keep = this.keptFocus();
    const scroll = this.body.scrollTop;
    const sections = [titleSection, statusSection, peopleSection, projectSection, colorSection];
    const more = [descriptionSection];
    if (model.action !== null) more.push(checklistsSection);
    more.push(tagsSection, linkedNotesSection);
    if (model.action !== null) more.push(commentsSection);
    this.body.replaceChildren(...[...sections, ...more].map((make) => make(model, this.actions)));
    this.shown = model;
    this.pending = null;
    this.body.scrollTop = scroll;
    this.restoreFocus(keep);
  }

  private keptFocus(): KeptFocus | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.body.contains(active)) return null;
    const field = active.dataset.field;
    if (field === undefined) return null;
    const text = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
    return {
      field,
      start: text ? active.selectionStart : null,
      end: text ? active.selectionEnd : null,
    };
  }

  private restoreFocus(keep: KeptFocus | null): void {
    if (keep === null) return;
    const target = this.body.querySelector<HTMLElement>(`[data-field="${keep.field}"]`);
    if (target === null) return;
    target.focus();
    if (keep.start !== null && keep.end !== null && "setSelectionRange" in target)
      (target as HTMLInputElement).setSelectionRange(keep.start, keep.end);
  }

  /** Un champ de texte a le curseur : une saisie est en cours. Un champ d'ajout (`data-draft`) garde son texte à part : il ne retient pas le dessin, sinon la liste qu'on vient d'ajouter n'apparaîtrait qu'en quittant le champ. */
  private typing(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.root.contains(active)) return false;
    if (active.dataset.draft !== undefined) return false;
    return (
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLInputElement && active.type !== "checkbox")
    );
  }

  /** Applique la mise à jour qui attendait, si la saisie est finie et qu'aucun clic n'est en train de se faire. */
  private readonly settle = (): void => {
    const pending = this.pending;
    if (!this.open || pending === null || this.pointerDown || this.typing()) return;
    this.render(pending);
  };

  private readonly released = (): void => {
    this.pointerDown = false;
    setTimeout(this.settle, 0);
  };

  private change(change: CrmActionChangeItem): void {
    if (this.name === null) return this.changeDraft(change);
    this.pending = null;
    if (showsItself(change))
      this.shown = {
        ...this.shown,
        fields: applyChange(this.shown.fields, change, this.crm),
      };
    void this.env.change(this.name, change);
  }

  private changeDraft(change: CrmActionChangeItem): void {
    // Ce qui est tapé et pas encore quitté survit au redessin qu'un changement de liste va faire.
    if (!showsItself(change)) this.commitTyped();
    this.draft = applyChange(this.draft, change, this.crm);
    const model = { crm: this.crm, fields: this.draft, action: null };
    if (showsItself(change)) this.shown = model;
    else this.render(model);
  }

  /** La valeur d'un champ de texte : une valeur vidée reprend la précédente (le titre d'une nouvelle action peut rester vide). */
  private commit(field: TextField, input: HTMLInputElement | HTMLTextAreaElement): void {
    const fields = this.shown.fields;
    if (field === "description") {
      if (input.value !== fields.description)
        this.change({ kind: "body", change: { kind: "description", text: input.value } });
      return;
    }
    const value = input.value.trim();
    const mayBeEmpty = this.name === null;
    input.value = value === "" && !mayBeEmpty ? fields.title : value;
    if (input.value !== fields.title) this.change({ kind: "title", title: input.value });
  }

  /** Ce qui est tapé et pas encore enregistré, pris dans les champs. */
  private commitTyped(): void {
    const fields: TextField[] = ["title", "description"];
    for (const field of fields) {
      const input = this.body.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
      if (input !== null) this.commit(field, input);
    }
    // Une date écrite et pas encore validée : le sélecteur la prend (ou la refuse) comme en quittant le champ.
    this.body.querySelector('[data-field="date"]')?.dispatchEvent(new Event("change"));
  }

  private async save(): Promise<void> {
    if (this.name !== null || this.saving) return;
    this.commitTyped();
    this.saving = true;
    const created = await this.env.create(draftOf(this.draft));
    this.saving = false;
    if (created && this.open) this.dispose();
  }

  private async remove(): Promise<void> {
    const name = this.name;
    if (name === null) return;
    const question = `Placer « ${this.shown.fields.title} » dans la corbeille ?`;
    if (!(await this.env.confirm(question, "Placer dans la corbeille"))) return;
    if ((await this.env.remove(name)) && this.open) this.dispose();
  }

  /** Supprime la checklist après confirmation ; si elle a bougé entre-temps (changement venu d'ailleurs), rien n'est supprimé. */
  private async removeChecklist(index: number, list: ChecklistItem): Promise<void> {
    const confirmed = await this.env.confirm(removeChecklistQuestion(list), DELETE_TEXT);
    const current = this.shown.action?.checklists[index];
    if (!confirmed || current?.name !== list.name) return;
    this.change({ kind: "body", change: { kind: "removeChecklist", list: index } });
  }

  /** Supprime le commentaire après confirmation ; s'il a changé ou disparu entre-temps (changement venu d'ailleurs), rien n'est supprimé. */
  private async removeComment(index: number, comment: CommentItem): Promise<void> {
    const confirmed = await this.env.confirm(removeCommentQuestion(comment), DELETE_TEXT);
    const current = this.shown.action?.comments[index];
    if (!confirmed || current?.at !== comment.at || current.text !== comment.text) return;
    this.change({ kind: "body", change: { kind: "removeComment", comment: index } });
  }

  private async linkNote(): Promise<void> {
    const title = await this.env.chooseNote();
    const notes = this.shown.fields.linkedNotes;
    if (title === null || notes.includes(title)) return;
    this.change({ kind: "linkedNotes", notes: [...notes, title] });
  }

  private async copyEmails(): Promise<void> {
    const emails = emailsToCopy(this.shown.fields.people, this.crm);
    if (emails === "") return;
    try {
      await this.env.copy(emails);
      this.env.notice(EMAILS_COPIED);
    } catch (error) {
      this.env.error(error);
    }
  }

  /** Ouvre le champ d'ajout `key` (le curseur y est mis), ou ferme celui qui est ouvert. */
  private openAdding(key: string | null): void {
    this.adding = key;
    this.render(this.shown);
    if (key !== null) this.body.querySelector<HTMLElement>(`[data-field="${key}"]`)?.focus();
  }

  private makeActions(): WindowActions {
    return {
      change: (change) => this.change(change),
      body: (change) => this.change({ kind: "body", change }),
      commit: (field, input) => this.commit(field, input),
      enter: (input) => {
        this.commit("title", input);
        if (this.name === null) void this.save();
      },
      drafts: {
        get: (key) => this.drafts.get(key) ?? "",
        set: (key, value) => void this.drafts.set(key, value),
      },
      copyEmails: () => void this.copyEmails(),
      openPerson: this.env.openPerson,
      linkNote: () => void this.linkNote(),
      removeChecklist: (index, list) => void this.removeChecklist(index, list),
      removeComment: (index, comment) => void this.removeComment(index, comment),
      adding: {
        get: () => this.adding,
        set: (key) => this.openAdding(key),
      },
      openNote: (title) => this.env.openNote(title),
      openAddress: (url) => this.env.openAddress(url),
      editing: {
        get: () => this.editingComment,
        set: (index) => {
          this.editingComment = index;
          this.render(this.shown);
        },
      },
    };
  }
}

/** Ouvre la fenêtre d'une action sur le CRM `crm` ; rien si l'action à montrer n'y est pas. */
export function createActionWindow(
  crm: CrmItem,
  start: Start,
  env: WindowEnvironment,
): ActionWindow | null {
  if (start.kind === "existing" && !crm.actions.some((a) => a.name === start.name)) return null;
  return new Window(crm, start, env);
}
