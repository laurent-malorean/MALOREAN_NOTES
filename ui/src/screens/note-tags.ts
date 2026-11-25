// La barre des étiquettes d'une colonne : sous les onglets, le champ d'étiquettes du contenu montré
// (note, cahier de recherche, carte mentale, canvas, fiche du CRM). Rust lit et écrit ; la barre
// montre ce qu'il rend, et n'est redessinée que si les étiquettes ou les suggestions changent.
import { tagField } from "./tag-field";

/** Ce que la barre demande à l'application. */
export interface NoteTagsDeps {
  /** Les étiquettes du contenu `path`, lues dans son fichier. */
  readonly read: (path: string) => Promise<string[]>;
  /** Les étiquettes qui existent déjà dans l'espace de travail, proposées à la saisie. */
  readonly suggestions: () => Promise<string[]>;
  /** Donne ces étiquettes au contenu `path` ; rend celles qui sont écrites. */
  readonly change: (path: string, tags: readonly string[]) => Promise<string[]>;
  readonly error: (error: unknown) => void;
}

export interface NoteTags {
  /** Montre les étiquettes du contenu `path` et relit les suggestions ; la barre est cachée sans contenu. */
  show(path: string | null): Promise<void>;
  /** Relit les étiquettes du contenu montré, sans toucher aux suggestions ni à la saisie en cours. */
  refresh(path: string | null): Promise<void>;
  destroy(): void;
}

/** Le nom `data-field` du champ de saisie de la barre. */
const FIELD_KEY = "tag";

class TagBar implements NoteTags {
  private path: string | null = null;
  private tags: readonly string[] = [];
  private suggestions: readonly string[] = [];
  private draft = "";
  /** La dernière lecture demandée : une réponse arrivée après une plus récente est ignorée. */
  private generation = 0;

  constructor(
    private readonly bar: HTMLElement,
    private readonly deps: NoteTagsDeps,
  ) {}

  async show(path: string | null): Promise<void> {
    if (path !== this.path) this.draft = "";
    this.path = path;
    const generation = (this.generation += 1);
    if (path === null) return this.hide();
    try {
      const [tags, suggestions] = await Promise.all([
        this.deps.read(path),
        this.deps.suggestions(),
      ]);
      if (generation === this.generation) this.render(tags, suggestions);
    } catch {
      // Un fichier qui n'existe plus ou qu'on ne lit pas n'a pas d'étiquettes à montrer.
      if (generation === this.generation) this.hide();
    }
  }

  async refresh(path: string | null): Promise<void> {
    if (path === null || path !== this.path) return this.show(path);
    const generation = (this.generation += 1);
    try {
      const tags = await this.deps.read(path);
      if (generation === this.generation) this.render(tags, this.suggestions);
    } catch {
      if (generation === this.generation) this.hide();
    }
  }

  destroy(): void {
    this.generation += 1;
    this.bar.replaceChildren();
  }

  private hide(): void {
    this.tags = [];
    this.bar.hidden = true;
    this.bar.replaceChildren();
  }

  private render(tags: readonly string[], suggestions: readonly string[]): void {
    const same =
      !this.bar.hidden &&
      tags.join("\n") === this.tags.join("\n") &&
      suggestions.join("\n") === this.suggestions.join("\n");
    this.tags = tags;
    this.suggestions = suggestions;
    this.bar.hidden = false;
    if (same) return;
    const typing = this.bar.contains(document.activeElement);
    this.bar.replaceChildren(
      tagField({
        tags,
        suggestions,
        change: (next) => void this.change(next),
        draft: { get: () => this.draft, set: (text) => void (this.draft = text) },
        key: FIELD_KEY,
      }),
    );
    if (typing) this.bar.querySelector<HTMLInputElement>(`[data-field="${FIELD_KEY}"]`)?.focus();
  }

  /** Un geste du champ : Rust écrit, puis la barre montre les étiquettes écrites et les suggestions à jour. */
  private async change(tags: string[]): Promise<void> {
    const { path } = this;
    if (path === null) return;
    try {
      const written = await this.deps.change(path, tags);
      if (this.path !== path) return;
      const suggestions = await this.deps.suggestions();
      if (this.path === path) this.render(written, suggestions);
    } catch (error) {
      this.deps.error(error);
    }
  }
}

/** La barre d'étiquettes d'une colonne, dans son élément. */
export function createNoteTags(bar: HTMLElement, deps: NoteTagsDeps): NoteTags {
  return new TagBar(bar, deps);
}
