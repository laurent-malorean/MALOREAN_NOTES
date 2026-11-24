// Canvas (fiche 0052, spécification § 5 et § 6) : dessiner les flèches, courbes fines avec une pointe à
// l'arrivée, un halo quand elles sont sélectionnées, et leur étiquette au milieu.
import type { CanvasArrowItem, CanvasItem } from "../bridge";
import { type Side, card, rectOf } from "../state/canvas-model";
import { anchor, curve, headAngle, pathOf, pointAt, type Curve } from "../state/canvas-geometry";
import { colorOf } from "./canvas-cards";

const SVG = "http://www.w3.org/2000/svg";
const HEAD_SIZE = 12;

/** La courbe d'une flèche entre ses deux cartes ; `null` si une carte manque. */
export function curveOf(canvas: CanvasItem, a: CanvasArrowItem): Curve | null {
  const from = card(canvas, a.from);
  const to = card(canvas, a.to);
  if (from === undefined || to === undefined) return null;
  return curve(
    anchor(rectOf(from), a.fromSide as Side),
    a.fromSide as Side,
    anchor(rectOf(to), a.toSide as Side),
    a.toSide as Side,
  );
}

function svg(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function head(c: Curve, end: "from" | "to"): SVGElement {
  const tip = end === "to" ? c.to : c.from;
  const half = HEAD_SIZE / 2;
  return svg("polygon", {
    class: "canvas-arrow-head",
    points: `0,0 ${-HEAD_SIZE},${-half} ${-HEAD_SIZE},${half}`,
    transform: `translate(${tip.x} ${tip.y}) rotate(${headAngle(c, end)})`,
  });
}

/** Le groupe SVG d'une flèche : zone de clic large, trait, pointes ; et, si elle est sélectionnée, les deux ronds des extrémités. */
function arrowGroup(a: CanvasArrowItem, c: Curve, selected: boolean): SVGElement {
  const group = svg("g", { class: "canvas-arrow", "data-arrow": a.id });
  group.classList.toggle("selected", selected);
  const color = colorOf(a);
  if (color !== null)
    (group as SVGElement & ElementCSSInlineStyle).style.setProperty("--arrow-color", color);
  group.append(svg("path", { class: "canvas-arrow-hit", d: pathOf(c) }));
  group.append(svg("path", { class: "canvas-arrow-line", d: pathOf(c) }));
  if (a.fromEnd === "arrow") group.append(head(c, "from"));
  if (a.toEnd === "arrow") group.append(head(c, "to"));
  if (selected) {
    for (const [end, at] of [
      ["from", c.from],
      ["to", c.to],
    ] as const)
      group.append(
        svg("circle", {
          class: "canvas-arrow-end",
          "data-end": end,
          cx: `${at.x}`,
          cy: `${at.y}`,
          r: "6",
        }),
      );
  }
  return group;
}

/** L'étiquette d'une flèche, posée au milieu de la courbe sur un fond qui masque la ligne. */
function labelOf(a: CanvasArrowItem, c: Curve, selected: boolean): HTMLElement {
  const label = document.createElement("div");
  label.className = "canvas-arrow-label";
  label.dataset.arrow = a.id;
  label.classList.toggle("selected", selected);
  const middle = pointAt(c, 0.5);
  label.style.left = `${middle.x}px`;
  label.style.top = `${middle.y}px`;
  label.textContent = a.label;
  return label;
}

/** Redessine toutes les flèches : les traits dans `lines`, les étiquettes dans `labels`. */
export function drawArrows(
  lines: SVGElement,
  labels: HTMLElement,
  canvas: CanvasItem,
  selected: ReadonlySet<string>,
  editing: string | null,
): void {
  lines.replaceChildren();
  labels.replaceChildren();
  for (const a of canvas.arrows) {
    const c = curveOf(canvas, a);
    if (c === null) continue;
    const isSelected = selected.has(a.id);
    lines.append(arrowGroup(a, c, isSelected));
    if (a.label !== null && a.label !== "" && editing !== a.id)
      labels.append(labelOf(a, c, isSelected));
  }
}
