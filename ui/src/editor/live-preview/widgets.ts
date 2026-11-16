// Éléments dessinés à la place de la syntaxe : puce, case à cocher, séparateur.
import { type EditorView, WidgetType } from "@codemirror/view";
import { toggledTaskMarker } from "./preview";

export class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-lp-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

export class RuleWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-lp-rule";
    return rule;
  }
}

/** Case à cocher cliquable : un clic coche ou décoche la tâche dans le texte. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  override eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-lp-checkbox";
    box.checked = this.checked;
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const from = view.posAtDOM(box);
      const to = from + "[ ]".length;
      const insert = toggledTaskMarker(view.state.sliceDoc(from, to));
      view.dispatch({ changes: { from, to, insert } });
    });
    return box;
  }
}
