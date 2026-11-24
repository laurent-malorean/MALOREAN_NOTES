// Canvas (fiche 0052, spécification § 3, § 6 et § 7) : modifier un contenu sur place. Le texte d'une carte, le nom
// d'un groupe, l'étiquette d'une flèche : un champ de saisie ; un clic ailleurs ou Échap garde ce qui est écrit.
import type { CanvasItem } from "../bridge";
import { arrow, card, withArrowChanged, withCardChanged } from "../state/canvas-model";
import type { Selectable } from "../state/canvas-model";
import { curveOf } from "./canvas-arrows";

/** Ce que la saisie sur place demande à la vue. */
export interface EditHost {
  readonly data: () => CanvasItem;
  readonly change: (next: CanvasItem) => void;
  readonly rerender: () => void;
  readonly element: (id: string) => HTMLElement | undefined;
  /** Le calque des étiquettes de flèche. */
  readonly labels: HTMLElement;
  /** Une saisie commence (la barre de la sélection se retire) ou finit (`null`). */
  readonly editing: (item: Selectable | null) => void;
}

/** Un champ de saisie posé dans `host` ; `done` reçoit le texte quand on clique ailleurs ou tape Échap (ou Entrée pour une ligne). */
function inline(
  place: HTMLElement,
  field: HTMLTextAreaElement | HTMLInputElement,
  done: (text: string) => void,
): void {
  field.className = "canvas-editor";
  place.append(field);
  field.focus();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    field.remove();
    done(field.value);
  };
  field.addEventListener("blur", finish);
  (field as HTMLElement).addEventListener("keydown", (event) => {
    event.stopPropagation();
    const line = field instanceof HTMLInputElement && event.key === "Enter";
    if (event.key === "Escape" || line) {
      event.preventDefault();
      finish();
    }
  });
  for (const type of ["pointerdown", "dblclick", "click"])
    field.addEventListener(type, (event) => event.stopPropagation());
}

/** Le texte d'une carte texte. */
export function editText(host: EditHost, id: string): void {
  const element = host.element(id);
  const body = element?.querySelector<HTMLElement>(".canvas-card-body");
  const current = card(host.data(), id);
  if (!body || current === undefined) return;
  host.editing({ kind: "card", id });
  const field = document.createElement("textarea");
  field.value = current.text ?? "";
  element?.classList.add("editing");
  inline(body, field, (text) => {
    element?.classList.remove("editing");
    host.editing(null);
    if (card(host.data(), id)?.text !== text)
      host.change(withCardChanged(host.data(), id, { text }));
    else host.rerender();
  });
}

/** Le nom d'un groupe. */
export function editGroupLabel(host: EditHost, id: string): void {
  const element = host.element(id);
  const current = card(host.data(), id);
  if (element === undefined || current === undefined) return;
  host.editing({ kind: "card", id });
  const field = document.createElement("input");
  field.value = current.label ?? "";
  inline(element, field, (text) => {
    host.editing(null);
    const label = text === "" ? null : text;
    if (label !== current.label) host.change(withCardChanged(host.data(), id, { label }));
    else host.rerender();
  });
}

/** L'étiquette d'une flèche, posée au milieu de la courbe. */
export function editArrowLabel(host: EditHost, id: string): void {
  const current = arrow(host.data(), id);
  const curve = current === undefined ? null : curveOf(host.data(), current);
  if (current === undefined || curve === null) return;
  host.editing({ kind: "arrow", id });
  host.rerender();
  const field = document.createElement("input");
  field.value = current.label ?? "";
  field.style.left = `${(curve.from.x + curve.to.x) / 2}px`;
  field.style.top = `${(curve.from.y + curve.to.y) / 2}px`;
  inline(host.labels, field, (text) => {
    host.editing(null);
    const label = text === "" ? null : text;
    if (label !== current.label) host.change(withArrowChanged(host.data(), id, { label }));
    else host.rerender();
  });
}
