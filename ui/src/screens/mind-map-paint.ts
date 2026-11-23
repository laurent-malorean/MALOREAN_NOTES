// Carte mentale (fiche 0050) : ce que l'écran dessine d'un nœud, d'un lien, d'une demande de
// confirmation. Aucune règle : tout vient de la disposition calculée par `state/mind-map-layout.ts`.
import { descendantsCount, pathKey } from "../state/mind-map";
import type { Box, Layout } from "../state/mind-map-layout";
import type { NodeRenderer } from "./mind-map-nodes";

const SVG = "http://www.w3.org/2000/svg";

export function button(label: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "mind-map-button";
  element.textContent = text;
  element.setAttribute("aria-label", label);
  element.addEventListener("click", onClick);
  return element;
}

/** Les liens : une courbe du milieu du bord droit du parent au milieu du bord gauche de l'enfant. */
export function drawLinks(svg: Element, layout: Layout): void {
  svg.replaceChildren();
  const byKey = new Map(layout.boxes.map((box) => [pathKey(box.path), box]));
  for (const link of layout.links) {
    const from = byKey.get(link.from);
    const to = byKey.get(link.to);
    if (!from || !to) continue;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const y2 = to.y + to.height / 2;
    const middle = (x1 + to.x) / 2;
    const curve = document.createElementNS(SVG, "path");
    curve.setAttribute("d", `M${x1} ${y1} C${middle} ${y1} ${middle} ${y2} ${to.x} ${y2}`);
    curve.setAttribute("class", "mind-map-link");
    svg.append(curve);
  }
}

export interface NodeState {
  readonly selected: boolean;
  readonly editing: boolean;
}

/** Le nœud : sa boîte, son texte, et son bouton de pliage s'il a des enfants. */
export function nodeElement(
  renderer: NodeRenderer,
  box: Box,
  state: NodeState,
  onFold: () => void,
): HTMLElement {
  const element = document.createElement("div");
  renderer.fill(element, box.node, box.level);
  element.dataset.path = pathKey(box.path);
  element.style.left = `${box.x}px`;
  element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`;
  if (state.selected) element.classList.add("selected");
  if (state.editing) element.classList.add("editing");
  if (!box.hasChildren) return element;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mind-map-fold";
  toggle.textContent = box.folded ? `+${descendantsCount(box.node)}` : "−";
  toggle.setAttribute("aria-label", box.folded ? "Déplier la branche" : "Plier la branche");
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    onFold();
  });
  for (const type of ["pointerdown", "dblclick"])
    toggle.addEventListener(type, (event) => event.stopPropagation());
  element.append(toggle);
  return element;
}

/** Demande, sur la carte `host`, si l'on supprime une branche qui a `count` descendants. */
export function confirmDeletion(host: HTMLElement, count: number): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "mind-map-confirm";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-label", "Supprimer la branche");
    const message = document.createElement("p");
    message.textContent =
      count === 1
        ? "Supprimer ce nœud et son descendant ?"
        : `Supprimer ce nœud et ses ${count} descendants ?`;
    const answer = (yes: boolean) => () => {
      dialog.remove();
      host.focus();
      resolve(yes);
    };
    const yes = button("Supprimer", "Supprimer", answer(true));
    yes.classList.add("danger");
    dialog.append(message, yes, button("Annuler", "Annuler", answer(false)));
    host.append(dialog);
    yes.focus();
  });
}
