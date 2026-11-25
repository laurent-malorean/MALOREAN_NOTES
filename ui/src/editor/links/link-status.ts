// Les liens ambigus d'une note : un lien dont le nom est porté par plusieurs contenus n'ouvre
// aucun d'eux au hasard ; son texte est souligné en pointillés, avec une bulle d'aide qui dit
// comment préciser le dossier. Rust décide (résolution d'un lien) ; l'éditeur le demande.
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { LinkResolutionItem } from "../../bridge";
import { noteLinksIn } from "./note-links";
import "./link-status.css";

/** Ce que l'éditeur demande à l'application : ce que désigne chaque cible de lien. */
export interface LinkStatusSupport {
  readonly resolve: (targets: readonly string[]) => Promise<LinkResolutionItem[]>;
}

/** Délai, en millisecondes, entre la dernière frappe et la question à Rust. */
export const LINK_CHECK_DELAY_MS = 300;
/** La bulle d'aide d'un lien ambigu. */
export const AMBIGUOUS_HINT =
  "Plusieurs contenus portent ce nom : écrivez le dossier devant, [[Dossier/nom]]";

/** Les cibles de lien que Rust a dites ambiguës. */
const known = StateEffect.define<ReadonlySet<string>>();

const ambiguousMark = Decoration.mark({
  class: "cm-note-link-ambiguous",
  attributes: { title: AMBIGUOUS_HINT },
});

/** Les cibles différentes des liens du texte, dans l'ordre. */
const targetsOf = (text: string) => [...new Set(noteLinksIn(text).map((link) => link.title))];

function decorations(view: EditorView, ambiguous: ReadonlySet<string>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const start = view.state.doc.lineAt(from).from;
    const text = view.state.sliceDoc(start, view.state.doc.lineAt(to).to);
    for (const link of noteLinksIn(text)) {
      if (ambiguous.has(link.title)) {
        builder.add(start + link.textFrom, start + link.textTo, ambiguousMark);
      }
    }
  }
  return builder.finish();
}

class LinkStatus {
  decorations: DecorationSet;
  private ambiguous: ReadonlySet<string> = new Set();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly support: LinkStatusSupport,
  ) {
    this.decorations = decorations(view, this.ambiguous);
    this.schedule(0);
  }

  update(update: ViewUpdate): void {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) if (effect.is(known)) this.ambiguous = effect.value;
    }
    if (update.docChanged) this.schedule(LINK_CHECK_DELAY_MS);
    else if (update.focusChanged && this.view.hasFocus) this.schedule(0);
    this.decorations = decorations(update.view, this.ambiguous);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.check(), delay);
  }

  private async check(): Promise<void> {
    const targets = targetsOf(this.view.state.doc.toString());
    const found = targets.length === 0 ? [] : await this.support.resolve(targets).catch(() => []);
    if (this.destroyed) return;
    const ambiguous = new Set(targets.filter((_, index) => found[index]?.kind === "ambiguous"));
    this.view.dispatch({ effects: known.of(ambiguous) });
  }
}

/** Souligne les liens ambigus du texte, d'après ce que Rust répond. */
export function linkStatus(support: LinkStatusSupport) {
  return ViewPlugin.fromClass(
    class extends LinkStatus {
      constructor(view: EditorView) {
        super(view, support);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
