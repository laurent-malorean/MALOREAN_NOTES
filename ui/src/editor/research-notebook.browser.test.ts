import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type EditorOptions } from "./editor";
import "../theme.css";
import "../style.css";
import { entryDayLabel, isResearchNotebook } from "./research-notebook";

const NOTEBOOK = "---\ntype: cahier-de-recherche\n---\n# Levures\n\n- 18:30 - un\n";

function mount(options: EditorOptions = {}) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (content) => changes.push(content), options);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view, changes };
}

const of = (text: string) => isResearchNotebook(Text.of(text.split("\n")));

describe("cahier de recherche dans l'éditeur", () => {
  it("reconnaît un cahier à la première clé « type » de son en-tête, comme Rust", () => {
    expect(of(NOTEBOOK)).toBe(true);
    expect(of('---\ntags: [a]\ntype :  "cahier-de-recherche" # c\n---\n# C')).toBe(true);
    expect(of("---\ntype: 'cahier-de-recherche'\n---")).toBe(true);
    expect(of("---\ntype: kanban\ntype: cahier-de-recherche\n---")).toBe(false);
    expect(of("---\n  type: cahier-de-recherche\n---")).toBe(false);
    expect(of("---\ntypes: cahier-de-recherche\n---")).toBe(false);
    expect(of("# Note\ntype: cahier-de-recherche")).toBe(false);
    expect(of("---\ntype: cahier-de-recherche-bis\n---")).toBe(false);
    expect(of("---\ntype: cahier-'de-recherche\n---")).toBe(false);
    expect(of("---\ntype: cahier-de-recherc'he\n---")).toBe(false);
    expect(of("---\ntitle: x\n---")).toBe(false);
  });

  it("ne se modifie pas : ni frappe, ni mise en forme, ni remplacement", async () => {
    const { editor, view, changes } = mount();
    editor.show(NOTEBOOK);
    view.focus();
    view.dispatch({ selection: { anchor: NOTEBOOK.length } });
    await userEvent.keyboard("abc{Enter}");
    editor.format("bold");
    editor.replaceRange(0, 3, "x");
    view.dispatch({ changes: { from: 0, insert: "y" } });
    expect(editor.content()).toBe(NOTEBOOK);
    expect(view.state.readOnly).toBe(true);
    expect(changes).toEqual([]);
  });

  it("une note relue qui devient un cahier passe en lecture seule, avec sa zone de saisie", () => {
    const { parent, editor, view } = mount({ addEntry: async () => true });
    editor.show("# Note\n");
    expect(view.state.readOnly).toBe(false);
    editor.reload(NOTEBOOK);
    expect(view.state.readOnly).toBe(true);
    expect(parent.querySelector(".notebook-entry")).not.toBeNull();
  });

  it("montre la version relue sur le disque et la frappe d'une autre colonne", () => {
    const { editor } = mount();
    editor.show(NOTEBOOK);
    const next = `${NOTEBOOK}- 18:31 - deux\n`;
    editor.reload(next);
    expect(editor.content()).toBe(next);
  });

  it("donne le jour sous lequel l'entrée sera rangée, en toutes lettres", () => {
    expect(entryDayLabel(new Date(2026, 10, 23, 9, 42))).toBe("Lundi 23 novembre");
    expect(entryDayLabel(new Date(2026, 11, 1))).toBe("Mardi 1er décembre");
  });

  it("montre en bas, sous le texte, une zone de saisie de 8 lignes et un seul bouton", () => {
    const { parent, editor } = mount({
      addEntry: async () => true,
      today: () => new Date(2026, 10, 23),
    });
    editor.show(NOTEBOOK);
    const area = parent.querySelector(".cm-panels-bottom .notebook-entry");
    expect(area).not.toBeNull();
    expect(parent.querySelector(".cm-panels-top")).toBeNull();
    const text = area?.querySelector("textarea");
    expect(text?.rows).toBe(8);
    expect(text?.getAttribute("aria-label")).toBe("Nouvelle entrée");
    expect(area?.querySelector(".notebook-entry-message")?.textContent).toBe(
      "Nouvelle entrée — elle sera datée au moment de l'ajout et rangée sous « Lundi 23 novembre »",
    );
    expect(area?.textContent).toContain("Le reste du cahier est en lecture seule.");
    const buttons = [...(area?.querySelectorAll("button") ?? [])];
    expect(buttons.map((b) => [b.type, b.textContent])).toEqual([["button", "Ajouter l'entrée"]]);
  });

  it("ajoute le texte saisi, puis vide la zone ; si l'ajout échoue, le texte reste", async () => {
    const asked: string[] = [];
    let succeed = false;
    const { parent, editor } = mount({
      addEntry: async (text) => (asked.push(text), succeed),
    });
    editor.show(NOTEBOOK);
    const text = parent.querySelector("textarea") as HTMLTextAreaElement;
    const add = parent.querySelector(".notebook-entry button") as HTMLButtonElement;
    await userEvent.click(text);
    await userEvent.keyboard("un{Enter}deux");
    expect(text.value).toBe("un\ndeux");
    add.click();
    await expect.poll(() => add.disabled).toBe(false);
    expect(asked).toEqual(["un\ndeux"]);
    expect(text.value).toBe("un\ndeux");
    succeed = true;
    add.click();
    expect(add.disabled).toBe(true);
    await expect.poll(() => text.value).toBe("");
    expect(asked).toEqual(["un\ndeux", "un\ndeux"]);
    expect(add.disabled).toBe(false);
  });

  it("une note ordinaire se modifie et n'a pas de zone de saisie ; sans action, un cahier non plus", async () => {
    const { parent, editor, view, changes } = mount({ addEntry: async () => true });
    editor.show("# Note\n");
    expect(parent.querySelector(".notebook-entry")).toBeNull();
    view.focus();
    view.dispatch({ selection: { anchor: 7 } });
    await userEvent.keyboard("abc");
    expect(editor.content()).toBe("# Note\nabc");
    expect(changes.length).toBeGreaterThan(0);
    expect(view.state.readOnly).toBe(false);
    const bare = mount();
    bare.editor.show(NOTEBOOK);
    expect(bare.parent.querySelector(".notebook-entry")).toBeNull();
    expect(bare.view.state.readOnly).toBe(true);
  });

  describe("barre d'entrée", () => {
    const ENTRIES =
      "---\ntype: cahier-de-recherche\ntags:\n  - a\n---\n# Levures\n\n## 2026\n\n### Novembre\n\n" +
      "#### Lundi 23\n\n- 09:00 - un\n  suite de un\n\n  paragraphe en retrait\n  - sous-puce\n- 10:00 - deux\n";
    const lines = (parent: HTMLElement) => [...parent.querySelectorAll<HTMLElement>(".cm-line")];
    const line = (parent: HTMLElement, text: string) => {
      const found = lines(parent).find((l) => l.textContent?.includes(text));
      if (!found) throw new Error(`ligne introuvable : ${text}`);
      return found;
    };
    const entry = () => {
      const made = mount();
      made.parent.className = "editor";
      made.editor.show(ENTRIES);
      return made.parent;
    };

    it("pose une barre sur chaque ligne de chaque entrée, et sur rien d'autre", () => {
      const parent = entry();
      const barred = lines(parent)
        .filter((l) => l.classList.contains("entry-bar"))
        .map((l) => l.textContent);
      expect(barred).toEqual([
        "•09:00 - un",
        "  suite de un",
        "",
        "  paragraphe en retrait",
        "  •sous-puce",
        "•10:00 - deux",
      ]);
      const first = lines(parent)
        .filter((l) => l.classList.contains("entry-bar-first"))
        .map((l) => l.textContent);
      expect(first).toEqual(["•09:00 - un", "•10:00 - deux"]);
      expect(line(parent, "tags:").classList.contains("entry-bar")).toBe(false);
      expect(line(parent, "- a").classList.contains("entry-bar")).toBe(false);
    });

    it("dessine la barre à gauche, de la couleur du thème, sur toute la hauteur de l'entrée", () => {
      const parent = entry();
      for (const text of ["09:00 - un", "paragraphe en retrait", "sous-puce", "10:00 - deux"]) {
        const style = getComputedStyle(line(parent, text));
        expect(style.backgroundImage).toContain("gradient");
        expect(style.backgroundRepeat).toBe("no-repeat");
        expect(style.backgroundPositionX).toBe("0%");
        expect(style.backgroundPositionY).toBe("100%");
        expect(parseFloat(style.paddingLeft)).toBeGreaterThan(8);
      }
      const nextLine = getComputedStyle(line(parent, "suite de un"));
      expect(nextLine.backgroundSize).toMatch(/^\d+(\.\d+)?px 100%$/);
    });

    it("sépare nettement deux entrées : leurs barres ne se touchent pas", () => {
      const parent = entry();
      const one = line(parent, "sous-puce").getBoundingClientRect();
      const twoLine = line(parent, "10:00 - deux");
      const two = twoLine.getBoundingClientRect();
      const barStart = two.top + parseFloat(getComputedStyle(twoLine).paddingTop);
      expect(barStart - one.bottom).toBeGreaterThanOrEqual(8);
      const firstOfOne = line(parent, "09:00 - un").getBoundingClientRect();
      const lastOfOne = line(parent, "sous-puce").getBoundingClientRect();
      expect(lastOfOne.bottom).toBeGreaterThan(firstOfOne.bottom + 3 * 10);
    });

    it("n'en met pas dans une note ordinaire", () => {
      const made = mount();
      made.parent.className = "editor";
      made.editor.show("# Note\n\n- un\n- deux\n");
      expect(made.parent.querySelector(".entry-bar")).toBeNull();
    });

    it("suit la version relue du cahier", () => {
      const made = mount();
      made.editor.show(NOTEBOOK);
      expect(made.parent.querySelectorAll(".entry-bar-first").length).toBe(1);
      made.editor.reload(`${NOTEBOOK}- 18:31 - deux\n`);
      expect(made.parent.querySelectorAll(".entry-bar-first").length).toBe(2);
    });
  });

  describe("numéro d'entrée", () => {
    const ENTRIES =
      "---\ntype: cahier-de-recherche\n---\n# Levures\n\n## 2026\n\n### Novembre\n\n#### Lundi 23\n\n" +
      "- 09:00 - un\n  suite de un\n  - sous-puce\n- 10:00 - deux\n- 11:00 - trois\n";
    const numbers = (parent: HTMLElement) => [
      ...parent.querySelectorAll<HTMLElement>(".entry-number"),
    ];
    const shown = (width = 600, copied: number[] = []) => {
      const made = mount({ copyReference: (number) => copied.push(number) });
      made.parent.className = "editor";
      made.parent.style.width = `${width}px`;
      made.editor.show(ENTRIES);
      return { ...made, copied };
    };

    it("montre les numéros 0001, 0002… dans l'ordre, un par entrée, sur la première ligne", () => {
      const { parent } = shown();
      expect(numbers(parent).map((n) => n.textContent)).toEqual(["0001", "0002", "0003"]);
      const firstLines = [...parent.querySelectorAll(".entry-bar-first")];
      expect(firstLines.map((l) => l.querySelector(".entry-number")?.textContent)).toEqual([
        "0001",
        "0002",
        "0003",
      ]);
      expect(parent.querySelectorAll(".entry-bar:not(.entry-bar-first) .entry-number").length).toBe(
        0,
      );
    });

    it("n'en montre aucun dans un cahier vide, une note ordinaire, ni sans moyen de copier", () => {
      const empty = mount({ copyReference: () => {} });
      empty.editor.show(NOTEBOOK.replace("- 18:30 - un\n", ""));
      expect(numbers(empty.parent)).toEqual([]);
      const note = mount({ copyReference: () => {} });
      note.editor.show("# Note\n\n- un\n- deux\n");
      expect(numbers(note.parent)).toEqual([]);
      const bare = mount();
      bare.editor.show(ENTRIES);
      expect(numbers(bare.parent)).toEqual([]);
      expect(bare.parent.querySelector(".cm-numbered-entries")).toBeNull();
    });

    it("suit la version relue : l'entrée ajoutée prend le numéro suivant", () => {
      const { parent, editor } = shown();
      editor.reload(`${ENTRIES}- 12:00 - quatre\n`);
      expect(numbers(parent).map((n) => n.textContent)).toEqual(["0001", "0002", "0003", "0004"]);
    });

    it("écrit un nombre de plus de 4 chiffres en entier, sans recouvrir le texte", async () => {
      const { parent, editor, view } = shown(300);
      const many = Array.from({ length: 10000 }, (_, i) => `- 09:00 - n${i}`).join("\n");
      editor.reload(`${NOTEBOOK.slice(0, NOTEBOOK.indexOf("- 18:30"))}${many}\n`);
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
      await expect.poll(() => numbers(parent).at(-1)?.textContent).toBe("10000");
      const box = (numbers(parent).at(-1) as HTMLElement).getBoundingClientRect();
      const line = (
        numbers(parent).at(-1)?.closest(".cm-line") as HTMLElement
      ).getBoundingClientRect();
      expect(box.right).toBeLessThanOrEqual(line.left);
      expect(box.left).toBeGreaterThanOrEqual(parent.getBoundingClientRect().left);
    });

    it("est un vrai bouton nommé, qui prend le focus au clavier", async () => {
      const { parent, copied } = shown();
      const [first, second] = numbers(parent);
      expect(first?.tagName).toBe("BUTTON");
      expect((first as HTMLButtonElement).type).toBe("button");
      expect(first?.getAttribute("aria-label")).toBe("Copier la référence de l'entrée 0001");
      expect(second?.title).toBe("Copier la référence de l'entrée 0002");
      (second as HTMLElement).focus();
      expect(document.activeElement).toBe(second);
      await userEvent.keyboard("{Enter}");
      await userEvent.keyboard(" ");
      expect(copied).toEqual([2, 2]);
    });

    it("copie la référence de l'entrée au clic, sans toucher au cahier ni au curseur", async () => {
      const { parent, copied, view, editor } = shown();
      const before = view.state.selection.main.head;
      await userEvent.click(numbers(parent)[2] as HTMLElement);
      await userEvent.click(numbers(parent)[0] as HTMLElement);
      expect(copied).toEqual([3, 1]);
      expect(editor.content()).toBe(ENTRIES);
      expect(view.state.selection.main.head).toBe(before);
    });

    it("se place dans la marge, en face de la première ligne, sans recouvrir le texte", () => {
      for (const width of [900, 300]) {
        const { parent } = shown(width);
        const lineBoxes = [...parent.querySelectorAll<HTMLElement>(".cm-line")].map((l) =>
          l.getBoundingClientRect(),
        );
        for (const box of numbers(parent)) {
          const rect = box.getBoundingClientRect();
          const line = (box.closest(".cm-line") as HTMLElement).getBoundingClientRect();
          const gap = parseFloat(
            getComputedStyle(box.closest(".cm-line") as HTMLElement).paddingTop,
          );
          expect(rect.right).toBeLessThanOrEqual(line.left);
          expect(rect.left).toBeGreaterThanOrEqual(parent.getBoundingClientRect().left);
          expect(rect.top).toBeGreaterThanOrEqual(line.top + gap - 1);
          expect(rect.bottom).toBeLessThanOrEqual(line.top + gap + 1.65 * 18 + 1);
          for (const other of lineBoxes) expect(rect.right).toBeLessThanOrEqual(other.left);
        }
      }
    });

    it("ne décale pas le texte d'une entrée à l'autre, ni la barre", () => {
      const { parent } = shown();
      const firsts = [...parent.querySelectorAll<HTMLElement>(".entry-bar-first")];
      const lefts = firsts.map((l) => l.getBoundingClientRect().left);
      expect(new Set(lefts).size).toBe(1);
      const text = parent.querySelector(".entry-bar:not(.entry-bar-first)") as HTMLElement;
      expect(text.getBoundingClientRect().left).toBe(lefts[0]);
    });

    it("prend les couleurs du thème, clair et sombre", () => {
      const { parent } = shown();
      const box = numbers(parent)[0] as HTMLElement;
      const style = getComputedStyle(box);
      expect(style.borderTopWidth).toBe("1px");
      const light = style.borderTopColor;
      document.documentElement.setAttribute("data-appearance", "dark");
      try {
        expect(getComputedStyle(box).borderTopColor).not.toBe(light);
      } finally {
        document.documentElement.removeAttribute("data-appearance");
      }
    });
  });
});
