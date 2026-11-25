import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import type { LinkableItem } from "../../bridge";
import { createEditor } from "../editor";
import type { LinkSite } from "./link-site";

const COURSES: LinkableItem = {
  path: "Vieux/courses.md",
  title: "Courses",
  folder: "Vieux",
  contentType: "note",
  link: "Vieux/Courses",
};

/** Un éditeur sur `content`, la sélection de `from` à `to` ; le choix du bouton « Lien » est noté. */
function mount(content: string, from: number, to = from) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const sites: LinkSite[] = [];
  const choose = vi.fn((site: LinkSite) => void sites.push(site));
  const editor = createEditor(parent, () => {}, {
    links: { contents: async () => [], row: (item) => ({ label: item.title }), choose },
  });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.dispatch({ selection: { anchor: from, head: to } });
  return { editor, view, choose, sites };
}

const text = (view: EditorView) => view.state.doc.toString();

describe("bouton « Lien » : où le lien s'écrit", () => {
  it("demande ce qu'on lie au lieu de poser un lien vers une page web, avec le texte sélectionné", () => {
    const { editor, view, choose, sites } = mount("voir mes courses ici", 9, 16);
    editor.format("insert-link");
    expect(choose).toHaveBeenCalledTimes(1);
    expect(sites[0]?.text).toBe("courses");
    expect(text(view)).toBe("voir mes courses ici");
  });

  it("Cmd+K fait de même que le bouton", () => {
    const { view, choose } = mount("mot", 0, 3);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("le texte sélectionné devient le texte du lien vers le contenu choisi", () => {
    const { editor, view, sites } = mount("voir mes courses ici", 9, 16);
    editor.format("insert-link");
    sites[0]?.insertContent(COURSES);
    expect(text(view)).toBe("voir mes [[Vieux/Courses|courses]] ici");
    expect(view.state.selection.main.head).toBe("voir mes [[Vieux/Courses|courses]]".length);
    expect(view.hasFocus).toBe(true);
  });

  it("sans sélection, le lien est écrit au curseur", () => {
    const { editor, view, sites } = mount("voir ", 5);
    editor.format("insert-link");
    expect(sites[0]?.text).toBe("");
    sites[0]?.insertContent({ ...COURSES, link: "Courses" });
    expect(text(view)).toBe("voir [[Courses]]");
  });

  it("un contenu au nom du texte sélectionné s'écrit sans texte montré", () => {
    const { editor, view, sites } = mount("Courses", 0, 7);
    editor.format("insert-link");
    sites[0]?.insertContent({ ...COURSES, link: "Courses" });
    expect(text(view)).toBe("[[Courses]]");
  });

  it("« Une page web » pose le lien Markdown, l'adresse à taper sélectionnée", () => {
    const { editor, view, sites } = mount("voir mes courses ici", 9, 16);
    editor.format("insert-link");
    sites[0]?.insertWeb();
    expect(text(view)).toBe("voir mes [courses](url) ici");
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("url");
    expect(view.hasFocus).toBe(true);
  });

  it("garde le passage choisi, même si le texte a raccourci pendant le choix", () => {
    const { editor, view, sites } = mount("voir mes courses ici", 9, 16);
    editor.format("insert-link");
    view.dispatch({ changes: { from: 4, to: view.state.doc.length } });
    sites[0]?.insertContent({ ...COURSES, link: "Courses" });
    expect(text(view)).toBe("voir[[Courses|courses]]");
    sites[0]?.insertWeb();
    expect(text(view)).toContain("(url)");
  });
});
