import { EditorView, runScopeHandlers } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor } from "../editor";
import "../../style.css";

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.focus();
  return { parent, view, editor };
}

const panel = (parent: HTMLElement) => parent.querySelector<HTMLElement>(".cm-search");
const field = (parent: HTMLElement, name: string) =>
  parent.querySelector<HTMLInputElement>(`.cm-search input[name=${name}]`) as HTMLInputElement;

// CodeMirror vide sa zone d'annonce 200 ms après l'avoir remplie : la lire après une frappe
// dépend de la vitesse de la machine. On note chaque annonce au moment où elle s'affiche ;
// chaque lecture rend les annonces parues depuis la précédente.
function listenToAnnouncements(parent: HTMLElement) {
  const heard: string[] = [];
  const note = (records: MutationRecord[]) =>
    records.forEach((record) =>
      record.addedNodes.forEach((node) => heard.push(node.textContent ?? "")),
    );
  const observer = new MutationObserver(note);
  observer.observe(parent.querySelector(".cm-announced") as HTMLElement, { childList: true });
  return () => {
    note(observer.takeRecords());
    return heard.splice(0).join(" ");
  };
}

describe("rechercher et remplacer dans la note ouverte", () => {
  it("Cmd+F ouvre la recherche, en français, le curseur dans le champ", async () => {
    const { parent } = mount("pain\nlait");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    expect(panel(parent)).not.toBeNull();
    expect(document.activeElement).toBe(field(parent, "search"));
    expect(field(parent, "search").placeholder).toBe("Rechercher");
    expect(field(parent, "replace").placeholder).toBe("Remplacer");
    const labels = [...parent.querySelectorAll(".cm-search button")].map((b) => b.textContent);
    expect(labels).toEqual(["suivant", "précédent", "tout", "remplacer", "tout remplacer", "×"]);
    expect(parent.querySelector(".cm-search button[name=close]")?.getAttribute("aria-label")).toBe(
      "fermer",
    );
    const options = [...parent.querySelectorAll(".cm-search label")].map((l) => l.textContent);
    expect(options).toEqual(["respecter la casse", "expression régulière", "mot entier"]);
  });

  it("s'ouvre aussi sur demande de l'application, le curseur dans le champ", () => {
    const { parent, editor } = mount("pain");
    editor.openFind();
    expect(panel(parent)).not.toBeNull();
    expect(document.activeElement).toBe(field(parent, "search"));
  });

  it("s'ouvre sur demande de l'application pour remplacer, le curseur dans le remplacement", () => {
    const { parent, editor } = mount("pain");
    editor.openReplace();
    expect(panel(parent)).not.toBeNull();
    expect(document.activeElement).toBe(field(parent, "replace"));
  });

  it("surligne chaque occurrence et va de l'une à l'autre", async () => {
    const { parent, view } = mount("pain\nlait\npain");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    await userEvent.keyboard("pain");
    await userEvent.keyboard("{Enter}");
    expect(view.state.selection.main.from).toBe(0);
    await userEvent.keyboard("{Meta>}g{/Meta}");
    expect(view.state.selection.main.from).toBe("pain\nlait\n".length);
    expect(parent.querySelectorAll(".cm-searchMatch").length).toBeGreaterThan(0);
  });

  it("Cmd+Alt+F ouvre la recherche le curseur dans le champ de remplacement", async () => {
    const { parent } = mount("pain");
    await userEvent.keyboard("{Meta>}{Alt>}f{/Alt}{/Meta}");
    expect(document.activeElement).toBe(field(parent, "replace"));
  });

  it("remplace toutes les occurrences", async () => {
    const { parent, view } = mount("pain\nlait\npain");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    await userEvent.keyboard("pain");
    field(parent, "replace").focus();
    await userEvent.keyboard("brioche");
    parent.querySelector<HTMLButtonElement>(".cm-search button[name=replaceAll]")?.click();
    expect(view.state.doc.toString()).toBe("brioche\nlait\nbrioche");
  });

  it("surligne les occurrences avec les couleurs du thème", async () => {
    document.documentElement.style.setProperty("--highlight", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--highlight-current", "rgb(4, 5, 6)");
    const { parent } = mount("pain pain");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    await userEvent.keyboard("pain{Enter}");
    const colors = [...parent.querySelectorAll(".cm-searchMatch")].map(
      (m) => getComputedStyle(m).backgroundColor,
    );
    document.documentElement.removeAttribute("style");
    expect(colors).toContain("rgb(4, 5, 6)");
    expect(colors).toContain("rgb(1, 2, 3)");
  });

  it("ouvre le panneau en haut de la note", async () => {
    const { parent } = mount("pain");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    expect(parent.querySelector(".cm-panels-top .cm-search")).not.toBeNull();
  });

  it("garde pour lui le raccourci de remplacement", () => {
    const { view } = mount("pain");
    const press = new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      keyCode: 70,
      metaKey: true,
      altKey: true,
    });
    expect(runScopeHandlers(view, press, "editor")).toBe(true);
  });

  it("annonce en français l'occurrence trouvée et les remplacements", async () => {
    const { parent, view } = mount("pain\nlait\npain");
    const announced = listenToAnnouncements(parent);
    await userEvent.keyboard("{Meta>}f{/Meta}");
    await userEvent.keyboard("pain{Enter}");
    const found = announced();
    expect(found).toContain("occurrence en cours");
    expect(found).toContain("à la ligne 1");
    field(parent, "replace").focus();
    await userEvent.keyboard("brioche");
    parent.querySelector<HTMLButtonElement>(".cm-search button[name=replace]")?.click();
    expect(announced()).toContain("occurrence remplacée à la ligne 1");
    parent.querySelector<HTMLButtonElement>(".cm-search button[name=replaceAll]")?.click();
    expect(announced()).toContain("occurrences remplacées : 1");
    expect(view.state.doc.toString()).toBe("brioche\nlait\nbrioche");
  });

  it("Cmd+Alt+G propose d'aller à une ligne, en français", async () => {
    const { parent } = mount("un\ndeux");
    await userEvent.keyboard("{Meta>}{Alt>}g{/Alt}{/Meta}");
    expect(parent.querySelector(".cm-goto-line")?.textContent).toContain("Aller à la ligne");
    expect(parent.querySelector(".cm-goto-line button[type=submit]")?.textContent).toBe("aller");
  });

  it("Échap ferme la recherche", async () => {
    const { parent } = mount("pain");
    await userEvent.keyboard("{Meta>}f{/Meta}");
    await userEvent.keyboard("{Escape}");
    expect(panel(parent)).toBeNull();
  });
});
