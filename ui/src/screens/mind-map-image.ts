// Carte mentale : l'image PNG de toute la carte. Les nœuds et les liens affichés sont recopiés,
// chacun avec son apparence calculée, dans une image SVG (qui n'a pas accès à la feuille de style),
// dessinée sur un canevas puis lue en PNG. Le zoom et la vue de l'écran ne changent pas l'image.
import { IMAGE_SCALE, type ImageFrame } from "../state/mind-map-image";

const SVG = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";

/** Une copie de l'élément et de ce qu'il contient, chacun portant son apparence calculée. */
function withStyles(element: Element): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  originals.forEach((original, i) => {
    const computed = getComputedStyle(original);
    const target = copies[i];
    if (target) {
      target.style.cssText = [...computed]
        .map((name) => `${name}:${computed.getPropertyValue(name)}`)
        .join(";");
    }
  });
  return copy;
}

/** Le fond de la carte : le sien, sinon celui de la page. */
function backgroundOf(surface: HTMLElement): string {
  const own = getComputedStyle(surface).backgroundColor;
  const transparent = /,\s*0\)$/.test(own) || own === "transparent";
  return transparent ? getComputedStyle(document.body).backgroundColor : own;
}

function svgOf(
  frame: ImageFrame,
  world: HTMLElement,
  links: Element,
  background: string,
): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("xmlns", SVG);
  // Pixels réels et cadre en points : l'image est tramée directement à 2 pixels par point, nette.
  svg.setAttribute("width", String(frame.pixelsWide));
  svg.setAttribute("height", String(frame.pixelsHigh));
  const ground = document.createElementNS(SVG, "rect");
  ground.setAttribute("width", String(frame.pixelsWide));
  ground.setAttribute("height", String(frame.pixelsHigh));
  ground.setAttribute("fill", background);
  const content = document.createElementNS(SVG, "g");
  const shifted = document.createElementNS(SVG, "g");
  shifted.setAttribute("transform", `scale(${IMAGE_SCALE}) translate(${-frame.x} ${-frame.y})`);
  for (const path of links.querySelectorAll("path")) {
    const computed = getComputedStyle(path);
    const copy = path.cloneNode() as SVGPathElement;
    copy.setAttribute("fill", "none");
    copy.setAttribute("stroke", computed.stroke);
    copy.setAttribute("stroke-width", computed.strokeWidth);
    shifted.append(copy);
  }
  const holder = document.createElementNS(SVG, "foreignObject");
  holder.setAttribute("width", String(frame.pixelsWide));
  holder.setAttribute("height", String(frame.pixelsHigh));
  const page = document.createElement("div");
  page.setAttribute("xmlns", XHTML);
  page.style.cssText = `position:relative;width:${frame.pixelsWide}px;height:${frame.pixelsHigh}px;overflow:hidden`;
  const sheet = document.createElement("div");
  sheet.style.cssText = `position:absolute;left:${-frame.x * IMAGE_SCALE}px;top:${-frame.y * IMAGE_SCALE}px;transform:scale(${IMAGE_SCALE});transform-origin:0 0`;
  page.append(sheet);
  for (const node of world.querySelectorAll(".mind-map-node[data-path]")) {
    const copy = withStyles(node);
    copy.classList.remove("selected", "editing");
    copy.style.boxShadow = "none";
    for (const fold of copy.querySelectorAll(".mind-map-fold")) fold.remove();
    sheet.append(copy);
  }
  holder.append(page);
  content.append(shifted, holder);
  svg.append(ground, content);
  return svg;
}

function loaded(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("L'image n'a pas pu être créée."));
    image.src = source;
  });
}

/** L'image PNG de la carte entière : ses nœuds et ses liens, sur le fond de la carte. */
export async function mapImage(
  frame: ImageFrame,
  surface: HTMLElement,
  world: HTMLElement,
  links: Element,
): Promise<Uint8Array> {
  const svg = svgOf(frame, world, links, backgroundOf(surface));
  const markup = new XMLSerializer().serializeToString(svg);
  const image = await loaded(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  const canvas = document.createElement("canvas");
  canvas.width = frame.pixelsWide;
  canvas.height = frame.pixelsHigh;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("L'image n'a pas pu être créée.");
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob === null) throw new Error("L'image n'a pas pu être créée.");
  return new Uint8Array(await blob.arrayBuffer());
}
