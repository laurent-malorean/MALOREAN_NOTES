// Éléments dessinés à la place de la syntaxe : puce, case à cocher, séparateur, image.
import { type EditorView, WidgetType } from "@codemirror/view";
import { toggledTaskMarker } from "./preview";

// Puce et séparateur sont des instances uniques : CodeMirror les reconnaît sans les comparer.
export class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-lp-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

export class RuleWidget extends WidgetType {
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

/**
 * Image affichée à la place de sa syntaxe. Si elle ne charge pas, l'image introuvable laisse
 * place à son texte de remplacement, ou à l'adresse écrite quand ce texte est vide.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly address: string,
    readonly alt: string,
    readonly written: string,
  ) {
    super();
  }
  override eq(other: ImageWidget) {
    return other.address === this.address && other.alt === this.alt;
  }
  toDOM() {
    // Le cadre reçoit le texte ; l'image, cachée, y reste avec son adresse.
    const frame = document.createElement("span");
    const image = document.createElement("img");
    image.className = "cm-lp-image";
    image.src = this.address;
    image.alt = this.alt;
    image.title = this.alt;
    image.addEventListener("error", () => {
      const missing = document.createElement("span");
      missing.className = "cm-lp-image-missing";
      missing.textContent = this.alt || this.written;
      image.style.display = "none";
      frame.append(missing);
    });
    frame.append(image);
    return frame;
  }
}
