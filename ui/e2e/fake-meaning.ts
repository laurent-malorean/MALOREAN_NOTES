// Recherche par le sens simulée pour les parcours : deux modèles (« E5 petit » et « E5 grand »), un
// téléchargement et un calcul que le parcours termine à la main (avec leurs événements), et un « sens »
// fixe : des groupes de mots qui se ressemblent. Les vraies règles (modèles, vecteurs, classement)
// sont testées côté Rust. `meaning=ready` dans l'adresse : le modèle par défaut est déjà là et calculé.
import { emit } from "@tauri-apps/api/event";
import type { NoteListItem, SearchResultItem } from "../src/bridge";

type Handler = (args: Record<string, string>) => unknown;

const SIZES: Record<string, number> = { "e5-small": 470_637_416, "e5-large": 2_240_000_000 };
const LABELS: Record<string, string> = { "e5-small": "E5 petit", "e5-large": "E5 grand" };

/** Des mots de même sens, pour que « dessert » trouve une tarte et un gâteau. */
const GROUPS = [
  ["dessert", "gateau", "tarte", "sucre", "pommes"],
  ["pain", "lait", "courses", "acheter"],
];

/** La partie de la doublure qui tient la recherche par le sens. */
export interface FakeMeaning {
  meaning: {
    chosen: string;
    downloaded: Record<string, boolean>;
    /** Le modèle en cours de téléchargement, ou `null`. */
    downloading: string | null;
    /** Les segments qui ont leur vecteur. */
    vectors: number;
    computing: boolean;
    /** Chaque reconstruction de l'index de sens demandée. */
    rebuilds: number;
    /** Termine le téléchargement en cours : le modèle est là, le calcul commence. */
    finishDownload: () => Promise<void>;
    /** Termine le calcul en cours : tous les segments ont leur vecteur. */
    finishComputing: () => Promise<void>;
  };
}

/** Ce que la doublure prête à cette partie : les notes. */
export interface MeaningHelpers {
  notes(): Record<string, { content: string; modified: number }>;
  listItem(entry: [string, { content: string; modified: number }]): NoteListItem;
  folded(text: string): string;
  folderOf(path: string): string;
}

export function fakeMeaningState(params: URLSearchParams): FakeMeaning {
  const ready = params.get("meaning") === "ready";
  return {
    meaning: {
      chosen: "e5-small",
      downloaded: { "e5-small": ready, "e5-large": false },
      downloading: null,
      vectors: ready ? Number.MAX_SAFE_INTEGER : 0,
      computing: false,
      rebuilds: 0,
      finishDownload: async () => {},
      finishComputing: async () => {},
    },
  };
}

/** Les mots de même sens que ceux de `words` (eux compris). */
const expanded = (words: string[]) =>
  new Set([...words, ...GROUPS.filter((g) => g.some((w) => words.includes(w))).flat()]);

type State = FakeMeaning["meaning"];

const segmentsOf = (helpers: MeaningHelpers) => Object.keys(helpers.notes()).length;
const doneOf = (state: State, helpers: MeaningHelpers) =>
  Math.min(state.vectors, segmentsOf(helpers));
const readyOf = (state: State, helpers: MeaningHelpers) =>
  state.downloaded[state.chosen] === true && doneOf(state, helpers) === segmentsOf(helpers);

const progress = (state: State, helpers: MeaningHelpers, count: number) =>
  emit("meaning-progress", {
    ...{ kind: "progress", done: count, total: segmentsOf(helpers), model: state.chosen },
  });

/** Le téléchargement et le calcul, que le parcours termine à la main. */
function controls(
  state: State,
  helpers: MeaningHelpers,
  end: { download: (f: string | null) => void },
) {
  state.finishDownload = async () => {
    const model = state.downloading as string;
    state.downloaded[model] = true;
    state.downloading = null;
    await emit("model-download", { kind: "finished", model });
    end.download(null);
    state.computing = true;
    state.vectors = 1;
    await progress(state, helpers, 1);
  };
  state.finishComputing = async () => {
    state.vectors = Number.MAX_SAFE_INTEGER;
    state.computing = false;
    await emit("meaning-progress", { kind: "finished", model: state.chosen });
  };
}

