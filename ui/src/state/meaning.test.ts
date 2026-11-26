import { describe, expect, it } from "vitest";
import type { MeaningOverviewItem } from "../bridge";
import {
  computeHeard,
  computeLabel,
  computeNote,
  downloadEnded,
  downloadHeard,
  downloadStarted,
  indexLines,
  indexPercent,
  type MeaningState,
  meaningNotice,
  modelMissing,
  meaningStarted,
  megabytes,
  modelRows,
  overviewRead,
  percent,
} from "./meaning";

const SMALL = 470_637_416;
const LARGE = 2_240_000_000;

function overview(
  patch: Partial<MeaningOverviewItem> & { smallDownloaded?: boolean; largeDownloaded?: boolean },
): MeaningOverviewItem {
  const { smallDownloaded = true, largeDownloaded = false, ...rest } = patch;
  return {
    chosen: "e5-small",
    models: [
      {
        ...{ model: "e5-small", label: "E5 petit", size: SMALL },
        ...{ downloaded: smallDownloaded, downloading: false },
      },
      {
        ...{ model: "e5-large", label: "E5 grand", size: LARGE },
        ...{ downloaded: largeDownloaded, downloading: false },
      },
    ],
    segments: 411,
    withVector: 120,
    notes: 12,
    notesWithoutText: 0,
    computing: false,
    ...rest,
  };
}

const read = (patch: Parameters<typeof overview>[0] = {}): MeaningState =>
  overviewRead(meaningStarted, overview(patch));

describe("poids et pourcentage", () => {
  it("écrit un poids en mégaoctets", () => {
    expect(megabytes(SMALL)).toBe("449 Mo");
    expect(megabytes(0)).toBe("0 Mo");
    expect(megabytes(1_048_576)).toBe("1 Mo");
  });

  it("calcule le pourcentage fait, jamais au-delà de 100", () => {
    expect(percent(0, 200)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(199, 200)).toBe(99);
    expect(percent(200, 200)).toBe(100);
    expect(percent(300, 200)).toBe(100);
  });

  it("vaut 0 tant que le total n'est pas connu", () => {
    expect(percent(50, 0)).toBe(0);
  });
});

describe("état du sens", () => {
  it("commence sans téléchargement ni calcul", () => {
    expect(meaningStarted).toEqual({ overview: null, download: null, compute: null });
  });

  it("reprend un calcul que l'aperçu dit en cours, sans écraser celui qu'on suit", () => {
    expect(read({ computing: true }).compute).toEqual({ done: 120, total: 411 });
    expect(read({ computing: false }).compute).toBeNull();
    const following = computeHeard(meaningStarted, {
      ...{ kind: "progress", done: 5, total: 9, model: "e5-small" },
    });
    expect(overviewRead(following, overview({ computing: true })).compute).toEqual({
      ...{ done: 5, total: 9 },
    });
  });

  it("suit le téléchargement : demandé, en cours, puis fini", () => {
    const asked = downloadStarted(read(), "e5-small");
    expect(asked.download).toEqual({ model: "e5-small", done: 0, total: 0 });
    const running = downloadHeard(asked, {
      kind: "progress",
      model: "e5-small",
      done: 10,
      total: 40,
    });
    expect(running.download).toEqual({ model: "e5-small", done: 10, total: 40 });
    expect(downloadHeard(running, { kind: "finished", model: "e5-small" }).download).toBeNull();
    expect(
      downloadHeard(running, { kind: "failed", model: "e5-small", message: "annulé" }).download,
    ).toBeNull();
    expect(downloadEnded(running).download).toBeNull();
    expect(downloadEnded(running).overview).toBe(running.overview);
  });

  it("suit le calcul : en cours, puis fini ou échoué", () => {
    const running = computeHeard(meaningStarted, {
      ...{ kind: "progress", done: 3, total: 8, model: "e5-small" },
    });
    expect(running.compute).toEqual({ done: 3, total: 8 });
    expect(computeHeard(running, { kind: "finished", model: "e5-small" }).compute).toBeNull();
    expect(computeHeard(running, { kind: "failed", message: "x" }).compute).toBeNull();
  });

  it("garde l'aperçu quand un événement arrive", () => {
    const state = read();
    expect(computeHeard(state, { kind: "finished", model: "e5-small" }).overview).toBe(
      state.overview,
    );
    expect(downloadHeard(state, { kind: "finished", model: "e5-small" }).overview).toBe(
      state.overview,
    );
  });
});

describe("calcul du sens", () => {
  it("écrit le calcul du sens", () => {
    expect(computeLabel({ done: 0, total: 5 })).toBe("Calcul du sens : 0 / 5 segments");
  });

  it("le dit dans la colonne « idées » seulement quand un calcul est en cours", () => {
    const state = computeHeard(read(), {
      ...{ kind: "progress", done: 120, total: 411, model: "e5-small" },
    });
    expect(computeNote(state)).toBe("Calcul du sens : 120 / 411 segments");
    expect(computeNote(read())).toBeNull();
    expect(computeNote(meaningStarted)).toBeNull();
  });
});

