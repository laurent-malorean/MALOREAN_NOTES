import { describe, expect, it } from "vitest";
import { columnsStarted } from "../state/columns";
import { type Screen, welcome } from "../state/screen";
import { launch, type LaunchDeps } from "./launch";

function setup(opened: { name: string; path: string } | null, failing = false) {
  const log: string[] = [];
  const deps: LaunchDeps = {
    bridge: { reopenLastWorkspace: async () => (log.push("rouvrir"), opened) },
    screen: { show: (screen: Screen) => log.push(screen === welcome ? "accueil" : "autre") },
    columns: {
      current: () => columnsStarted,
      change: async () => void log.push("colonnes"),
    },
    templates: {
      migrate: async () => {
        log.push("migrer");
        if (failing) throw new Error("moteur absent");
      },
    },
    workspace: { open: async (info) => void log.push(`ouvrir ${info.name}`) },
    journal: { atLaunch: async () => void log.push("note du jour") },
    error: (error) => log.push(`erreur ${(error as Error).message}`),
  };
  return { deps, log };
}

describe("lancement", () => {
  it("montre l'accueil, migre, rouvre le dernier espace, puis la note du jour", async () => {
    const { deps, log } = setup({ name: "Notes", path: "/n" });
    await launch(deps);
    expect(log).toEqual([
      "accueil",
      "colonnes",
      "migrer",
      "rouvrir",
      "ouvrir Notes",
      "note du jour",
    ]);
  });

  it("sans dernier espace, reste sur l'accueil", async () => {
    const { deps, log } = setup(null);
    await launch(deps);
    expect(log).toEqual(["accueil", "colonnes", "migrer", "rouvrir"]);
  });

  it("dit l'erreur d'un lancement qui échoue, sans rouvrir d'espace", async () => {
    const { deps, log } = setup({ name: "Notes", path: "/n" }, true);
    await launch(deps);
    expect(log).toEqual(["accueil", "colonnes", "migrer", "erreur moteur absent"]);
  });
});
