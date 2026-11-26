import { describe, expect, it } from "vitest";
import {
  forgetTemplatesFolders,
  type KeyedStorage,
  storedTemplatesFolders,
  templatesIn,
} from "./templates-folder";

function memoryStorage(refused = false) {
  const items = new Map<string, string>();
  const check = () => {
    if (refused) throw new Error("stockage refusé");
  };
  const storage: KeyedStorage = {
    get length() {
      return (check(), items.size);
    },
    key: (index) => (check(), [...items.keys()][index] ?? null),
    getItem: (key) => (check(), items.get(key) ?? null),
    setItem: (key, value) => (check(), void items.set(key, value)),
    removeItem: (key) => (check(), void items.delete(key)),
  };
  return { storage, items };
}

describe("dossiers des modèles gardés autrefois par l'interface", () => {
  it("chaque espace de travail a le sien, rangé sous son dossier sur le disque", () => {
    const { storage, items } = memoryStorage();
    items.set("malorean.templates:/Users/moi/Notes", "Modèles");
    items.set("malorean.templates:/Users/moi/Travail", "Perso/Gabarits");
    expect(storedTemplatesFolders(storage)).toEqual([
      {
        key: "malorean.templates:/Users/moi/Notes",
        location: "/Users/moi/Notes",
        folder: "Modèles",
      },
      {
        key: "malorean.templates:/Users/moi/Travail",
        location: "/Users/moi/Travail",
        folder: "Perso/Gabarits",
      },
    ]);
  });

  it("ne retient que les clés des modèles, et pas un choix vide", () => {
    const { storage, items } = memoryStorage();
    items.set("malorean.journal:/Users/moi/Notes", '{"folder":"Journal"}');
    items.set("malorean.templates-autre:/x", "Modèles");
    items.set("malorean.templates:/Users/moi/Vide", "");
    items.set("malorean.templates:/Users/moi/Notes", "Modèles");
    expect(storedTemplatesFolders(storage).map((stored) => stored.location)).toEqual([
      "/Users/moi/Notes",
    ]);
  });

  it("rien à reprendre sans clé", () => {
    expect(storedTemplatesFolders(memoryStorage().storage)).toEqual([]);
  });

  it("oublier efface les clés données et rien d'autre", () => {
    const { storage, items } = memoryStorage();
    items.set("malorean.templates:/a", "A");
    items.set("malorean.templates:/b", "B");
    items.set("malorean.journal:/a", "{}");
    forgetTemplatesFolders(storage, ["malorean.templates:/a", "malorean.templates:/b"]);
    expect([...items.keys()]).toEqual(["malorean.journal:/a"]);
  });

  it("un stockage refusé ne donne rien et ne bloque rien", () => {
    const { storage } = memoryStorage(true);
    expect(storedTemplatesFolders(storage)).toEqual([]);
    expect(() => forgetTemplatesFolders(storage, ["malorean.templates:/a"])).not.toThrow();
  });
});

describe("modèles d'un dossier", () => {
  it("les modèles sont les notes du dossier, pas celles de ses sous-dossiers", () => {
    const notes = [
      { path: "Modèles/a.md", title: "A", folder: "Modèles" },
      { path: "Modèles/Vieux/b.md", title: "B", folder: "Modèles/Vieux" },
      { path: "c.md", title: "C", folder: "" },
      { path: "Modèles-bis/d.md", title: "D", folder: "Modèles-bis" },
    ];
    expect(templatesIn(notes, "Modèles").map((note) => note.path)).toEqual(["Modèles/a.md"]);
  });
});
