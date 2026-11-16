// Tableaux dessinés à la place de leur texte, sauf celui où se trouve le curseur.
// Un tableau occupe plusieurs lignes : CodeMirror n'accepte ce remplacement que d'un champ d'état.
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { renderInline } from "./inline";
import { parseTable, type Table } from "./table";

const TABLE = "Table";

/** Tableau dessiné ; un clic place le curseur au début de son texte pour le modifier. */
class TableWidget extends WidgetType {
  constructor(readonly table: Table) {
    super();
  }
  override eq(other: TableWidget) {
    return JSON.stringify(other.table) === JSON.stringify(this.table);
  }
  toDOM(view: EditorView) {
    const element = document.createElement("table");
    element.className = "cm-lp-table";
    const head = element.createTHead().insertRow();
    for (const [i, text] of this.table.header.entries()) this.cell(head, "th", text, i);
    const body = element.createTBody();
    for (const row of this.table.rows) {
      const line = body.insertRow();
      for (const [i, text] of row.entries()) this.cell(line, "td", text, i);
    }
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(element) } });
      view.focus();
    });
    return element;
  }
  private cell(row: HTMLTableRowElement, tag: "th" | "td", text: string, column: number) {
    const cell = document.createElement(tag);
    cell.append(renderInline(text));
    // Stryker disable next-line StringLiteral: une valeur invalide est ignorée, comme la valeur vide.
    cell.style.textAlign = this.table.alignments[column] ?? "";
    row.append(cell);
  }
}

function touchesSelection(state: EditorState, from: number, to: number): boolean {
  const { main } = state.selection;
  return main.from <= to && main.to >= from;
}

/** Seuls les tableaux au premier niveau de la note sont dessinés (pas dans une liste ou une citation). */
function build(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== TABLE) continue;
    const startsLine = state.doc.lineAt(node.from).from === node.from;
    if (startsLine && !touchesSelection(state, node.from, node.to)) {
      const widget = new TableWidget(parseTable(state.doc.sliceString(node.from, node.to)));
      ranges.push(Decoration.replace({ widget, block: true }).range(node.from, node.to));
    }
  }
  return Decoration.set(ranges);
}

// Stryker disable all: optimisation — tout recalculer à chaque transaction donnerait le même affichage, en plus lent.
/** L'affichage ne change que si le texte, le curseur ou l'analyse changent. */
function rebuildIfNeeded(decorations: DecorationSet, transaction: Transaction): DecorationSet {
  const edited = transaction.docChanged || transaction.selection !== undefined;
  const parsed = syntaxTree(transaction.startState) !== syntaxTree(transaction.state);
  return edited || parsed ? build(transaction.state) : decorations;
}
// Stryker restore all

export const liveTables = StateField.define<DecorationSet>({
  create: build,
  update: rebuildIfNeeded,
  provide: (field) => EditorView.decorations.from(field),
});
