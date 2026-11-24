import { describe, expect, it } from "vitest";
import { type Host, type Settings, conduct } from "./conduct";
import type { Report } from "./report";
import type { Scenario } from "./runner";

const SETTINGS: Settings = { report: "/r.json", workspace: "/e" };
const clock = { now: () => 5 };

function host(over: Partial<Host> = {}) {
  const calls: string[] = [];
  const written: string[] = [];
  const made: Host = {
    settings: async () => SETTINGS,
    writeReport: async (report) => void (calls.push("écrit"), written.push(report)),
    quit: async () => void calls.push("quitte"),
    window: () => ({ width: 1100, height: 720, engine: "test" }),
    prepare: async () => [{ name: "un", run: async (t) => t.check("a", true) }],
    ...over,
  };
  return { made, calls, written };
}

describe("essai : son déroulement", () => {
  it("joue les scénarios, écrit le rapport en JSON, puis quitte", async () => {
    const { made, calls, written } = host();
    expect(await conduct(made, clock)).toBe(true);
    expect(calls).toEqual(["écrit", "quitte"]);
    const report = JSON.parse(written[0] ?? "{}") as Report;
    expect([report.version, report.passed, report.failed]).toEqual([1, 1, 0]);
    expect(report.scenarios[0]?.name).toBe("un");
    expect(report.window.width).toBe(1100);
    expect(report.scenarios[0]?.viewport.start.width).toBe(1100);
  });

  it("sans emplacements, l'application n'est pas lancée pour un essai : rien ne se passe", async () => {
    const { made, calls } = host({ settings: async () => null });
    expect(await conduct(made, clock)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("une mise en place ratée devient un scénario échoué avec son message", async () => {
    const { made, written } = host({
      prepare: async () => Promise.reject(new Error("espace refusé")),
    });
    await conduct(made, clock);
    const report = JSON.parse(written[0] ?? "{}") as Report;
    expect(report.failed).toBe(1);
    expect(report.scenarios[0]?.name).toBe("Mise en place de l'essai");
    expect(report.scenarios[0]?.error).toBe("espace refusé");
  });

  it("une mise en place qui échoue sans Error garde son texte", async () => {
    const { made, written } = host({ prepare: async () => Promise.reject("non") });
    await conduct(made, clock);
    expect((JSON.parse(written[0] ?? "{}") as Report).scenarios[0]?.error).toBe("non");
  });

  it("l'application quitte même si le rapport ne s'écrit pas", async () => {
    const { made, calls } = host({
      writeReport: async () => Promise.reject(new Error("disque plein")),
    });
    await expect(conduct(made, clock)).rejects.toThrow("disque plein");
    expect(calls).toEqual(["quitte"]);
  });

  it("les scénarios sont joués dans l'ordre", async () => {
    const order: string[] = [];
    const scenario = (name: string): Scenario => ({ name, run: async () => void order.push(name) });
    const { made } = host({ prepare: async () => [scenario("a"), scenario("b")] });
    await conduct(made, clock);
    expect(order).toEqual(["a", "b"]);
  });
});
