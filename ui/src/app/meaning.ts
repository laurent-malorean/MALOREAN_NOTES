// Recherche par le sens, côté application : ce que l'interface sait des modèles et du calcul (aperçu
// de Rust et événements), le calcul dit dans la colonne « idées », les réglages du sens et les notes proches.
import type * as Bridge from "../bridge";
import { askModelRemoval } from "../screens/confirmation";
import type { Layout } from "../screens/layout";
import { meaningSettingsFrame, renderMeaningSettings } from "../screens/meaning-settings";
import type { RelatedNotes } from "../screens/note-pane";
import {
  computeHeard,
  computeNote,
  downloadEnded,
  downloadHeard,
  downloadStarted,
  indexLines,
  type MeaningState,
  meaningStarted,
  modelRows,
  overviewRead,
} from "../state/meaning";
import type { OpenColumns } from "./columns";
import type { Messages } from "./messages";

export interface MeaningDeps extends Pick<Messages, "show" | "run"> {
  readonly backend: Pick<
    typeof Bridge,
    | "meaningOverview"
    | "chooseMeaningModel"
    | "downloadMeaningModel"
    | "cancelModelDownload"
    | "removeMeaningModel"
    | "rebuildMeaning"
    | "relatedNotes"
    | "onMeaningProgress"
    | "onModelDownload"
  >;
  readonly layout: Pick<Layout, "ideasCompute" | "confirmation">;
  readonly columns: Pick<OpenColumns, "panes">;
  /** Relance la recherche en cours : ce que le sens sait a changé. */
  readonly searchAgain: () => void;
}

export interface Meaning extends RelatedNotes {
  /** Affiche ou masque les notes proches, sous le texte de chaque colonne. */
  toggleRelated(): void;
  /** La partie « Recherche par le sens » de l'écran des réglages, redessinée à chaque changement. */
  settingsGroups(): HTMLElement[];
  /** Lit l'aperçu du sens, et écoute le calcul des vecteurs et les téléchargements. */
  start(): void;
}

/** Le sens vu par l'application : son état, ce qui le montre, et ce qui l'actionne. */
class MeaningApp implements Meaning {
  private state: MeaningState = meaningStarted;
  private relatedShown = false;
  private readonly frames = new Set<HTMLElement>();

  constructor(private readonly deps: MeaningDeps) {}

  enabled = () => this.relatedShown;

  notes = (path: string) => this.deps.backend.relatedNotes(path);

  toggleRelated = () => {
    this.relatedShown = !this.relatedShown;
    this.showRelated();
  };

  settingsGroups = () => {
    const frame = meaningSettingsFrame();
    // Dessinée tout de suite : la fenêtre des réglages ne l'accroche à l'écran qu'au retour d'ici.
    this.drawSettings(frame);
    this.frames.add(frame);
    this.deps.run(this.refresh());
    return [frame];
  };

  start = () => {
    const { backend, run } = this.deps;
    run(this.refresh());
    run(backend.onModelDownload((item) => this.update((now) => downloadHeard(now, item))));
    run(
      backend.onMeaningProgress((item) => {
        this.update((now) => computeHeard(now, item));
        if (item.kind === "finished") this.computed();
        if (item.kind === "failed") this.failed(item.message);
      }),
    );
  };

  /** Les notes proches de chaque colonne, montrées ou cachées selon la demande. */
  private showRelated() {
    for (const pane of this.deps.columns.panes().values()) this.deps.run(pane.showRelated());
  }

  private update(next: (now: MeaningState) => MeaningState) {
    this.state = next(this.state);
    this.draw();
  }

  /** Le calcul est fini : l'aperçu, les résultats de la recherche et les notes proches ont changé. */
  private computed() {
    this.deps.run(this.refresh());
    this.deps.searchAgain();
    this.showRelated();
  }

  private failed(message: string) {
    this.deps.show(message, "error");
    this.deps.run(this.refresh());
  }

  private readonly refresh = async () => {
    const overview = await this.deps.backend.meaningOverview();
    this.update((now) => overviewRead(now, overview));
  };

  /** Redessine le calcul dit dans la colonne « idées », et les réglages ouverts. */
  private draw() {
    const note = computeNote(this.state);
    const { ideasCompute } = this.deps.layout;
    ideasCompute.textContent = note ?? "";
    ideasCompute.hidden = note === null;
    for (const frame of this.frames) {
      if (frame.isConnected) this.drawSettings(frame);
      else this.frames.delete(frame);
    }
  }

  private drawSettings(frame: HTMLElement) {
    const { run } = this.deps;
    const view = { rows: modelRows(this.state), lines: indexLines(this.state) };
    renderMeaningSettings(frame, view, {
      choose: (model) => run(this.choose(model)),
      download: (model) => run(this.download(model)),
      cancelDownload: this.cancel,
      remove: (model, label) => run(this.remove(model, label)),
      rebuild: () => run(this.rebuild()),
    });
  }

  private readonly cancel = () => this.deps.run(this.deps.backend.cancelModelDownload());

  private async download(model: string) {
    this.update((now) => downloadStarted(now, model));
    try {
      await this.deps.backend.downloadMeaningModel(model);
    } finally {
      this.update(downloadEnded);
      await this.refresh();
      this.deps.searchAgain();
    }
  }

  private async choose(model: string) {
    await this.deps.backend.chooseMeaningModel(model);
    await this.refresh();
    this.deps.searchAgain();
    this.showRelated();
  }

  private async remove(model: string, label: string) {
    if (!(await askModelRemoval(this.deps.layout.confirmation, label))) return;
    await this.deps.backend.removeMeaningModel(model);
    await this.refresh();
    this.deps.searchAgain();
  }

  private async rebuild() {
    await this.deps.backend.rebuildMeaning();
    this.deps.show("Index de sens à reconstruire : le calcul repart.", "info");
    await this.refresh();
  }
}

export function createMeaning(deps: MeaningDeps): Meaning {
  return new MeaningApp(deps);
}
