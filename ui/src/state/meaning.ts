// Recherche par le sens : l'état que l'interface en tient (aperçu, téléchargement, calcul), et ce
// qu'elle en montre (colonne « idées » de la fenêtre de recherche, réglages), sans écran.
import type {
  MeaningOverviewItem,
  MeaningProgressItem,
  MeaningUseItem,
  ModelDownloadItem,
} from "../bridge";

/** Le téléchargement d'un modèle en cours (`total` 0 tant qu'on ne le sait pas). */
export interface Download {
  readonly model: string;
  readonly done: number;
  readonly total: number;
}

/** Le calcul des vecteurs de sens en cours, en arrière-plan. */
export interface Compute {
  readonly done: number;
  readonly total: number;
}

/** Ce que l'interface sait du sens : le dernier aperçu de Rust, et ce que les événements ont dit depuis. */
export interface MeaningState {
  readonly overview: MeaningOverviewItem | null;
  /** Le téléchargement en cours, s'il y en a un. */
  readonly download: Download | null;
  /** Le calcul en cours, s'il y en a un. */
  readonly compute: Compute | null;
}

export const meaningStarted: MeaningState = {
  overview: null,
  download: null,
  compute: null,
};

/** Un aperçu lu ; un calcul qu'il dit en cours, et que les événements n'ont pas annoncé, est repris. */
export function overviewRead(state: MeaningState, overview: MeaningOverviewItem): MeaningState {
  const resumed =
    overview.computing && state.compute === null
      ? { done: overview.withVector, total: overview.segments }
      : state.compute;
  return { ...state, overview, compute: resumed };
}

/** Le téléchargement de `model` vient d'être demandé. */
export function downloadStarted(state: MeaningState, model: string): MeaningState {
  return { ...state, download: { model, done: 0, total: 0 } };
}

/** Le téléchargement est fini, quelle qu'en soit la fin : la commande qui l'attendait a rendu la main. */
export function downloadEnded(state: MeaningState): MeaningState {
  return { ...state, download: null };
}

/** Un événement du téléchargement : en cours, ou fini (réussi, échoué ou annulé). */
export function downloadHeard(state: MeaningState, item: ModelDownloadItem): MeaningState {
  const download =
    item.kind === "progress" ? { model: item.model, done: item.done, total: item.total } : null;
  return { ...state, download };
}

/** Un événement du calcul : en cours, ou fini (réussi ou échoué). */
export function computeHeard(state: MeaningState, item: MeaningProgressItem): MeaningState {
  const compute = item.kind === "progress" ? { done: item.done, total: item.total } : null;
  return { ...state, compute };
}

const MEBIBYTE = 1024 * 1024;
const number = new Intl.NumberFormat("fr-FR");

/** Un poids en octets, en mégaoctets : « 449 Mo ». */
export function megabytes(bytes: number): string {
  return `${number.format(Math.round(bytes / MEBIBYTE))} Mo`;
}

/** Le pourcentage fait, de 0 à 100 ; 0 tant que le total n'est pas connu. */
export function percent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((done * 100) / total)) : 0;
}

/** Un téléchargement en cours, comme la barre de progression le dit : « 120 Mo sur 449 Mo (27 %) ». */
export interface Progress {
  readonly text: string;
  readonly percent: number;
}

/** Le téléchargement en cours de ce modèle, s'il y en a un. */
function runningDownload(state: MeaningState, model: string) {
  return state.download?.model === model ? state.download : null;
}

function downloadProgress(download: Download): Progress {
  const done = percent(download.done, download.total);
  return {
    text: `${megabytes(download.done)} sur ${megabytes(download.total)} (${done} %)`,
    percent: done,
  };
}

/** « Calcul du sens : 120 / 411 segments ». */
export function computeLabel(compute: Compute): string {
  return `Calcul du sens : ${number.format(compute.done)} / ${number.format(compute.total)} segments`;
}

/** Le message à écrire en tête de la colonne « idées » quand le sens manque ; rien s'il a servi. */
export function meaningNotice(use: MeaningUseItem | undefined): string | null {
  return use === undefined || use.kind === "used" ? null : use.message;
}

/** Le sens manque parce que le modèle n'est pas téléchargé : la colonne renvoie aux réglages. */
export function modelMissing(use: MeaningUseItem | undefined): boolean {
  return use?.kind === "modelMissing";
}

/** Où en est le calcul du sens, dit dans la colonne « idées » ; rien s'il n'y en a pas en cours. */
export function computeNote(state: MeaningState): string | null {
  return state.compute === null ? null : computeLabel(state.compute);
}

/** Un modèle, tel que les réglages le montrent. */
export interface ModelRow {
  readonly model: string;
  readonly label: string;
  readonly weight: string;
  /** « téléchargé » ou « non téléchargé ». */
  readonly status: string;
  readonly downloaded: boolean;
  /** C'est le modèle choisi. */
  readonly used: boolean;
  /** Son téléchargement est en cours (barre de progression si on la connaît). */
  readonly downloading: boolean;
  readonly progress: Progress | null;
}

/** Les modèles des réglages, dans l'ordre de Rust. */
export function modelRows(state: MeaningState): ModelRow[] {
  const overview = state.overview;
  if (overview === null) return [];
  return overview.models.map((item) => {
    const download = runningDownload(state, item.model);
    return {
      model: item.model,
      label: item.label,
      weight: megabytes(item.size),
      status: item.downloaded ? "téléchargé" : "non téléchargé",
      downloaded: item.downloaded,
      used: item.model === overview.chosen,
      downloading: item.downloading || download !== null,
      progress: download && downloadProgress(download),
    };
  });
}

/** Le modèle choisi, s'il y a un aperçu. */
function chosenModel(state: MeaningState) {
  const overview = state.overview;
  return overview?.models.find((model) => model.model === overview.chosen) ?? null;
}

/** L'avancement de l'index de sens, en pourcentage : le calcul en cours, sinon les segments qui ont leur vecteur ; rien sans aperçu. */
export function indexPercent(state: MeaningState): number | null {
  const overview = state.overview;
  if (overview === null) return null;
  const { done, total } = state.compute ?? { done: overview.withVector, total: overview.segments };
  return percent(done, total);
}

/** L'état de l'index de sens, ligne à ligne ; rien sans aperçu. */
export function indexLines(state: MeaningState): string[] {
  const overview = state.overview;
  if (overview === null) return [];
  const withoutText =
    overview.notesWithoutText > 0
      ? ` (${number.format(overview.notesWithoutText)} sans texte)`
      : "";
  const lines = [
    `Notes : ${number.format(overview.notes)}${withoutText}`,
    `Segments : ${number.format(overview.segments)}`,
    `Segments calculés : ${number.format(overview.withVector)} sur ${number.format(overview.segments)}`,
  ];
  const chosen = chosenModel(state);
  if (chosen !== null && !chosen.downloaded && state.download?.model !== chosen.model) {
    lines.push(
      `Le calcul du sens est en attente : le modèle « ${chosen.label} » n'est pas téléchargé. Cliquez sur « Télécharger » ci-dessus.`,
    );
  }
  return state.compute === null ? lines : [...lines, computeLabel(state.compute)];
}
