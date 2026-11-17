import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import type { AttachmentOrigin } from "../bridge";
import type { LinkingNoteItem } from "../bridge/generated/LinkingNoteItem";
import type { SaveResult } from "../bridge/generated/SaveResult";
import type { Scheduler } from "../state/autosave";
import type { ColumnParts } from "./columns-view";
import { createPane, type PaneBackend } from "./note-pane";

/** Une bibliothèque en mémoire : chaque note, son contenu ; l'empreinte est le contenu même. */
function fakeBackend(notes: Record<string, string>) {
  const calls: string[] = [];
  const backlinks: Record<string, LinkingNoteItem[]> = {};
  /** Une réponse retenue jusqu'à ce que sa porte s'ouvre : « lire a.md », « liens a.md ». */
  const gates: Record<string, Promise<void>> = {};
  const backend: PaneBackend & { fail: boolean } = {
    fail: false,
    readNote: async (path) => {
      calls.push(`lire ${path}`);
      await gates[`lire ${path}`];
      const content = notes[path];
      if (content === undefined) throw new Error(`${path} absente`);
      return { path, content, fingerprint: content };
    },
    saveNote: (path, content, fingerprint) => {
      calls.push(`enregistrer ${path} ${fingerprint}`);
      if (backend.fail) return Promise.reject(new Error("disque plein"));
      const renamed = content.startsWith("# Nouveau") ? "nouveau.md" : path;
      Reflect.deleteProperty(notes, path);
      notes[renamed] = content;
      const result: SaveResult = { path: renamed, fingerprint: content, conflictCopy: null };
      return Promise.resolve(result);
    },
    listBacklinks: async (path) => {
      calls.push(`liens ${path}`);
      await gates[`liens ${path}`];
      return backlinks[path] ?? [];
    },
    attachFile: (path: string, file: File, origin: AttachmentOrigin) => {
      calls.push(`joindre ${path} ${file.name} ${origin.kind}`);
      if (backend.fail) return Promise.reject(new Error("refusé"));
      return Promise.resolve({ markdown: `![](${file.name})` });
    },
    openAttachment: (path, target) => {
      calls.push(`ouvrir ${path} ${target}`);
      return backend.fail ? Promise.reject(new Error("introuvable")) : Promise.resolve(null);
    },
  };
  /** Retient la réponse `call` ; rend de quoi la laisser passer. */
  const hold = (call: string) => {
    let open = () => {};
    gates[call] = new Promise((resolve) => (open = resolve));
    return open;
  };
  return { backend, calls, notes, backlinks, hold };
}

/** Un minuteur qu'on déclenche à la main. */
function manualScheduler() {
  let pending: (() => void) | null = null;
  const scheduler: Scheduler = {
    schedule: (run) => {
      pending = run;
      return () => (pending = null);
    },
  };
  return { scheduler, fire: () => pending?.() };
}

function mount(notes: Record<string, string> = { "a.md": "# A", "b.md": "# B" }) {
  const element = document.createElement("section");
  const backlinks = document.createElement("nav");
  element.append(backlinks);
  document.body.replaceChildren(element);
  const parts: ColumnParts = { element, backlinks };
  const fake = fakeBackend(notes);
  const timer = manualScheduler();
  const events: string[] = [];
  const errors: string[] = [];
  const images: string[] = [];
  const pane = createPane(parts, {
    backend: fake.backend,
    scheduler: timer.scheduler,
    events: {
      saved: (from, result) => events.push(`enregistrée ${from} → ${result.path}`),
      openNote: (path) => events.push(`ouvrir ${path}`),
      openLink: (title) => events.push(`lien ${title}`),
      deleted: () => events.push("supprimée"),
      error: (error) => errors.push((error as Error).message),
    },
    resolveImage: (src, note) => {
      images.push(`${note ?? "aucune"} ${src}`);
      return src;
    },
  });
  const view = () => EditorView.findFromDOM(element.querySelector(".cm-editor") as HTMLElement);
  const type = (text: string) => {
    const editor = view() as EditorView;
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: text } });
  };
  return { pane, parts, ...fake, ...timer, events, errors, images, view, type };
}

