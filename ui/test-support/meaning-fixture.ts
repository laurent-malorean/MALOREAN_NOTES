// Le sens simulé pour les tests des modules de l'assemblage : l'aperçu de Rust, un téléchargement qu'on
// termine à la main, les événements envoyés à la demande, et les éléments de l'écran qu'il dessine.
import type {
  MeaningOverviewItem,
  MeaningProgressItem,
  MeaningSearchItem,
  ModelDownloadItem,
  NoteListItem,
} from "../src/bridge";
import type { MeaningDeps } from "../src/app/meaning";

export const SMALL_BYTES = 470_637_416;

/** L'aperçu de départ : « E5 petit » choisi mais pas téléchargé, « E5 grand » non plus. */
export function overviewOf(patch: Partial<MeaningOverviewItem> = {}): MeaningOverviewItem {
  return {
    chosen: "e5-small",
    models: [
      {
        ...{ model: "e5-small", label: "E5 petit", size: SMALL_BYTES },
        ...{ downloaded: false, downloading: false },
      },
      {
        ...{ model: "e5-large", label: "E5 grand", size: 2_240_000_000 },
        ...{ downloaded: false, downloading: false },
      },
    ],
    segments: 411,
    withVector: 0,
    notes: 12,
    computing: false,
    ...patch,
  };
}

/** Les modèles de `overview` téléchargés (ou non), par nom. */
export function withDownloaded(
  overview: MeaningOverviewItem,
  downloaded: Readonly<Record<string, boolean>>,
): MeaningOverviewItem {
  return {
    ...overview,
    models: overview.models.map((m) => ({ ...m, downloaded: downloaded[m.model] ?? m.downloaded })),
  };
}

/** Ce que le sens simulé garde entre deux appels. */
interface Context {
  readonly calls: string[];
  readonly related: Record<string, NoteListItem[]>;
  readonly downloadHandlers: ((item: ModelDownloadItem) => void)[];
  readonly progressHandlers: ((item: MeaningProgressItem) => void)[];
  overview: MeaningOverviewItem;
  searched: MeaningSearchItem;
  endDownload: (failure: string | null) => void;
}

type Backend = MeaningDeps["backend"] & {
  searchNotesByMeaning: (query: string) => Promise<MeaningSearchItem>;
};

/** Les modèles : choisir, télécharger, annuler, supprimer. */
function modelsBackend(
  c: Context,
): Pick<
  Backend,
  | "meaningOverview"
  | "chooseMeaningModel"
  | "downloadMeaningModel"
  | "cancelModelDownload"
  | "removeMeaningModel"
> {
  return {
    meaningOverview: async () => (c.calls.push("aperçu"), c.overview),
    chooseMeaningModel: async (model) => {
      c.calls.push(`choisir ${model}`);
      c.overview = { ...c.overview, chosen: model };
      return null;
    },
    downloadMeaningModel: (model) => {
      c.calls.push(`télécharger ${model}`);
      return new Promise((resolve, reject) => {
        c.endDownload = (failure) => {
          if (failure !== null) return reject(new Error(failure));
          c.overview = withDownloaded(c.overview, { [model]: true });
          resolve(null);
        };
      });
    },
    cancelModelDownload: async () => {
      c.calls.push("annuler");
      c.endDownload("Téléchargement annulé.");
      return null;
    },
    removeMeaningModel: async (model) => {
      c.calls.push(`supprimer ${model}`);
      c.overview = withDownloaded(c.overview, { [model]: false });
      return null;
    },
  };
}

/** L'index de sens, les recherches et les événements. */
function indexBackend(c: Context): Omit<Backend, keyof ReturnType<typeof modelsBackend>> {
  return {
    rebuildMeaning: async () => (c.calls.push("reconstruire"), null),
    searchNotesByMeaning: async (query) => {
      c.calls.push(`chercher par le sens ${query}`);
      return c.searched;
    },
    relatedNotes: async (path) => {
      c.calls.push(`proches ${path}`);
      return c.related[path] ?? [];
    },
    onMeaningProgress: async (handler) => (c.progressHandlers.push(handler), () => {}),
    onModelDownload: async (handler) => (c.downloadHandlers.push(handler), () => {}),
  };
}

/** Le sens simulé : chaque appel noté dans `calls`, un téléchargement terminé par `endDownload`. */
export function fakeMeaning(start: MeaningOverviewItem = overviewOf()) {
  const c: Context = {
    ...{ calls: [], related: {}, downloadHandlers: [], progressHandlers: [] },
    ...{ overview: start, searched: { results: [], meaning: { kind: "used" } } },
    endDownload: () => {},
  };
  return {
    backend: { ...modelsBackend(c), ...indexBackend(c) },
    calls: c.calls,
    related: c.related,
    /** Ce que Rust dit de la prochaine recherche par le sens. */
    answerWith: (found: MeaningSearchItem) => void (c.searched = found),
    /** Change l'aperçu que Rust rendra. */
    setOverview: (next: MeaningOverviewItem) => void (c.overview = next),
    /** Termine le téléchargement en cours : réussi (`null`) ou échoué avec ce message. */
    endDownload: (failure: string | null = null) => c.endDownload(failure),
    /** Envoie un événement du téléchargement. */
    downloading: (item: ModelDownloadItem) => c.downloadHandlers.forEach((h) => h(item)),
    /** Envoie un événement du calcul. */
    computing: (item: MeaningProgressItem) => c.progressHandlers.forEach((h) => h(item)),
  };
}

/** Les éléments de la fenêtre que le sens dessine, dans le document. */
export function meaningLayout() {
  const ideasCompute = document.createElement("p");
  const confirmation = document.createElement("dialog");
  document.body.replaceChildren(ideasCompute, confirmation);
  return { ideasCompute, confirmation };
}
