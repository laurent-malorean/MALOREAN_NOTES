import { describe, expect, it, vi } from "vitest";
import type { SaveResult } from "../bridge/generated/SaveResult";
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

/** La réponse de Rust à un enregistrement, sans conflit. */
const result = (path: string, fingerprint = "f-enregistree"): SaveResult => ({
  path,
  title: "Titre",
  fingerprint,
  conflictCopy: null,
});

describe("enregistrement automatique", () => {
  it("enregistre seulement après une pause dans la frappe", async () => {
    const saves: string[] = [];
    const { scheduler, elapse } = manualScheduler();
    const autosave = createAutosave({
      path: "a.md",
      fingerprint: "f-lue",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return result("a.md");
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
      fingerprint: "f-lue",
      scheduler,
      save: async (name, content) => {
        calls.push(name);
        return result(content.startsWith("# Nouveau") ? "nouveau.md" : name);
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
      fingerprint: "f-lue",
      scheduler,
      save: (_name, content) => {
        calls.push(content);
        return new Promise((resolve) => {
          release = () => resolve(result("a.md"));
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
      fingerprint: "f-lue",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return result("a.md");
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
      fingerprint: "f-lue",
      scheduler,
      save: async () => result("b.md"),
      onSaved: (done) => saved.push(done.path),
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
      fingerprint: "f-lue",
      scheduler,
      save: async (_name, content) => {
        if (fail) throw new Error("disque plein");
        saves.push(content);
        return result("a.md");
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
      fingerprint: "f-lue",
      scheduler,
      save: async (_name, content) => {
        attempt += 1;
        if (attempt === 1) {
          autosave.edit("plus récent");
          throw new Error("échec");
        }
        saves.push(content);
        return result("a.md");
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
      fingerprint: "f-lue",
      scheduler,
      save: async (_name, content) => {
        saves.push(content);
        return result("a.md");
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

describe("enregistrement automatique : empreinte de la note", () => {
  it("envoie l'empreinte lue, puis celle du dernier enregistrement", async () => {
    const sent: string[] = [];
    let count = 0;
    const autosave = createAutosave({
      path: "a.md",
      fingerprint: "f-lue",
      scheduler: manualScheduler().scheduler,
      save: async (_path, _content, fingerprint) => {
        sent.push(fingerprint);
        count += 1;
        return result("a.md", `f-${count}`);
      },
      onSaved: () => {},
    });
    autosave.edit("v1");
    await autosave.flush();
    autosave.edit("v2");
    await autosave.flush();
    expect(sent).toEqual(["f-lue", "f-1"]);
    expect(autosave.fingerprint()).toBe("f-2");
  });

  it("adopte l'empreinte d'une version relue sur le disque", async () => {
    const sent: string[] = [];
    const autosave = createAutosave({
      path: "a.md",
      fingerprint: "f-lue",
      scheduler: manualScheduler().scheduler,
      save: async (_path, _content, fingerprint) => {
        sent.push(fingerprint);
        return result("a.md");
      },
      onSaved: () => {},
    });
    autosave.adopt("f-relue");
    autosave.edit("v1");
    await autosave.flush();
    expect(sent).toEqual(["f-relue"]);
  });

  it("transmet la copie de conflit faite par Rust", async () => {
    const copies: (string | null)[] = [];
    const autosave = createAutosave({
      path: "a.md",
      fingerprint: "f-lue",
      scheduler: manualScheduler().scheduler,
      save: async () => ({
        path: "a.md",
        title: "A",
        fingerprint: "f",
        conflictCopy: "a (conflit).md",
      }),
      onSaved: (done) => copies.push(done.conflictCopy),
    });
    autosave.edit("v1");
    await autosave.flush();
    expect(copies).toEqual(["a (conflit).md"]);
  });

  it("n'est au repos que sans frappe en attente ni enregistrement en cours", async () => {
    let release: () => void = () => {};
    const autosave = createAutosave({
      path: "a.md",
      fingerprint: "f-lue",
      scheduler: manualScheduler().scheduler,
      save: () => new Promise((resolve) => (release = () => resolve(result("a.md")))),
      onSaved: () => {},
    });
    expect(autosave.isIdle()).toBe(true);
    autosave.edit("v1");
    expect(autosave.isIdle()).toBe(false);
    const saving = autosave.flush();
    expect(autosave.isIdle()).toBe(false);
    release();
    await saving;
    expect(autosave.isIdle()).toBe(true);
  });
});