function resultOf(
  path: string,
  note: { content: string; modified: number },
  helpers: MeaningHelpers,
) {
  const segment = note.content.replace(/^# .*\n+/, "").trim();
  const result: SearchResultItem = {
    ...{ path, title: /^# (.+)$/m.exec(note.content)?.[1]?.trim() ?? "Sans titre" },
    ...{ folder: helpers.folderOf(path), contentType: "note", container: null },
    ...{ containerTitle: null, node: null, modified: note.modified },
    excerpt: [{ text: segment, matched: false }],
  };
  return result;
}

function searching(state: State, helpers: MeaningHelpers): Handler {
  return ({ query = "" }) => {
    const model = state.chosen;
    if (!state.downloaded[model]) {
      const message = `Le modèle « ${LABELS[model]} » n'est pas téléchargé : la recherche s'est faite par les mots seuls.`;
      return { results: [], meaning: { kind: "modelMissing", model, message } };
    }
    if (!readyOf(state, helpers)) {
      const message =
        "Le sens n'est pas encore calculé pour toutes les notes : les résultats sont incomplets.";
      return { results: [], meaning: { kind: "notComputed", model, message } };
    }
    const wanted = expanded(helpers.folded(query).split(/\s+/).filter(Boolean));
    const found = Object.entries(helpers.notes())
      .filter(([, note]) => [...wanted].some((w) => helpers.folded(note.content).includes(w)))
      .map(([path, note]) => resultOf(path, note, helpers));
    return { results: found, meaning: { kind: "used" } };
  };
}

function relating(state: State, helpers: MeaningHelpers): Handler {
  return ({ path = "" }) => {
    const note = helpers.notes()[path];
    if (note === undefined || !readyOf(state, helpers)) return [];
    const mine = expanded(GROUPS.flat().filter((w) => helpers.folded(note.content).includes(w)));
    return Object.entries(helpers.notes())
      .filter(([other]) => other !== path)
      .filter(([, other]) => [...mine].some((w) => helpers.folded(other.content).includes(w)))
      .map(helpers.listItem);
  };
}

const overviewOf = (state: State, helpers: MeaningHelpers) => ({
  chosen: state.chosen,
  models: Object.keys(SIZES).map((model) => ({
    ...{ model, label: LABELS[model], size: SIZES[model] },
    ...{ downloaded: state.downloaded[model] === true, downloading: state.downloading === model },
  })),
  segments: segmentsOf(helpers),
  withVector: doneOf(state, helpers),
  notes: segmentsOf(helpers),
  computing: state.computing,
});

export function fakeMeaning(fake: FakeMeaning, helpers: MeaningHelpers): Record<string, Handler> {
  const state = fake.meaning;
  const end: { download: (failure: string | null) => void } = { download: () => {} };
  controls(state, helpers, end);
  return {
    meaning_overview: () => overviewOf(state, helpers),
    choose_meaning_model: ({ model = "" }) => void (state.chosen = model),
    download_meaning_model: async ({ model = "" }) => {
      if (state.downloading !== null) throw { message: "Un téléchargement est déjà en cours." };
      state.downloading = model;
      const total = SIZES[model] ?? 0;
      await emit("model-download", { kind: "progress", model, done: Math.floor(total / 2), total });
      await new Promise<void>((resolve, reject) => {
        end.download = (failure) => (failure === null ? resolve() : reject({ message: failure }));
      });
      return null;
    },
    cancel_model_download: async () => {
      const model = state.downloading;
      state.downloading = null;
      if (model === null) return null;
      await emit("model-download", { kind: "failed", model, message: "Téléchargement annulé." });
      end.download("Téléchargement annulé.");
      return null;
    },
    remove_meaning_model: ({ model = "" }) => {
      state.downloaded[model] = false;
      state.vectors = 0;
      return null;
    },
    rebuild_meaning: async () => {
      state.rebuilds += 1;
      state.vectors = 0;
      state.computing = state.downloaded[state.chosen] === true;
      if (state.computing) await progress(state, helpers, 0);
      return null;
    },
    search_notes_by_meaning: searching(state, helpers),
    related_notes: relating(state, helpers),
  };
}
