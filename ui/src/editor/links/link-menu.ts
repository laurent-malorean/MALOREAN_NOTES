// Le menu des liens sous le curseur : `[[` (complétion) et `/` en début de ligne ou après une
// espace (menu « Lien vers… », uniquement des liens). Une seule liste de tout ce qu'on peut lier,
// filtrée à chaque lettre ; flèches et Entrée, ou la souris, choisissent ; Échap ferme.
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { LinkableItem } from "../../bridge";
import { matchingLinkable, writtenLink } from "../../state/link-choice";
import { type LinkTrigger, linkTrigger } from "./link-trigger";
import "./link-menu.css";

/** Ce que montre une ligne du menu : l'icône du type, le titre, le dossier. */
export interface LinkRow {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly icon?: Element | undefined;
}

/** Ce que le menu demande à l'application : tout ce qu'on peut lier, et la ligne de chaque contenu. */
export interface LinkMenuSupport {
  readonly contents: () => Promise<readonly LinkableItem[]>;
  readonly row: (item: LinkableItem) => LinkRow;
}

/** Le titre du menu ouvert par `/`. */
export const SLASH_MENU_TITLE = "Lien vers…";
/** Le nom de la liste ouverte par `[[`, lu par les lecteurs d'écran. */
export const BRACKETS_MENU_LABEL = "Contenus à lier";
/** Espace, en pixels, entre le curseur et le menu. */
const GAP = 4;
const CLOSING = "]]";

/** Le menu ouvert : ce qui l'a ouvert, à sa place dans le texte. */
interface Open {
  readonly trigger: LinkTrigger;
  /** Position de `[[` ou de `/` dans le texte. */
  readonly from: number;
  /** Position du curseur. */
  readonly to: number;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const created = document.createElement(tag);
  created.className = className;
  return created;
}

class LinkMenu {
  private popup: HTMLElement | null = null;
  private open: Open | null = null;
  private items: readonly LinkableItem[] | null = null;
  private shown: LinkableItem[] = [];
  private active = 0;
  /** Le menu fermé par Échap : il ne se rouvre pas tant que `[[` ou `/` reste le même. */
  private dismissed: number | null = null;
  /** Compte les ouvertures : une liste reçue après une fermeture est ignorée. */
  private opening = 0;

