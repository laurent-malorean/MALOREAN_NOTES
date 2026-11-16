// Mise en forme en direct : la syntaxe Markdown reste visible, le texte prend son style.
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const MARKER_COLOR = "var(--marker)";

export const liveFormatting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, fontSize: "1.8em", fontWeight: "700" },
    { tag: tags.heading2, fontSize: "1.45em", fontWeight: "700" },
    { tag: tags.heading3, fontSize: "1.2em", fontWeight: "700" },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.monospace, fontFamily: "var(--mono)", color: "var(--code)" },
    { tag: tags.link, color: "var(--accent)" },
    { tag: tags.url, color: "var(--accent)", textDecoration: "underline" },
    { tag: tags.quote, color: "var(--muted)", fontStyle: "italic" },
    { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: MARKER_COLOR },
  ]),
);
