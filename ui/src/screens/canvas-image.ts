// Canvas (fiche 0052, spécification § 12) : l'image PNG de tout le canvas, faite comme celle de la carte
// mentale (fiche 0050). Les cartes et les flèches affichées sont recopiées, chacune avec son apparence
// calculée, dans une image SVG dessinée sur un canevas. Le `foreignObject` couvre toute l'image à l'origine,
// sans `x`/`y` ni `viewBox` : les cartes sont posées en positions absolues dans un conteneur HTML mis à
// l'échelle en CSS, et seules les flèches passent par la transformation SVG (WebKit n'applique pas les mêmes
// décalages au HTML d'un `foreignObject` et au tracé SVG).
import type { CanvasItem } from "../bridge";
import { canvasFrame } from "../state/canvas-image";
import { IMAGE_SCALE, type ImageFrame } from "../state/mind-map-image";
import { SVG, XHTML, backgroundOf, pngOf, withStyles } from "./mind-map-image";

/**
 * L'image à l'adresse `src`, en adresse de données : une image SVG n'en charge pas d'autres. Une image
 * illisible fait échouer l'export, en nommant le fichier : jamais de carte image dessinée vide en silence.
 */
async function inlined(src: string, name: string): Promise<string> {
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("image illisible"));
      reader.readAsDataURL(blob);
    });
  } catch {
    throw new Error(`L'image « ${name} » n'a pas pu être lue : l'export est annulé.`);
  }
}

async function cardCopies(
  world: Element,
  names: ReadonlyMap<string, string>,
): Promise<HTMLElement[]> {
  const copies: HTMLElement[] = [];
  for (const card of world.querySelectorAll(".canvas-card")) {
    const copy = withStyles(card);
    copy.classList.remove("selected", "only-selected", "editing");
    copy.style.boxShadow = "none";
    for (const extra of copy.querySelectorAll(".canvas-grip, .canvas-link-dot, .canvas-far-icon"))
      extra.remove();
    const name = names.get(card.getAttribute("data-id") ?? "") ?? "";
    for (const image of copy.querySelectorAll("img")) image.src = await inlined(image.src, name);
    copies.push(copy);
  }
  return copies;
}

function lineCopies(world: Element): SVGElement[] {
  const copies: SVGElement[] = [];
  for (const line of world.querySelectorAll(
    ".canvas-arrows:not(.canvas-draft) .canvas-arrow-line",
  )) {
    const computed = getComputedStyle(line);
    const copy = line.cloneNode() as SVGPathElement;
    copy.setAttribute("fill", "none");
    copy.setAttribute("stroke", computed.stroke);
    copy.setAttribute("stroke-width", "2");
    copies.push(copy);
  }
  for (const head of world.querySelectorAll(".canvas-arrow-head")) {
    const copy = head.cloneNode() as SVGPolygonElement;
    copy.setAttribute("fill", getComputedStyle(head).fill);
    copies.push(copy);
  }
  return copies;
}

async function svgOf(
  frame: ImageFrame,
  world: Element,
  background: string,
  names: ReadonlyMap<string, string>,
): Promise<SVGSVGElement> {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("xmlns", SVG);
  svg.setAttribute("width", String(frame.pixelsWide));
  svg.setAttribute("height", String(frame.pixelsHigh));
  const ground = document.createElementNS(SVG, "rect");
  ground.setAttribute("width", String(frame.pixelsWide));
  ground.setAttribute("height", String(frame.pixelsHigh));
  ground.setAttribute("fill", background);
  const shifted = document.createElementNS(SVG, "g");
  shifted.setAttribute("transform", `scale(${IMAGE_SCALE}) translate(${-frame.x} ${-frame.y})`);
  shifted.append(...lineCopies(world));
  const holder = document.createElementNS(SVG, "foreignObject");
  holder.setAttribute("width", String(frame.pixelsWide));
  holder.setAttribute("height", String(frame.pixelsHigh));
  const page = document.createElement("div");
  page.setAttribute("xmlns", XHTML);
  page.style.cssText = `position:relative;width:${frame.pixelsWide}px;height:${frame.pixelsHigh}px;overflow:hidden`;
  const sheet = document.createElement("div");
  sheet.style.cssText = `position:absolute;left:${-frame.x * IMAGE_SCALE}px;top:${-frame.y * IMAGE_SCALE}px;transform:scale(${IMAGE_SCALE});transform-origin:0 0`;
  sheet.append(...(await cardCopies(world, names)));
  for (const label of world.querySelectorAll(".canvas-arrow-label"))
    sheet.append(withStyles(label));
  page.append(sheet);
  holder.append(page);
  svg.append(ground, shifted, holder);
  return svg;
}

/** L'image PNG du canvas entier, sur le fond de l'écran ; `null` pour un canvas vide. */
export async function canvasImage(
  canvas: CanvasItem,
  root: HTMLElement,
): Promise<Uint8Array | null> {
  const frame = canvasFrame(canvas);
  const world = root.querySelector(".canvas-world");
  if (frame === null || world === null) return null;
  const surface = root.querySelector<HTMLElement>(".canvas-surface") ?? root;
  const names = new Map(canvas.cards.map((card) => [card.id, card.file ?? card.id]));
  return pngOf(frame, await svgOf(frame, world, backgroundOf(surface), names));
}
