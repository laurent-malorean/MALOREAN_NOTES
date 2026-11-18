// Copie mise en forme : le rendu HTML d'une note, chaque élément portant son apparence dans son
// attribut `style`, car les mails et les documents où on le colle ignorent les classes et les
// feuilles de style. L'apparence est celle de la feuille d'impression (thème clair), ses valeurs
// lues dans le thème ; les images sont incluses dans le HTML tant qu'elles restent raisonnables.

/** Le style de chaque élément, par nom de balise (`h1`, `pre code`) ou de classe (`syntax-…`). */
export type NoteStyles = Readonly<Record<string, string>>;

/** La valeur d'une variable du thème (`--text`), telle que la feuille d'impression la voit. */
export type ThemeToken = (name: string) => string;

/** La taille permise pour toutes les images d'une copie, adresses `data:` comprises. */
export const IMAGES_BUDGET = 8 * 1024 * 1024;

/** Les styles de la feuille d'impression (style.css), avec les valeurs du thème. */
export function noteStyles(token: ThemeToken): NoteStyles {
  const color = (name: string) => `color: ${token(name)}`;
  const border = `1px solid ${token("--border")}`;
  const cell = `border: ${border}; padding: 0.3em 0.7em; text-align: left`;
  const syntax = (kind: string) => color(`--syntax-${kind}`);
  return {
    sheet: `${color("--text")}; font-family: ${token("--text-font")}; font-size: ${token("--text-size")}; line-height: ${token("--line-height")}`,
    h1: `font-size: ${token("--heading1-size")}`,
    h2: `font-size: ${token("--heading2-size")}`,
    h3: `font-size: ${token("--heading3-size")}`,
    a: color("--accent"),
    blockquote: `margin: 1em 0; padding-left: 1em; border-left: 3px solid ${token("--border")}; ${color("--muted")}; font-style: italic`,
    code: `font-family: ${token("--mono")}; ${color("--code")}`,
    pre: `padding: 0.8em 1em; border-radius: 4px; background: ${token("--code-block-background")}; font-size: ${token("--code-block-text-size")}; white-space: pre-wrap`,
    "pre code": `font-family: ${token("--mono")}; ${syntax("plain")}`,
    table: `border-collapse: collapse; font-size: ${token("--table-text-size")}`,
    th: `${cell}; background: ${token("--sidebar")}`,
    td: cell,
    hr: `border: none; border-top: ${border}`,
    img: "max-width: 100%",
    "syntax-keyword": syntax("keyword"),
    "syntax-string": syntax("string"),
    "syntax-comment": `${syntax("comment")}; font-style: italic`,
    "syntax-number": syntax("number"),
    "syntax-function": syntax("function"),
    "syntax-type": syntax("type"),
    "syntax-property": syntax("property"),
    "syntax-tag": syntax("tag"),
  };
}

const attribute = (style = "") => ` style="${style.replaceAll('"', "&quot;")}"`;

/**
 * Le rendu HTML d'une note (`noteHtml`) dont chaque élément porte son style dans son attribut ;
 * les cases à cocher deviennent ☐ et ☑, que les mails gardent.
 */
export function styledHtml(html: string, styles: NoteStyles): string {
  const body = html
    .replaceAll('<input type="checkbox" disabled checked>', "☑")
    .replaceAll('<input type="checkbox" disabled>', "☐")
    // Le rendu n'écrit que des balises sans attribut, sauf `a`, `img` et les `span` colorés.
    .replace(/<([a-z][a-z0-9]*)(?=[ >])/g, (tag, name: string) =>
      Object.hasOwn(styles, name) ? tag + attribute(styles[name]) : tag,
    )
    .replaceAll(
      `<pre${attribute(styles.pre)}><code${attribute(styles.code)}>`,
      `<pre${attribute(styles.pre)}><code${attribute(styles["pre code"])}>`,
    )
    .replace(/ class="(syntax-[a-z]+)"/g, (_, name: string) => attribute(styles[name]));
  return `<div${attribute(styles.sheet)}>${body}</div>`;
}

/**
 * Le HTML dont chaque image est incluse en adresse `data:` donnée par `load`, dans l'ordre, tant
 * que toutes tiennent dans `budget` caractères ; une image illisible ou qui ne tient plus est
 * laissée de côté. Les adresses du rendu sont celles du protocole des fichiers, déjà encodées.
 */
export async function withEmbeddedImages(
  html: string,
  load: (src: string) => Promise<string | null>,
  budget = IMAGES_BUDGET,
): Promise<string> {
  let left = budget;
  let result = html;
  for (const [tag, src] of html.matchAll(/<img src="([^"]*)"[^>]*>/g)) {
    const data = await load(src as string);
    const fits = data !== null && data.length <= left;
    if (fits) left -= data.length;
    result = result.replace(tag, () => (fits ? tag.replace(src as string, () => data) : ""));
  }
  return result;
}
