import { describe, expect, it } from "vitest";
import { playAll, playScenario, type Scenario } from "./runner";

const WINDOW = { width: 1100, height: 720, engine: "test" };
const steady = () => {
  let t = 0;
  return { now: () => (t += 10) };
};

describe("essai : le jeu des scénarios", () => {
  it("un scénario dont toutes les vérifications sont bonnes est réussi, avec ses mesures et ses notes", async () => {
    const scenario: Scenario = {
      name: "bon",
      async run(trial) {
        trial.check("a", true, "bon");
        trial.measure("largeur", 12);
        trial.note("une note");
      },
    };
    expect(await playScenario(scenario, steady())).toEqual({
      name: "bon",
      status: "réussi",
      durationMs: 10,
      checks: [{ name: "a", ok: true, detail: "bon" }],
      measures: { largeur: 12 },
      notes: ["une note"],
      error: null,
      viewport: { start: { width: 0, height: 0 }, end: { width: 0, height: 0 } },
    });
  });

  it("une vérification ratée rend le scénario échoué sans l'arrêter", async () => {
    const scenario: Scenario = {
      name: "mauvais",
      async run(trial) {
        trial.check("a", false);
        trial.check("b", true);
      },
    };
    const report = await playScenario(scenario, steady());
    expect(report.status).toBe("échoué");
    expect(report.checks.map((c) => c.name)).toEqual(["a", "b"]);
    expect(report.checks[0]?.detail).toBe("");
    expect(report.error).toBeNull();
  });

  it("une erreur arrête le scénario : son message est dans le rapport, les vérifications faites aussi", async () => {
    const scenario: Scenario = {
      name: "casse",
      async run(trial) {
        trial.check("avant", true);
        throw new Error("la carte n'existe pas");
      },
    };
    const report = await playScenario(scenario, steady());
    expect(report.status).toBe("échoué");
    expect(report.error).toBe("la carte n'existe pas");
    expect(report.checks).toHaveLength(1);
  });

  it("ce qui est lancé sans être une erreur est aussi rapporté", async () => {
    const scenario: Scenario = {
      name: "texte",
      async run() {
        throw "refusé";
      },
    };
    expect((await playScenario(scenario, steady())).error).toBe("refusé");
  });

  it("un scénario bloqué échoue au délai, en le disant", async () => {
    const scenario: Scenario = { name: "bloque", run: () => new Promise(() => undefined) };
    const report = await playScenario(scenario, steady(), 20);
    expect(report.status).toBe("échoué");
    expect(report.error).toBe("scénario bloqué : plus de 20 ms");
  });

  it("le rapport compte les réussis et les échoués, dans l'ordre, et répète ce qui n'est pas couvert", async () => {
    const good: Scenario = { name: "un", run: async (t) => t.check("x", true) };
    const bad: Scenario = { name: "deux", run: async (t) => t.check("x", false) };
    const report = await playAll([good, bad, good], WINDOW, steady());
    expect(report.version).toBe(1);
    expect([report.passed, report.failed]).toEqual([2, 1]);
    expect(report.scenarios.map((s) => s.name)).toEqual(["un", "deux", "un"]);
    expect(report.window).toBe(WINDOW);
    expect(report.durationMs).toBeGreaterThan(0);
    expect(report.notCovered.join(" ")).toContain("boîtes de dialogue natives");
  });

  it("la taille de la fenêtre est relevée au début et à la fin de chaque scénario", async () => {
    let width = 1000;
    const grows: Scenario = { name: "grandit", run: async () => void (width = 2000) };
    const report = await playScenario(grows, steady(), 1000, () => ({ width, height: 700 }));
    expect(report.viewport).toEqual({
      start: { width: 1000, height: 700 },
      end: { width: 2000, height: 700 },
    });
  });

  it("l'erreur d'une commande de Rust, rendue en objet, garde son message", async () => {
    const refused: Scenario = {
      name: "r",
      run: () => Promise.reject({ message: "écriture refusée" }),
    };
    expect((await playScenario(refused, steady())).error).toBe("écriture refusée");
    const odd: Scenario = { name: "o", run: () => Promise.reject({ code: 7 }) };
    expect((await playScenario(odd, steady())).error).toBe('{"code":7}');
  });

  it("sans scénario, le rapport est vide", async () => {
    const report = await playAll([], WINDOW, steady());
    expect([report.passed, report.failed, report.scenarios]).toEqual([0, 0, []]);
  });
});
