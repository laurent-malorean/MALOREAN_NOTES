// Carte mentale (fiche 0050, spécification § 6.2) : dessiner un nœud et mesurer sa taille. Le
// Markdown du titre et du détail est mis en forme par le rendu des notes ; les tailles viennent
// du style, que la mesure lit sur un nœud caché.
import type { MindNodeItem } from "../bridge";
import { noteHtml } from "../rendering/note-html";
import type { Measure } from "../state/mind-map-layout";

/** La plus grande largeur d'un nœud élargi, en points. */
const MAX_WIDTH = 800;
/** Un nœud plus haut que large ÷ 2,5 est élargi. */
const MAX_ASPECT = 2.5;
/** De combien un nœud élargi grandit à chaque essai. */
const WIDENING = 1.25;
/** Au-delà du niveau 4, la taille du texte ne change plus. */
const LAST_LEVEL = 4;
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
/** Ce qui, en tête d'un titre, serait pris pour de la mise en page : il reste du texte. */
const BLOCK_START = /^(#|>|[-*+](?=\s)|\d+[.)](?=\s)|\[[ xX]\]|```|~~~)/;
const PARAGRAPH = /^<p>([\s\S]*?)<\/p>\s*$/;

export interface NodeRenderer {
  /** Les textes à mettre en forme avant de dessiner, ceux que le cache n'a pas encore. */
  missing(nodes: readonly MindNodeItem[]): string[];
  /** Met en forme ces textes et les garde. */
  prepare(texts: readonly string[]): Promise<void>;
  /** Remplit l'élément `element` du nœud `node` de ce niveau. */
  fill(element: HTMLElement, node: MindNodeItem, level: number): void;
  /** Mesure un nœud, par l'élément caché `probe`. */
  measure(probe: HTMLElement): Measure;
}

const detailText = (node: MindNodeItem) => node.detail.join("\n");

function titleMarkdown(title: string): string {
  return BLOCK_START.test(title) ? `\\${title}` : title;
}

/** Ce qui commence l'adresse d'un lien entre notes, une fois écrit en lien Markdown. */
export const WIKI_ADDRESS = "#wiki-";

/** Les liens `[[titre]]` et `[[titre|texte]]` du Markdown, écrits en liens que le rendu garde. */
function wikiToLinks(markdown: string): string {
  return markdown.replace(WIKI_LINK, (_, target: string, text?: string) => {
    return `[${text ?? target}](${WIKI_ADDRESS}${encodeURIComponent(target.trim())})`;
  });
}

/** Le HTML d'un titre : le paragraphe sans son enveloppe. */
const inline = (html: string) => PARAGRAPH.exec(html)?.[1] ?? html;

class Renderer implements NodeRenderer {
  private readonly titles = new Map<string, string>();
  private readonly details = new Map<string, string>();
  /** Les nœuds que la mesure a élargis : leur détail n'est plus limité à 40 caractères. */
  private readonly widened = new WeakMap<MindNodeItem, boolean>();
  private readonly options: { resolveImage: (src: string) => string };

  constructor(resolveImage: (src: string) => string) {
    this.options = { resolveImage };
  }

  missing(nodes: readonly MindNodeItem[]): string[] {
    const texts: string[] = [];
    for (const node of nodes) {
      if (!this.titles.has(node.title)) texts.push(`t:${node.title}`);
      if (node.detail.length > 0 && !this.details.has(detailText(node)))
        texts.push(`d:${detailText(node)}`);
      texts.push(...this.missing(node.children));
    }
    return texts;
  }

  async prepare(texts: readonly string[]): Promise<void> {
    await Promise.all(
      texts.map(async (tagged) => {
        const text = tagged.slice(2);
        if (tagged.startsWith("t:"))
          this.titles.set(
            text,
            inline(await noteHtml(wikiToLinks(titleMarkdown(text)), this.options)),
          );
        else this.details.set(text, await noteHtml(wikiToLinks(text), this.options));
      }),
    );
  }

  fill(element: HTMLElement, node: MindNodeItem, level: number): void {
    element.className = `mind-map-node level-${Math.min(level, LAST_LEVEL)}`;
    if (level === 1) element.classList.add("root");
    if (node.color !== null) {
      element.classList.add("colored");
      element.style.setProperty("--node-color", `var(--palette-${node.color})`);
    }
    element.replaceChildren();
    const title = document.createElement("div");
    title.className = "mind-map-title";
    title.innerHTML = this.titles.get(node.title) ?? "";
    element.append(title);
    if (node.detail.length === 0) return;
    const detail = document.createElement("div");
    detail.className = "mind-map-detail";
    detail.innerHTML = this.details.get(detailText(node)) ?? "";
    element.append(detail);
  }

  measure(probe: HTMLElement): Measure {
    return (node, level, width) => {
      this.fill(probe, node, level);
      // Le nœud de mesure reste caché : remplir en refait la liste des classes.
      probe.classList.add("mind-map-probe");
      probe.style.width = width === undefined ? "" : `${width}px`;
      if (width !== undefined) {
        probe.classList.toggle("wide", this.widened.get(node) === true);
        return { width, height: probe.offsetHeight };
      }
      return this.widen(probe, node);
    };
  }

  /** La taille naturelle du nœud, élargie tant que cela réduit sa hauteur et qu'il est trop haut. */
  private widen(probe: HTMLElement, node: MindNodeItem): { width: number; height: number } {
    let width = probe.offsetWidth;
    let height = probe.offsetHeight;
    let wide = false;
    while (height > width / MAX_ASPECT && width < MAX_WIDTH) {
      const next = Math.min(MAX_WIDTH, width * WIDENING);
      probe.style.width = `${next}px`;
      probe.classList.add("wide");
      const nextHeight = probe.offsetHeight;
      if (nextHeight >= height) break;
      [width, height, wide] = [next, nextHeight, true];
    }
    this.widened.set(node, wide);
    probe.classList.toggle("wide", wide);
    probe.style.width = wide ? `${width}px` : "";
    return { width, height };
  }
}

export function createNodeRenderer(resolveImage: (src: string) => string): NodeRenderer {
  return new Renderer(resolveImage);
}
