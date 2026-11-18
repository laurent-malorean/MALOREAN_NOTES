import { describe, expect, it } from "vitest";
import { welcome, workspaceOpened, workspaceRenamed } from "./screen";

describe("espace de travail renommé", () => {
  it("garde tout, sous son nouveau nom ; son dossier ne change pas", () => {
    const opened = workspaceOpened({ name: "Notes", path: "/Users/moi/Notes" }, ["a"], []);
    expect(workspaceRenamed(opened, "Perso")).toEqual({
      ...opened,
      workspace: { name: "Perso", path: "/Users/moi/Notes" },
    });
  });

  it("ne change rien à l'accueil", () => {
    expect(workspaceRenamed(welcome, "Perso")).toBe(welcome);
  });
});