const text = (m: ReturnType<typeof mount>) => m.view()?.state.doc.toString();
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("colonne : la note qu'elle montre", () => {
  it("lit la note demandée et la montre, avec ses liens entrants", async () => {
    const m = mount();
    m.backlinks["a.md"] = [{ path: "b.md", title: "B", folder: "" }];
    await m.pane.load("a.md");
    expect(m.pane.note()).toBe("a.md");
    expect(text(m)).toBe("# A");
    await expect.poll(() => m.parts.backlinks.textContent).toContain("B");
    m.parts.backlinks.querySelector("button")?.click();
    expect(m.events).toEqual(["ouvrir b.md"]);
  });

  it("ne relit pas la note qu'elle montre déjà", async () => {
    const m = mount();
    await m.pane.load("a.md");
    await m.pane.load("a.md");
    expect(m.calls.filter((call) => call === "lire a.md")).toHaveLength(1);
  });

  it("sans note, l'éditeur est vide et les liens entrants cachés", async () => {
    const m = mount();
    await m.pane.load("a.md");
    await m.pane.load(null);
    expect(m.pane.note()).toBeNull();
    expect(text(m)).toBe("");
    await settle();
    expect(m.parts.backlinks.hidden).toBe(true);
    expect(m.calls).not.toContain("liens null");
  });

  it("enregistre ce qui est tapé avant de montrer une autre note", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.type("!");
    await m.pane.load("b.md");
    expect(m.calls).toContain("enregistrer a.md # A");
    expect(m.notes["a.md"]).toBe("# A!");
    expect(text(m)).toBe("# B");
  });

  it("ignore une lecture arrivée après qu'une autre note a été demandée", async () => {
    const m = mount();
    const release = m.hold("lire a.md");
    const first = m.pane.load("a.md");
    await m.pane.load("b.md");
    release();
    await first;
    expect(m.pane.note()).toBe("b.md");
    expect(text(m)).toBe("# B");
    m.type("?");
    await m.pane.flush();
    expect(m.notes["b.md"]).toBe("# B?");
    expect(m.notes["a.md"]).toBe("# A");
  });

  it("ignore des liens entrants arrivés pour une note qu'elle ne montre plus", async () => {
    const m = mount();
    m.backlinks["a.md"] = [{ path: "x.md", title: "X", folder: "" }];
    const release = m.hold("liens a.md");
    await m.pane.load("a.md");
    await m.pane.load(null);
    release();
    await settle();
    expect(m.parts.backlinks.textContent).toBe("");
  });
});

describe("colonne : enregistrement de ce qu'on tape", () => {
  it("enregistre après une pause, et suit le nouveau nom quand le titre change", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.view()?.dispatch({ changes: { from: 0, to: 3, insert: "# Nouveau" } });
    await settle();
    expect(m.calls.some((call) => call.startsWith("enregistrer"))).toBe(false);
    m.fire();
    await settle();
    expect(m.pane.note()).toBe("nouveau.md");
    expect(m.events).toEqual(["enregistrée a.md → nouveau.md"]);
    await expect.poll(() => m.calls).toContain("liens nouveau.md");
    m.type(" titre");
    await m.pane.flush();
    expect(m.notes["nouveau.md"]).toBe("# Nouveau titre");
  });

  it("sans minuteur fourni, enregistre après la pause habituelle", async () => {
    const element = document.createElement("section");
    const backlinks = document.createElement("nav");
    document.body.replaceChildren(element);
    const fake = fakeBackend({ "a.md": "# A" });
    const pane = createPane(
      { element, backlinks },
      {
        backend: fake.backend,
        events: {
          saved: () => {},
          openNote: () => {},
          openLink: () => {},
          deleted: () => {},
          error: () => {},
        },
        resolveImage: (src) => src,
      },
    );
    await pane.load("a.md");
    const view = EditorView.findFromDOM(element.querySelector(".cm-editor") as HTMLElement);
    view?.dispatch({ changes: { from: 3, insert: "!" } });
    await expect.poll(() => fake.notes["a.md"]).toBe("# A!");
  });

  it("garde son nom quand une autre note a été demandée pendant l'enregistrement", async () => {
    const m = mount({ "a.md": "# A", "b.md": "# B" });
    await m.pane.load("a.md");
    m.view()?.dispatch({ changes: { from: 0, to: 3, insert: "# Nouveau" } });
    await m.pane.load("b.md");
    expect(m.events).toEqual(["enregistrée a.md → nouveau.md"]);
    expect(m.pane.note()).toBe("b.md");
  });

  it("enregistre tout de suite à la demande, et dit les échecs", async () => {
    const m = mount();
    await m.pane.flush();
    await m.pane.load("a.md");
    m.backend.fail = true;
    m.type("!");
    await m.pane.flush();
    expect(m.errors).toEqual(["disque plein"]);
  });

  it("n'enregistre plus rien d'une note partie à la corbeille", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.pane.forget();
    m.type("!");
    m.fire();
    await m.pane.flush();
    expect(m.calls.some((call) => call.startsWith("enregistrer"))).toBe(false);
  });

  it("enregistre ce qui est tapé quand la colonne disparaît, et retire son éditeur", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.type("!");
    m.pane.destroy();
    expect(m.parts.element.querySelector(".cm-editor")).toBeNull();
    await expect.poll(() => m.notes["a.md"]).toBe("# A!");
  });

  it("un échec à la disparition est dit, et sans note rien n'est enregistré", async () => {
    const m = mount();
    m.pane.destroy();
    const other = mount();
    await other.pane.load("a.md");
    other.backend.fail = true;
    other.type("!");
    other.pane.destroy();
    await expect.poll(() => other.errors).toEqual(["disque plein"]);
  });
});

