import { describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, createAutosave, type Scheduler, timerScheduler } from "./autosave";

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
      path: "a.md",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return { path: "a.md" };
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
      path: "ancien.md",
      scheduler,
      save: async (name, content) => {
        calls.push(name);
        return { path: content.startsWith("# Nouveau") ? "nouveau.md" : name };
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
      path: "a.md",
      scheduler,
      save: (_name, content) => {
        calls.push(content);
        return new Promise((resolve) => {
          release = () => resolve({ path: "a.md" });
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
      path: "a.md",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return { path: "a.md" };
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
      path: "a.md",
      scheduler,
      save: async () => ({ path: "b.md" }),
      onSaved: (name) => saved.push(name),
    });
    autosave.edit("# B");
    await autosave.flush();
    expect(saved).toEqual(["b.md"]);
  });
});

describe("enregistrement automatique : échecs et délai", () => {
  it("signale un échec et garde le texte pour le prochain essai", async () => {
    const errors: unknown[] = [];
    const saves: string[] = [];
    let fail = true;
    const { scheduler } = manualScheduler();
    const autosave = createAutosave({
      path: "a.md",
      scheduler,
      save: async (_name, content) => {
        if (fail) throw new Error("disque plein");
        saves.push(content);
        return { path: "a.md" };
      },
      onSaved: () => {},
      onError: (error) => errors.push(error),
    });
    autosave.edit("précieux");
    await autosave.flush();
    expect(errors).toHaveLength(1);
    fail = false;
    await autosave.flush();
    expect(saves).toEqual(["précieux"]);
  });

  it("garde la frappe la plus récente si elle arrive pendant un échec", async () => {
    const saves: string[] = [];
    let attempt = 0;
    const { scheduler } = manualScheduler();
    const autosave = createAutosave({
      path: "a.md",
      scheduler,
      save: async (_name, content) => {
        attempt += 1;
        if (attempt === 1) {
          autosave.edit("plus récent");
          throw new Error("échec");
        }
        saves.push(content);
        return { path: "a.md" };
      },
      onSaved: () => {},
    });
    autosave.edit("ancien");
    await autosave.flush();
    await autosave.flush();
    expect(saves).toEqual(["plus récent"]);
  });

  it("n'enregistre rien s'il n'y a rien de nouveau", async () => {
    const saves: string[] = [];
    const { scheduler } = manualScheduler();
    const autosave = createAutosave({
      path: "a.md",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return { path: "a.md" };
      },
      onSaved: () => {},
    });
    await autosave.flush();
    expect(saves).toEqual([]);
  });

  it("attend par défaut le délai d'enregistrement automatique", () => {
    vi.useFakeTimers();
    try {
      let ran = 0;
      timerScheduler().schedule(() => (ran += 1));
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
      expect(ran).toBe(0);
      vi.advanceTimersByTime(1);
      expect(ran).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("attend le délai prévu après la dernière frappe", () => {
    vi.useFakeTimers();
    try {
      let ran = 0;
      const cancel = timerScheduler(600).schedule(() => (ran += 1));
      vi.advanceTimersByTime(599);
      expect(ran).toBe(0);
      vi.advanceTimersByTime(1);
      expect(ran).toBe(1);
      cancel();
      const cancelled = timerScheduler(600).schedule(() => (ran += 1));
      cancelled();
      vi.advanceTimersByTime(1000);
      expect(ran).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
