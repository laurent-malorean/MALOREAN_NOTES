// Carte mentale (fiche 0050, spécification § 8) : enregistrer la carte après chaque changement,
// en relisant d'abord le fichier : s'il a changé ailleurs, les changements faits depuis la dernière
// lecture sont refaits sur sa nouvelle version, ou abandonnés (la carte est alors rechargée).
import type { MindMapItem } from "../bridge";
import { type Op, redoAll } from "../state/mind-map-ops";

export interface SaverDeps {
  readonly save: (map: MindMapItem) => Promise<void>;
  readonly read: () => Promise<MindMapItem>;
  readonly error: (error: unknown) => void;
}

/** Ce que l'enregistreur demande à la carte montrée. */
export interface SaverHost {
  current(): MindMapItem;
  /** Les changements ont été refaits sur la version du fichier : voici la carte à montrer. */
  merged(map: MindMapItem): void;
  /** Un changement est abandonné : la carte du fichier remplace la carte montrée. */
  reloaded(disk: MindMapItem): void;
  /** Le fichier a changé ailleurs pendant un enregistrement : voici sa version. */
  refreshed(disk: MindMapItem): void;
}

export class MapSaver {
  /** La carte telle que le fichier l'avait à la dernière lecture ou au dernier enregistrement. */
  private base: MindMapItem = { roots: [], places: [] };
  /** Les changements faits depuis, qu'un fichier changé ailleurs oblige à refaire. */
  private pending: Op[] = [];
  private saving = false;
  private dirty = false;

  constructor(
    private readonly deps: SaverDeps,
    private readonly host: SaverHost,
  ) {}

  /** Un enregistrement est en cours ou attendu. */
  busy(): boolean {
    return this.saving || this.dirty;
  }

  /** Le fichier est lu tel quel : rien n'est plus à refaire. */
  reset(map: MindMapItem): void {
    this.base = map;
    this.pending = [];
  }

  record(op: Op): void {
    this.pending.push(op);
  }

  async persist(): Promise<void> {
    if (this.saving) {
      this.dirty = true;
      return;
    }
    this.saving = true;
    do {
      this.dirty = false;
      await this.saveOnce();
    } while (this.dirty);
    this.saving = false;
    // Ce qui est venu d'ailleurs pendant l'enregistrement : le fichier est relu.
    await this.deps.read().then((disk) => this.host.refreshed(disk), this.deps.error);
  }

  private async saveOnce(): Promise<void> {
    try {
      const disk = await this.deps.read().catch(() => this.base);
      if (JSON.stringify(disk) !== JSON.stringify(this.base)) {
        const merged = redoAll(disk, this.pending);
        if (merged === null) return this.host.reloaded(disk);
        this.host.merged(merged);
      }
      const saved = this.host.current();
      const done = this.pending.length;
      await this.deps.save(saved);
      this.base = saved;
      this.pending = this.pending.slice(done);
    } catch (error) {
      this.deps.error(error);
    }
  }
}