  constructor(
    private readonly view: EditorView,
    private readonly support: LinkMenuSupport,
  ) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet && !update.focusChanged) return;
    this.sync();
  }

  destroy(): void {
    this.popup?.remove();
  }

  /** La touche est pour le menu : vrai si elle a servi. */
  handle(key: string): boolean {
    if (this.popup === null || this.open === null) return false;
    if (key === "Escape") {
      this.dismissed = this.open.from;
      this.hide();
    } else if (key === "Enter" || key === "Tab") this.choose(this.shown[this.active]);
    else if (key === "ArrowDown" || key === "ArrowUp") {
      const step = key === "ArrowDown" ? 1 : -1;
      this.active = Math.min(Math.max(this.active + step, 0), this.shown.length - 1);
      this.render();
    } else return false;
    return true;
  }

  private current(): Open | null {
    const { state } = this.view;
    const { main } = state.selection;
    if (!main.empty || !this.view.hasFocus) return null;
    const line = state.doc.lineAt(main.head);
    const trigger = linkTrigger(line.text, main.head - line.from);
    return trigger && { trigger, from: line.from + trigger.from, to: main.head };
  }

  private sync(): void {
    const open = this.current();
    if (open === null) {
      this.close();
      return;
    }
    const before = this.open;
    this.open = open;
    if (before?.from !== open.from || before.trigger.kind !== open.trigger.kind) {
      if (this.dismissed !== open.from) this.dismissed = null;
      this.items = null;
      this.load(++this.opening);
    }
    // Chaque lettre tapée remet le premier choix en avant, comme la fenêtre de choix.
    if (before?.trigger.query !== open.trigger.query) this.active = 0;
    this.refresh();
  }

  private load(opening: number): void {
    void this.support.contents().then((items) => {
      if (opening !== this.opening) return;
      this.items = items;
      this.refresh();
    });
  }

  private refresh(): void {
    if (this.open === null || this.items === null || this.dismissed === this.open.from) {
      this.hide();
      return;
    }
    this.shown = matchingLinkable(this.items, this.open.trigger.query);
    if (this.shown.length === 0) this.hide();
    else this.render();
  }

  private render(): void {
    const popup = this.popup ?? this.build();
    const list = popup.querySelector("ul") as HTMLUListElement;
    list.replaceChildren(...this.shown.map((item, index) => this.line(item, index)));
    list.children[this.active]?.scrollIntoView({ block: "nearest" });
    this.place(popup);
  }

  private build(): HTMLElement {
    const popup = element("div", "link-menu");
    if (this.open?.trigger.kind === "slash") {
      popup.append(
        Object.assign(element("div", "link-menu-title"), { textContent: SLASH_MENU_TITLE }),
      );
    }
    const list = element("ul", "link-menu-list");
    list.setAttribute("role", "listbox");
    list.setAttribute(
      "aria-label",
      this.open?.trigger.kind === "slash" ? SLASH_MENU_TITLE : BRACKETS_MENU_LABEL,
    );
    popup.append(list);
    // Cliquer une ligne ne retire pas le focus de l'éditeur : le curseur reste où il est.
    popup.addEventListener("mousedown", (event) => event.preventDefault());
    document.body.append(popup);
    this.popup = popup;
    return popup;
  }

  private line(item: LinkableItem, index: number): HTMLElement {
    const { label, detail, icon } = this.support.row(item);
    const line = element("li", "link-menu-option");
    line.setAttribute("role", "option");
    line.setAttribute("aria-selected", String(index === this.active));
    const name = element("span", "link-menu-label");
    if (icon) name.append(icon);
    name.append(label);
    line.append(name);
    if (detail)
      line.append(Object.assign(element("span", "link-menu-detail"), { textContent: detail }));
    line.addEventListener("click", () => this.choose(item));
    return line;
  }

  /** Sous le curseur ; au-dessus s'il n'y a pas assez de place en dessous. Mesuré après la mise à jour de l'éditeur. */
  private place(popup: HTMLElement): void {
    this.view.requestMeasure({
      read: (view) => view.coordsAtPos(view.state.selection.main.head),
      write: (caret) => {
        // Le menu a pu être fermé entre-temps ; un curseur hors de l'écran n'a pas de place.
        if (caret === null || popup !== this.popup) return;
        popup.style.left = `${caret.left}px`;
        const below = caret.bottom + GAP;
        const fits = below + popup.offsetHeight <= window.innerHeight;
        popup.style.top = `${fits ? below : Math.max(caret.top - GAP - popup.offsetHeight, 0)}px`;
      },
    });
  }

  private choose(item: LinkableItem | undefined): void {
    const { open } = this;
    if (item === undefined || open === null) return;
    const { state } = this.view;
    const closed = state.sliceDoc(open.to, open.to + CLOSING.length) === CLOSING;
    const to = open.trigger.kind === "brackets" && closed ? open.to + CLOSING.length : open.to;
    const insert = writtenLink(item);
    this.view.dispatch({
      changes: { from: open.from, to, insert },
      selection: { anchor: open.from + insert.length },
      userEvent: "input.complete",
      scrollIntoView: true,
    });
  }

  private hide(): void {
    this.popup?.remove();
    this.popup = null;
  }

  private close(): void {
    this.hide();
    this.open = null;
    this.items = null;
    this.dismissed = null;
    this.opening++;
  }
}

/** Le menu des liens : `[[` et `/` ouvrent la liste de tout ce qu'on peut lier, sous le curseur. */
export function linkMenu(support: LinkMenuSupport): Extension {
  const plugin = ViewPlugin.fromClass(
    class extends LinkMenu {
      constructor(view: EditorView) {
        super(view, support);
      }
    },
  );
  const key = (name: string) => ({
    key: name,
    run: (view: EditorView) => view.plugin(plugin)?.handle(name) ?? false,
  });
  return [
    plugin,
    Prec.highest(keymap.of(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].map(key))),
  ];
}
