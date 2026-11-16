// Applique l'aperçu en direct à l'écran, pour la seule partie visible du document.
import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Conceal, computePreview, type LineStyle } from "./preview";
import { BulletWidget, CheckboxWidget, RuleWidget } from "./widgets";

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const checkboxes = {
  checked: Decoration.replace({ widget: new CheckboxWidget(true) }),
  unchecked: Decoration.replace({ widget: new CheckboxWidget(false) }),
};

function decorationFor(conceal: Conceal): Decoration {
  switch (conceal.kind) {
    case "hide":
      return hidden;
    case "bullet":
      return bullet;
    case "rule":
      return rule;
    case "checkbox":
      return conceal.checked ? checkboxes.checked : checkboxes.unchecked;
  }
}

/** Lignes touchées par le curseur ou la sélection ; aucune si l'éditeur n'a pas le focus. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = view.state.doc.lineAt(range.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state);
  const active = activeLines(view);
  const conceals = new Map<number, Conceal>();
  const lineStyles = new Map<string, LineStyle>();
  for (const { from, to } of view.visibleRanges) {
    const preview = computePreview({ doc: view.state.doc, tree, activeLines: active, from, to });
    for (const c of preview.conceals) conceals.set(c.from, c);
    for (const s of preview.lineStyles) lineStyles.set(`${s.from}:${s.className}`, s);
  }
  const ranges: Range<Decoration>[] = [
    ...[...lineStyles.values()].map((s) => Decoration.line({ class: s.className }).range(s.from)),
    ...[...conceals.values()].map((c) => decorationFor(c).range(c.from, c.to)),
  ];
  return Decoration.set(ranges, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = build(update.view);
      } else if (update.focusChanged || treeChanged) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