describe("colonne : la note a changé sur le disque", () => {
  it("montre la nouvelle version quand rien n'attend d'être enregistré", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.notes["a.md"] = "# A changée";
    await m.pane.followDisk();
    expect(text(m)).toBe("# A changée");
    m.type("!");
    await m.pane.flush();
    expect(m.calls).toContain("enregistrer a.md # A changée");
  });

  it("ne fait rien si le disque a la version connue, ou si elle ne montre rien", async () => {
    const m = mount();
    await m.pane.followDisk();
    expect(m.calls).toEqual([]);
    await m.pane.load("a.md");
    await m.pane.followDisk();
    expect(text(m)).toBe("# A");
    expect(m.events).toEqual([]);
    expect(m.calls.some((call) => call.startsWith("enregistrer"))).toBe(false);
  });

  it("changée des deux côtés : enregistre ce qui est tapé", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.notes["a.md"] = "# A ailleurs";
    m.type("!");
    await m.pane.followDisk();
    expect(m.calls).toContain("enregistrer a.md # A");
    expect(m.notes["a.md"]).toBe("# A!");
  });

  it("supprimée ailleurs : le dit, le texte reste", async () => {
    const m = mount();
    await m.pane.load("a.md");
    Reflect.deleteProperty(m.notes, "a.md");
    await m.pane.followDisk();
    expect(m.events).toEqual(["supprimée"]);
    expect(text(m)).toBe("# A");
  });
});

/** Un collage d'image dans l'éditeur. */
function paste(view: EditorView, name: string) {
  const transfer = new DataTransfer();
  transfer.items.add(new File(["x"], name, { type: "image/png" }));
  const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: transfer });
  view.contentDOM.dispatchEvent(event);
}

/** Un Cmd+clic à la position `pos` du texte. */
function metaClick(view: EditorView, pos: number) {
  const coords = view.coordsAtPos(pos);
  if (!coords) throw new Error("position hors de l'écran");
  const at = { clientX: coords.left + 1, clientY: (coords.top + coords.bottom) / 2 };
  view.contentDOM.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, metaKey: true, ...at }),
  );
}

describe("colonne : pièces jointes, images et liens de sa note", () => {
  it("joint à sa note ce qu'on colle, ce qui est tapé enregistré d'abord", async () => {
    const m = mount();
    await m.pane.load("a.md");
    m.type("!");
    paste(m.view() as EditorView, "vue.png");
    await expect.poll(() => text(m)).toContain("![](vue.png)");
    const effects = m.calls.filter((call) => !call.startsWith("liens"));
    expect(effects.slice(-2)).toEqual(["enregistrer a.md # A", "joindre a.md vue.png pasted"]);
  });

  it("ne joint rien sans note, et dit un échec", async () => {
    const m = mount();
    paste(m.view() as EditorView, "vue.png");
    await settle();
    expect(m.calls).toEqual([]);
    await m.pane.load("a.md");
    m.backend.fail = true;
    paste(m.view() as EditorView, "vue.png");
    await expect.poll(() => m.errors).toEqual(["refusé"]);
    expect(text(m)).toBe("# A");
  });

  it("Cmd+clic ouvre une pièce jointe de sa note, et dit un échec", async () => {
    const m = mount({ "a.md": "[Billet](a.assets/billet.pdf)" });
    await m.pane.load("a.md");
    metaClick(m.view() as EditorView, 2);
    expect(m.calls).toContain("ouvrir a.md a.assets/billet.pdf");
    m.backend.fail = true;
    metaClick(m.view() as EditorView, 2);
    await expect.poll(() => m.errors).toEqual(["introuvable"]);
  });

  it("sans note, ce qu'on tape n'est enregistré nulle part, et Cmd+clic n'ouvre rien", async () => {
    const m = mount();
    const errors = vi.spyOn(console, "error");
    m.view()?.dispatch({ changes: { from: 0, insert: "[Billet](billet.pdf)" } });
    metaClick(m.view() as EditorView, 2);
    await settle();
    expect(m.calls).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("cherche les images à côté de sa note, et Cmd+clic suit un lien entre notes", async () => {
    const m = mount({ "a.md": "![vue](vue.png)\n\nVoir [[Courses]]" });
    await m.pane.load("a.md");
    expect(m.images).toContain("a.md vue.png");
    const view = m.view() as EditorView;
    metaClick(view, view.state.doc.toString().indexOf("Courses") + 2);
    expect(m.events).toEqual(["lien Courses"]);
  });
});
