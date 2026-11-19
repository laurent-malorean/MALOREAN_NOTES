import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "../editor";
import { DRAG_DISTANCE } from "./link-click";
import "../../theme.css";
import "../../style.css";

/** Un éditeur dont les liens ouverts sont notés : titres des liens entre notes, cibles des autres. */
function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const opened: string[] = [];
  const editor = createEditor(parent, () => {}, {
    openLink: (title) => opened.push(`note:${title}`),
    attachmentActions: {
      attach: () => Promise.resolve(null),
      open: (target) => opened.push(target),
    },
  });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { view, opened };
}

interface Point {
  readonly clientX: number;
  readonly clientY: number;
}

/** La boîte à l'écran du texte de `from` à `to`, sur une seule ligne. */
function boxOf(view: EditorView, from: number, to: number): DOMRect {
  const start = view.domAtPos(from);
  const end = view.domAtPos(to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range.getBoundingClientRect();
}

/** Le milieu du texte de `from` à `to`. */
function middleOf(view: EditorView, from: number, to: number): Point {
  const box = boxOf(view, from, to);
  return { clientX: (box.left + box.right) / 2, clientY: (box.top + box.bottom) / 2 };
}

type Options = Partial<MouseEventInit>;

function press(view: EditorView, at: Point, options: Options = {}) {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...at, ...options });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const moveTo = (at: Point) =>
  document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ...at }));
const release = (at: Point) =>
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...at }));

