import { describe, expect, it } from "vitest";
import { createAutosave, type Scheduler } from "./autosave";

/** Horloge manuelle : les délais ne s'écoulent que quand le test le décide. */
function manualScheduler() {
  let pending: (() => void) | null = null;
  const scheduler: Scheduler = {
    schedule: (run) => {
      pending = run;
      return () => {
        pending = null;
      };
    },
  };
  return { scheduler, elapse: () => pending?.() };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("enregistrement automatique", () => {
  it("enregistre seulement après une pause dans la frappe", async () => {
    const saves: string[] = [];
    const { scheduler, elapse } = manualScheduler();
    const autosave = createAutosave({
      fileName: "a.md",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return { fileName: "a.md" };
      },
      onSaved: () => {},
    });
    autosave.edit("# A");
    autosave.edit("# Ab");
    expect(saves).toEqual([]);
    elapse();
    await flushPromises();
    expect(saves).toEqual(["# Ab"]);
  });

  it("utilise le nouveau nom de fichier après un renommage", async () => {
    const calls: string[] = [];
    const { scheduler, elapse } = manualScheduler();
    const autosave = createAutosave({
      fileName: "ancien.md",
      scheduler,
      save: async (name, content) => {
        calls.push(name);
        return { fileName: content.startsWith("# Nouveau") ? "nouveau.md" : name };
      },
      onSaved: () => {},
    });
    autosave.edit("# Nouveau");
    elapse();
    await flushPromises();
    autosave.edit("# Nouveau titre");
    elapse();
    await flushPromises();
    expect(calls).toEqual(["ancien.md", "nouveau.md"]);
  });

  it("n'enregistre jamais deux fois en même temps et garde la dernière version", async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const { scheduler, elapse } = manualScheduler();
    const autosave = createAutosave({
      fileName: "a.md",
      scheduler,
      save: (_name, content) => {
        calls.push(content);
        return new Promise((resolve) => {
          release = () => resolve({ fileName: "a.md" });
        });
      },
      onSaved: () => {},
    });
    autosave.edit("v1");
    elapse();
    autosave.edit("v2");
    elapse();
    expect(calls).toEqual(["v1"]);
    release();
    await flushPromises();
    expect(calls).toEqual(["v1", "v2"]);
    release();
    await autosave.flush();
  });

  it("enregistre tout de suite ce qui reste quand on change de note", async () => {
    const saves: string[] = [];
    const { scheduler } = manualScheduler();
    const autosave = createAutosave({
      fileName: "a.md",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return { fileName: "a.md" };
      },
      onSaved: () => {},
    });
    autosave.edit("non enregistré");
    await autosave.flush();
    expect(saves).toEqual(["non enregistré"]);
  });

  it("signale le nom après chaque enregistrement", async () => {
    const saved: string[] = [];
    const { scheduler } = manualScheduler();
    const autosave = createAutosave({
      fileName: "a.md",
      scheduler,
      save: async () => ({ fileName: "b.md" }),
      onSaved: (name) => saved.push(name),
    });
    autosave.edit("# B");
    await autosave.flush();
    expect(saved).toEqual(["b.md"]);
  });
});
