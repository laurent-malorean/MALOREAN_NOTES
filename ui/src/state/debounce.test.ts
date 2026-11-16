import { describe, expect, it } from "vitest";
import type { Scheduler } from "./autosave";
import { createDebouncer } from "./debounce";

/** Horloge manuelle qui garde chaque attente programmée, annulée ou non. */
function manualScheduler() {
  const pending = new Set<() => void>();
  const scheduler: Scheduler = {
    schedule: (run) => {
      pending.add(run);
      return () => pending.delete(run);
    },
  };
  const elapse = () => {
    for (const run of [...pending]) {
      pending.delete(run);
      run();
    }
  };
  return { scheduler, elapse };
}

describe("attendre une pause avant d'agir", () => {
  it("n'agit qu'une fois, avec la dernière demande, après la pause", () => {
    const { scheduler, elapse } = manualScheduler();
    const done: string[] = [];
    const later = createDebouncer(scheduler);
    later(() => done.push("p"));
    later(() => done.push("pa"));
    later(() => done.push("pain"));
    expect(done).toEqual([]);
    elapse();
    expect(done).toEqual(["pain"]);
  });

  it("peut être annulé avant la pause", () => {
    const { scheduler, elapse } = manualScheduler();
    const done: string[] = [];
    const later = createDebouncer(scheduler);
    later(() => done.push("pain"));
    later.cancel();
    elapse();
    expect(done).toEqual([]);
  });

  it("agit de nouveau après une première pause", () => {
    const { scheduler, elapse } = manualScheduler();
    const done: string[] = [];
    const later = createDebouncer(scheduler);
    later(() => done.push("a"));
    elapse();
    later(() => done.push("b"));
    elapse();
    expect(done).toEqual(["a", "b"]);
  });
});
