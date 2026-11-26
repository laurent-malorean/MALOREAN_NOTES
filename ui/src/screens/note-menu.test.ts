import { describe, expect, it } from "vitest";
import { noteMenu, RENAME_LABEL, withRename } from "./note-menu";

describe("menu d'une note", () => {
  it("propose de l'ouvrir dans un nouvel onglet, à gauche, à droite, ou de la fermer", () => {
    const asked: string[] = [];
    const entries = noteMenu({
      place: (placement) => asked.push(placement),
      close: () => asked.push("fermer"),
    });
    expect(entries.map((entry) => entry.label)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
    ]);
    for (const entry of entries) entry.run();
    expect(asked).toEqual(["newTab", "left", "right", "fermer"]);
  });

  it("propose « Renommer… », avec l'icône du crayon, quand on peut renommer la note", () => {
    const asked: string[] = [];
    const entries = noteMenu({
      place: () => undefined,
      close: () => undefined,
      rename: () => asked.push("renommer"),
    });
    expect(RENAME_LABEL).toBe("Renommer…");
    expect(entries.map((entry) => entry.label)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
      "Renommer…",
    ]);
    const rename = entries[4];
    expect(rename?.icon).toBe("edit");
    rename?.run();
    expect(asked).toEqual(["renommer"]);
  });
});

describe("« Renommer… » dans un menu qui s'ouvre après la question posée à l'application", () => {
  const offer = (available: boolean | Error) => {
    const started: string[] = [];
    return {
      started,
      renaming: {
        available: async (path: string) => {
          if (available instanceof Error) throw available;
          return available && path !== "";
        },
        start: (path: string) => started.push(path),
      },
    };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("sans de quoi renommer, le menu s'ouvre tout de suite, sans « Renommer… »", () => {
    const shown: ((() => void) | undefined)[] = [];
    withRename("a.md", undefined, (rename) => shown.push(rename));
    expect(shown).toEqual([undefined]);
  });

  it("quand la note peut être renommée, le menu reçoit de quoi la renommer", async () => {
    const { renaming, started } = offer(true);
    const shown: ((() => void) | undefined)[] = [];
    withRename("a.md", renaming, (rename) => shown.push(rename));
    expect(shown).toEqual([]);
    await settle();
    expect(shown).toHaveLength(1);
    shown[0]?.();
    expect(started).toEqual(["a.md"]);
  });

  it("quand elle ne peut pas l'être, ou que la question échoue, le menu s'ouvre sans « Renommer… »", async () => {
    for (const available of [false, new Error("échec")]) {
      const { renaming } = offer(available);
      const shown: ((() => void) | undefined)[] = [];
      withRename("a.md", renaming, (rename) => shown.push(rename));
      await settle();
      expect(shown).toEqual([undefined]);
    }
  });
});