describe("message en tête de la colonne « idées »", () => {
  it("n'en dit rien quand le sens a servi, ou n'a pas été demandé", () => {
    expect(meaningNotice({ kind: "used" })).toBeNull();
    expect(meaningNotice(undefined)).toBeNull();
  });

  it("dit ce que Rust dit quand le sens manque", () => {
    expect(
      meaningNotice({ kind: "modelMissing", model: "e5-small", message: "pas de modèle" }),
    ).toBe("pas de modèle");
    expect(meaningNotice({ kind: "notComputed", model: "e5-small", message: "pas fini" })).toBe(
      "pas fini",
    );
    expect(meaningNotice({ kind: "failed", message: "raté" })).toBe("raté");
  });

  it("renvoie aux réglages seulement quand le modèle n'est pas téléchargé", () => {
    expect(
      modelMissing({ kind: "modelMissing", model: "e5-small", message: "pas de modèle" }),
    ).toBe(true);
    expect(modelMissing({ kind: "notComputed", model: "e5-small", message: "pas fini" })).toBe(
      false,
    );
    expect(modelMissing({ kind: "used" })).toBe(false);
    expect(modelMissing(undefined)).toBe(false);
  });
});

describe("réglages du sens", () => {
  it("ne montre aucun modèle sans aperçu", () => {
    expect(modelRows(meaningStarted)).toEqual([]);
    expect(indexLines(meaningStarted)).toEqual([]);
  });

  it("décrit chaque modèle : poids, état, et celui qui est utilisé", () => {
    expect(modelRows(read())).toEqual([
      {
        ...{ model: "e5-small", label: "E5 petit", weight: "449 Mo" },
        ...{ status: "téléchargé", downloaded: true, used: true },
        downloading: false,
        progress: null,
      },
      {
        ...{ model: "e5-large", label: "E5 grand", weight: "2 136 Mo" },
        ...{ status: "non téléchargé", downloaded: false, used: false },
        downloading: false,
        progress: null,
      },
    ]);
  });

  it("marque le modèle choisi parmi les autres", () => {
    expect(modelRows(read({ chosen: "e5-large" })).map((row) => row.used)).toEqual([false, true]);
  });

  it("montre le téléchargement en cours sur son modèle seulement", () => {
    const state = downloadHeard(read(), {
      ...{ kind: "progress", model: "e5-large", done: 1_120_000_000, total: LARGE },
    });
    const [small, large] = modelRows(state);
    expect(small).toMatchObject({ downloading: false, progress: null });
    expect(large).toMatchObject({
      downloading: true,
      progress: { text: "1 068 Mo sur 2 136 Mo (50 %)", percent: 50 },
    });
  });

  it("sait qu'un modèle se télécharge quand Rust le dit, sans barre", () => {
    const base = overview({});
    const state = overviewRead(meaningStarted, {
      ...base,
      models: base.models.map((m) => ({ ...m, downloading: m.model === "e5-large" })),
    });
    expect(modelRows(state).map((row) => [row.downloading, row.progress])).toEqual([
      [false, null],
      [true, null],
    ]);
  });

  it("dit l'état de l'index de sens", () => {
    expect(indexLines(read())).toEqual([
      "Notes : 12",
      "Segments : 411",
      "Segments calculés : 120 sur 411",
    ]);
  });

  it("dit combien de notes n'ont pas de texte, seulement quand il y en a", () => {
    expect(indexLines(read({ notes: 56, notesWithoutText: 2 }))[0]).toBe(
      "Notes : 56 (2 sans texte)",
    );
    expect(indexLines(read({ notes: 56, notesWithoutText: 1 }))[0]).toBe(
      "Notes : 56 (1 sans texte)",
    );
    expect(indexLines(read({ notes: 1_200, notesWithoutText: 1_000 }))[0]).toBe(
      "Notes : 1\u202f200 (1\u202f000 sans texte)",
    );
    expect(indexLines(read({ notes: 56, notesWithoutText: 0 }))[0]).toBe("Notes : 56");
  });

  it("chiffre l'avancement de l'index de sens en pourcentage, le calcul en cours d'abord", () => {
    expect(indexPercent(meaningStarted)).toBeNull();
    expect(indexPercent(read())).toBe(29);
    expect(indexPercent(read({ withVector: 411 }))).toBe(100);
    expect(indexPercent(read({ segments: 0, withVector: 0 }))).toBe(0);
    const computing = computeHeard(read(), {
      ...{ kind: "progress", done: 205, total: 411, model: "e5-small" },
    });
    expect(indexPercent(computing)).toBe(49);
  });

  it("dit que le calcul attend quand le modèle utilisé n'est pas téléchargé", () => {
    const state = read({ smallDownloaded: false });
    expect(indexLines(state).at(-1)).toBe(
      "Le calcul du sens est en attente : le modèle « E5 petit » n'est pas téléchargé. Cliquez sur « Télécharger » ci-dessus.",
    );
    expect(indexLines(read({ chosen: "e5-large", smallDownloaded: false })).at(-1)).toContain(
      "« E5 grand »",
    );
    expect(indexLines(read())).toHaveLength(3);
  });

  it("ne dit pas que le calcul attend pendant le téléchargement du modèle", () => {
    const state = downloadStarted(read({ smallDownloaded: false }), "e5-small");
    expect(indexLines(state)).toHaveLength(3);
  });

  it("ajoute l'avancement du calcul en cours", () => {
    const state = computeHeard(read(), {
      ...{ kind: "progress", done: 200, total: 411, model: "e5-small" },
    });
    expect(indexLines(state).at(-1)).toBe("Calcul du sens : 200 / 411 segments");
    expect(indexLines(state)).toHaveLength(4);
  });
});