/** Un clic complet : bouton enfoncé puis relâché au même endroit. */
function click(view: EditorView, at: Point, options: Options = {}) {
  const event = press(view, at, options);
  release(at);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("un simple clic sur un lien", () => {
  const NOTE = "Voir [[Courses|la liste]] ici";

  it("ouvre la note visée au relâchement du bouton, sans placer le curseur", () => {
    const { view, opened } = mount(NOTE);
    view.dispatch({ selection: { anchor: NOTE.length } });
    const at = middleOf(view, 15, 23);
    const event = press(view, at);
    expect(event.defaultPrevented).toBe(true);
    expect(opened).toEqual([]);
    release(at);
    expect(opened).toEqual(["note:Courses"]);
    expect(view.state.selection.main.head).toBe(NOTE.length);
    expect(view.hasFocus).toBe(false);
    release(at);
    expect(opened).toEqual(["note:Courses"]);
  });

  it("ouvre la pièce jointe, l'adresse web d'un lien Markdown, ou une adresse écrite telle quelle", () => {
    const text =
      "[Billet.pdf](n.assets/Billet.pdf) [site](https://a.fr) https://b.fr/x <https://c.fr>";
    const { view, opened } = mount(text);
    click(view, middleOf(view, 1, 11));
    click(view, middleOf(view, 35, 39));
    click(view, middleOf(view, 55, 69));
    click(view, middleOf(view, 72, 83));
    expect(opened).toEqual([
      "n.assets/Billet.pdf",
      "https://a.fr",
      "https://b.fr/x",
      "https://c.fr",
    ]);
  });

  it("ouvre aussi sur le dernier caractère d'une adresse écrite telle quelle", () => {
    const text = "voir https://b.fr";
    const { view, opened } = mount(text);
    const last = boxOf(view, text.length - 1, text.length);
    click(view, { clientX: last.right - 1, clientY: (last.top + last.bottom) / 2 });
    expect(opened).toEqual(["https://b.fr"]);
  });

  it("à côté du texte du lien, place le curseur sans rien ouvrir", () => {
    const text = "x [[Courses]]\nsuite";
    const { view, opened } = mount(text);
    const box = boxOf(view, 4, 11);
    const line = boxOf(view, 0, 13);
    // Le texte est moins haut que sa ligne : il reste de la place au-dessus et au-dessous.
    expect(box.top - line.top).toBeGreaterThanOrEqual(0);
    const middle = (box.top + box.bottom) / 2;
    const beside = [
      { clientX: box.right + 3, clientY: middle },
      { clientX: box.left - 3, clientY: middle },
    ];
    for (const at of beside) {
      view.contentDOM.blur();
      click(view, at);
      expect(view.hasFocus, `${at.clientX}`).toBe(true);
    }
    expect(opened).toEqual([]);
  });

  it("au-dessus ou au-dessous du texte, dans la hauteur de la ligne, n'ouvre rien", () => {
    document.documentElement.style.setProperty("--line-height", "3");
    const { view, opened } = mount("[[Courses]]\nsuite");
    const box = boxOf(view, 2, 9);
    const x = (box.left + box.right) / 2;
    click(view, { clientX: x, clientY: box.top - 3 });
    click(view, { clientX: x, clientY: box.bottom + 3 });
    expect(opened).toEqual([]);
    document.documentElement.removeAttribute("style");
  });

  it("qui glisse sélectionne du texte depuis le point de départ, sans rien ouvrir", () => {
    const { view, opened } = mount(NOTE);
    const start = middleOf(view, 15, 23);
    // Pris avant : une fois le curseur sur la ligne, ses marques réapparaissent et le texte bouge.
    const from = view.posAtCoords({ x: start.clientX, y: start.clientY }, false);
    press(view, start);
    const far = middleOf(view, 26, 29);
    moveTo(far);
    release(far);
    expect(opened).toEqual([]);
    expect(view.hasFocus).toBe(true);
    const { anchor, head } = view.state.selection.main;
    expect(from).toBeGreaterThan(15);
    expect(anchor).toBe(from);
    expect(head).toBeGreaterThan(anchor);
  });

  it(`reste un clic si la souris bouge de ${DRAG_DISTANCE} pixels au plus, glisse au-delà`, () => {
    const { view, opened } = mount(NOTE);
    const start = middleOf(view, 15, 23);
    const near = { clientX: start.clientX + DRAG_DISTANCE, clientY: start.clientY };
    press(view, start);
    moveTo(near);
    release(near);
    expect(opened).toEqual(["note:Courses"]);
    const down = { clientX: start.clientX, clientY: start.clientY + DRAG_DISTANCE + 1 };
    press(view, start);
    moveTo(down);
    release(down);
    expect(opened).toEqual(["note:Courses"]);
  });

  it("qui glisse fait suivre la sélection au pointeur, puis la laisse au relâchement", () => {
    const { view } = mount(NOTE);
    const start = middleOf(view, 15, 23);
    press(view, start);
    moveTo(middleOf(view, 26, 27));
    // Revenu près du point de départ, le glissement continue.
    moveTo(start);
    const back = view.posAtCoords({ x: start.clientX, y: start.clientY }, false);
    expect(view.state.selection.main.head).toBe(back);
    expect(back).toBeLessThan(26);
    // Au-delà de la fin de la ligne, la sélection va jusqu'à elle.
    const end = boxOf(view, 28, 29);
    moveTo({ clientX: end.right + 400, clientY: (end.top + end.bottom) / 2 });
    expect(view.state.selection.main.head).toBe(NOTE.length);
    // Bien au-dessous du texte, aussi.
    moveTo({ clientX: end.left, clientY: end.bottom + 2000 });
    expect(view.state.selection.main.head).toBe(NOTE.length);
    moveTo(middleOf(view, 28, 29));
    const head = view.state.selection.main.head;
    release(middleOf(view, 28, 29));
    moveTo(middleOf(view, 0, 1));
    expect(view.state.selection.main.head).toBe(head);
  });

  it("avec Maj, Alt, Ctrl ou un autre bouton, laisse l'éditeur faire", () => {
    const { view, opened } = mount(NOTE);
    const at = middleOf(view, 15, 23);
    for (const options of [
      { shiftKey: true },
      { altKey: true },
      { ctrlKey: true },
      { button: 1 },
      { button: 2 },
    ]) {
      click(view, at, options);
    }
    expect(opened).toEqual([]);
  });

  it("vise le lien cliqué parmi ceux de la ligne, et sur une autre ligne que la première", () => {
    const text = "Voir [[A]] et [[Bé]]\npuis [[C]] et [[D]]";
    const { view, opened } = mount(text);
    click(view, middleOf(view, 16, 18));
    click(view, middleOf(view, 28, 29));
    click(view, middleOf(view, 37, 38));
    expect(opened).toEqual(["note:Bé", "note:C", "note:D"]);
  });

  it("hors d'un lien, laisse l'éditeur faire, sans erreur", () => {
    const failed = vi.spyOn(console, "error");
    const { view, opened } = mount("simple texte\n[a][ref] et [[N]]");
    click(view, middleOf(view, 2, 5));
    view.contentDOM.blur();
    click(view, middleOf(view, 14, 15));
    expect(view.hasFocus).toBe(true);
    expect(opened).toEqual([]);
    expect(failed).not.toHaveBeenCalled();
  });

  it("Cmd+clic ouvre toujours, dès que le bouton s'enfonce", () => {
    const { view, opened } = mount(NOTE);
    press(view, middleOf(view, 15, 23), { metaKey: true });
    expect(opened).toEqual(["note:Courses"]);
  });

  it("sur une image, ne l'ouvre pas", () => {
    const { view, opened } = mount("avant ![](n.assets/a.png) après");
    const image = view.contentDOM.querySelector("img") as HTMLElement;
    const box = image.getBoundingClientRect();
    click(view, { clientX: box.left + 2, clientY: box.top + 2 });
    expect(opened).toEqual([]);
  });

  it("sur la définition d'une référence ou un lien sans adresse, n'ouvre rien", () => {
    const failed = vi.spyOn(console, "error");
    const text = "[a][ref]\n\n[ref]: https://a.fr";
    const { view, opened } = mount(text);
    click(view, middleOf(view, 1, 2));
    view.contentDOM.blur();
    click(view, middleOf(view, 17, 29));
    click(view, middleOf(view, 11, 14));
    expect(opened).toEqual([]);
    expect(failed).not.toHaveBeenCalled();
  });
});
