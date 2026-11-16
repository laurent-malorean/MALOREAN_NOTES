// Mise en forme en direct : la syntaxe Markdown reste visible, le texte prend son style.
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Les valeurs viennent du thème (theme.css) : ici, seulement quel style va à quel élément.
const theme = (name: string) => `var(--${name})`;

export const liveFormatting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, fontSize: theme("heading1-size"), fontWeight: "700" },
    { tag: tags.heading2, fontSize: theme("heading2-size"), fontWeight: "700" },
    { tag: tags.heading3, fontSize: theme("heading3-size"), fontWeight: "700" },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.monospace, fontFamily: theme("mono"), color: theme("code") },
    { tag: tags.link, color: theme("accent") },
    { tag: tags.url, color: theme("accent"), textDecoration: "underline" },
    { tag: tags.quote, color: theme("muted"), fontStyle: "italic" },
    { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: theme("marker") },
    // Blocs de code, selon leur langue.
    { tag: tags.keyword, color: theme("syntax-keyword") },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: theme("syntax-string") },
    { tag: tags.comment, color: theme("syntax-comment"), fontStyle: "italic" },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: theme("syntax-number") },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: theme("syntax-function"),
    },
    { tag: [tags.typeName, tags.className, tags.namespace], color: theme("syntax-type") },
    { tag: [tags.propertyName, tags.attributeName], color: theme("syntax-property") },
    { tag: tags.tagName, color: theme("syntax-tag") },
    { tag: tags.variableName, color: theme("syntax-plain") },
  ]),
);
