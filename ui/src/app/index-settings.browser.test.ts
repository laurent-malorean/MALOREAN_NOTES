import { afterEach, describe, expect, it } from "vitest";
import { indexSettings } from "./index-settings";

afterEach(() => document.body.replaceChildren());

function setup(overviews: { notes: number; rebuilt: string | null }[]) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  let read = 0;
  const [frame] = indexSettings(
    {
      backend: {
        indexOverview: async () => (
          calls.push("état"),
          overviews[Math.min(read++, overviews.length - 1)] as (typeof overviews)[number]
        ),
      },
      run: (action) => void action.catch((error) => failures.push(error)),
    },
    async () => void calls.push("reconstruction"),
  ) as [HTMLElement];
  document.body.append(frame);
  const texts = () => [...frame.querySelectorAll("p")].map((p) => p.textContent);
  return { frame, calls, texts, failures };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("réglages de l'index de mots, côté application", () => {
  it("lit l'état de l'index et le montre", async () => {
    const t = setup([{ notes: 12, rebuilt: null }]);
    expect(t.texts()).toEqual(["Lecture de l'état de l'index…"]);
    await settled();
    expect(t.texts()).toEqual([
      "12 notes indexées",
      "Dernière reconstruction : aucune depuis le lancement",
    ]);
  });

  it("reconstruit l'index au clic, puis relit son état", async () => {
    const t = setup([
      { notes: 12, rebuilt: null },
      { notes: 12, rebuilt: "23 novembre 2026 à 14:30" },
    ]);
    await settled();
    t.frame.querySelector("button")?.click();
    await settled();
    expect(t.calls).toEqual(["état", "reconstruction", "état"]);
    expect(t.texts()[1]).toBe("Dernière reconstruction : 23 novembre 2026 à 14:30");
  });
});
