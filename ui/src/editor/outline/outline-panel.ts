// Panneau du plan : les titres de la note, à droite du texte ; un clic y emmène.
import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Heading, outlineOf } from "./outline";

function item(view: EditorView, heading: Heading): HTMLLIElement {
  const entry = document.createElement("li");
  const button = document.createElement("button");
  button.className = `outline-item outline-level-${heading.level}`;
  button.textContent = heading.text;
  button.addEventListener("click", () => {
    view.dispatch({
      selection: { anchor: heading.from },
      effects: EditorView.scrollIntoView(heading.from, { y: "start" }),
    });
    view.focus();
  });
  entry.append(button);
  return entry;
}

function render(view: EditorView, container: HTMLElement) {
  const headings = outlineOf(view.state);
  const list = document.createElement("ol");
  list.className = "outline-list";
  list.append(...headings.map((heading) => item(view, heading)));
  const empty = document.createElement("p");
  empty.className = "outline-empty";
  empty.textContent = "Aucun titre dans cette note";
  container.replaceChildren(headings.length > 0 ? list : empty);
}

/** Le plan de la note, dessiné dans `container` ; il suit chaque frappe et chaque avancée de l'analyse. */
export function outlinePanel(container: HTMLElement): Extension {
  return ViewPlugin.define((view) => {
    render(view, container);
    return {
      update(update: ViewUpdate) {
        // Stryker disable next-line EqualityOperator,ConditionalExpression: redessiner aussi quand rien n'a changé donnerait le même plan.
        const parsed = syntaxTree(update.startState) !== syntaxTree(update.state);
        // Stryker disable next-line ConditionalExpression: optimisation — redessiner à chaque mise à jour donnerait le même plan.
        if (update.docChanged || parsed) render(update.view, container);
      },
    };
  });
}
