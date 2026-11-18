// Étiquettes à l'écran : les pastilles d'une note dans la liste, la liste des étiquettes sous les
// dossiers, et la barre du filtre par étiquette au-dessus de la liste des notes.
import type { TagItem } from "../bridge";

/** Ce que l'utilisateur peut demander depuis une étiquette. */
export interface TagActions {
  /** Filtre la liste des notes par cette étiquette. */
  readonly selectTag: (tag: string) => void;
  /** Retire le filtre par étiquette. */
  readonly clearTag: () => void;
}

const MARK = "#";

const label = (tag: string) => `${MARK}${tag}`;

/** Les pastilles des étiquettes d'une note, ou rien si elle n'en a pas ; un clic en choisit une. */
export function tagChips(
  tags: readonly string[],
  select: (tag: string) => void,
): HTMLElement | null {
  if (tags.length === 0) return null;
  const chips = document.createElement("span");
  chips.className = "note-tags";
  chips.append(
    ...tags.map((tag) => {
      const chip = document.createElement("span");
      chip.className = "note-tag";
      chip.textContent = label(tag);
      chip.title = `Notes portant l'étiquette « ${tag} »`;
      // La pastille est dans le bouton de la note : le clic ne l'ouvre pas.
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        select(tag);
      });
      return chip;
    }),
  );
  return chips;
}

/** La liste des étiquettes, chacune avec son nombre de notes ; cachée s'il n'y en a aucune. */
export function renderTagsList(
  container: HTMLElement,
  tags: readonly TagItem[],
  active: string | null,
  select: (tag: string) => void,
): void {
  container.hidden = tags.length === 0;
  if (container.hidden) return container.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "tags-heading";
  heading.textContent = "Étiquettes";
  container.replaceChildren(
    heading,
    ...tags.map((tag) => {
      const item = document.createElement("button");
      item.className = "tag-item";
      item.classList.toggle("selected", tag.name === active);
      const name = document.createElement("span");
      name.className = "tag-name";
      name.textContent = label(tag.name);
      const count = document.createElement("span");
      count.className = "tag-count";
      count.textContent = String(tag.count);
      item.append(name, count);
      item.addEventListener("click", () => select(tag.name));
      return item;
    }),
  );
}

/** La barre du filtre : l'étiquette choisie et une croix qui retire le filtre ; cachée sans filtre. */
export function renderTagFilter(bar: HTMLElement, tag: string | null, clear: () => void): void {
  bar.hidden = tag === null;
  if (tag === null) return bar.replaceChildren();
  const name = document.createElement("span");
  name.className = "tag-filter-name";
  name.textContent = label(tag);
  const cross = document.createElement("button");
  cross.className = "tag-filter-clear";
  cross.textContent = "×";
  cross.title = "Retirer le filtre (Échap)";
  cross.setAttribute("aria-label", "Retirer le filtre");
  cross.addEventListener("click", clear);
  bar.replaceChildren(name, cross);
}
