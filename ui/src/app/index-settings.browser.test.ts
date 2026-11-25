import { afterEach, describe, expect, it, vi } from "vitest";
import type { IndexOverviewItem } from "../bridge/generated/IndexOverviewItem";
import { indexSettings } from "./index-settings";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const overview = (notes: number, total: number, rebuilt: string | null = null) => ({
  notes,
  total,
  rebuilt,
});

function setup(
  overviews: IndexOverviewItem[],
  rebuild: () => Promise<void> = async () => undefined,
) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  let read = 0;
  const [frame] = indexSettings(
    {
      backend: {
        indexOverview: async () => (
          calls.push("état"),
          overviews[Math.min(read++, overviews.length - 1)] as IndexOverviewItem
        ),
      },
      run: (action) => void action.catch((error) => failures.push(error)),
    },
    async () => {
      calls.push("reconstruction");
      await rebuild();
    },
  ) as [HTMLElement];
  document.body.append(frame);
  const texts = () => [...frame.querySelectorAll("p")].map((p) => p.textContent);
  const bar = () => frame.querySelector(".index-bar");
  const written = () => bar()?.querySelector(".index-bar-percent")?.textContent;
  return { frame, calls, texts, failures, bar, written };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("réglages de l'index de mots, côté application", () => {
  it("lit l'état de l'index et le montre", async () => {
    const t = setup([overview(12, 12)]);
    expect(t.texts()).toEqual(["Lecture de l'état de l'index…"]);
    expect(t.bar()).toBeNull();
    await settled();
    expect(t.texts()).toEqual([
      "12 notes indexées",
      "Dernière reconstruction : aucune depuis le lancement",
    ]);
  });

  it("montre la barre de l'index des notes : les notes faites sur le total et le pourcentage", async () => {
    const t = setup([overview(631, 645)]);
    await settled();
    expect(t.written()).toBe("631 sur 645, 97 %");
    const track = t.bar()?.querySelector("[role=progressbar]");
    expect(track?.getAttribute("aria-label")).toBe("Index des notes");
    expect(track?.getAttribute("aria-valuenow")).toBe("97");
  });

  it("ne montre pas la barre quand l'espace de travail n'a aucune note à indexer", async () => {
    const t = setup([overview(0, 0)]);
    await settled();
    expect(t.bar()).toBeNull();
    expect(t.texts()[0]).toBe("0 note indexée");
  });

  it("reconstruit l'index au clic, puis relit son état", async () => {
    const t = setup([overview(12, 12), overview(12, 12, "23 novembre 2026 à 14:30")]);
    await settled();
    t.frame.querySelector("button")?.click();
    await settled();
    expect(t.calls).toEqual(["état", "reconstruction", "état"]);
    expect(t.texts()[1]).toBe("Dernière reconstruction : 23 novembre 2026 à 14:30");
  });

  it("suit la reconstruction : la barre avance pendant qu'elle dure, puis s'arrête de relire", async () => {
    vi.useFakeTimers();
    let finish = () => {};
    const t = setup(
      [overview(645, 645), overview(0, 645), overview(300, 645), overview(645, 645, "fin")],
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(t.written()).toBe("645 sur 645, 100 %");
    t.frame.querySelector("button")?.click();
    await vi.advanceTimersByTimeAsync(499);
    expect(t.calls).toEqual(["état", "reconstruction"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.written()).toBe("0 sur 645, 0 %");
    await vi.advanceTimersByTimeAsync(500);
    expect(t.written()).toBe("300 sur 645, 46 %");
    expect(t.texts()[0]).toBe("300 notes indexées");
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.written()).toBe("645 sur 645, 100 %");
    expect(t.texts()[1]).toBe("Dernière reconstruction : fin");
    const reads = t.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.calls).toHaveLength(reads);
  });

  it("relit l'état et arrête de le suivre même si la reconstruction échoue, et dit l'erreur", async () => {
    vi.useFakeTimers();
    const t = setup([overview(5, 10), overview(0, 10)], async () => {
      throw new Error("disque plein");
    });
    await vi.advanceTimersByTimeAsync(0);
    t.frame.querySelector("button")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.failures).toHaveLength(1);
    expect(t.written()).toBe("0 sur 10, 0 %");
    const reads = t.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.calls).toHaveLength(reads);
  });

  it("ne laisse pas une lecture lente, rendue après une plus récente, redessiner un état périmé", async () => {
    const answers: ((item: IndexOverviewItem) => void)[] = [];
    const [frame] = indexSettings(
      {
        backend: {
          indexOverview: () => new Promise<IndexOverviewItem>((resolve) => answers.push(resolve)),
        },
        run: () => undefined,
      },
      async () => undefined,
    ) as [HTMLElement];
    document.body.append(frame);
    frame.querySelector("button")?.click();
    await settled();
    expect(answers).toHaveLength(2);
    (answers[1] as (item: IndexOverviewItem) => void)(overview(10, 10));
    await settled();
    (answers[0] as (item: IndexOverviewItem) => void)(overview(2, 10));
    await settled();
    expect(frame.querySelector(".index-bar-percent")?.textContent).toBe("10 sur 10, 100 %");
  });
});
