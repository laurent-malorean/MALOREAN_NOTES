import { describe, expect, it } from "vitest";
import { recordedScreen } from "../../test-support/app-fixture";
import { createWorkspace, type WorkspaceDeps } from "./workspace";

describe("réglages de l'espace de travail ouvert", () => {
  it("donne la partie « Index » de l'écran de réglages", () => {
    const { screen } = recordedScreen();
    const deps = {
      backend: { indexOverview: async () => ({ notes: 3, rebuilt: null }) },
      screen,
      run: () => {},
    } as unknown as WorkspaceDeps;
    const groups = createWorkspace(deps).settingsGroups();
    expect(groups.map((group) => group.querySelector("legend")?.textContent)).toEqual(["Index"]);
  });
});
