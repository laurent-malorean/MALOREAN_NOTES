// Poignée de hauteur de la liste des dossiers : la ligne entre l'arborescence des dossiers et le
// bloc « Récentes » et « Étiquettes » se tire à la souris (ou se règle au clavier) pour partager la
// hauteur ; un double-clic rend la hauteur par défaut. Chaque zone garde un minimum (celui du
// thème, appliqué par la mise en page) et la hauteur choisie est gardée d'un lancement à l'autre,
// comme la largeur des panneaux. Sans réglage, l'arborescence prend toute la place que le bloc du
// bas laisse.
import type { PreferenceStorage } from "../state/focus-preference";
import {
  forgetFoldersTreeHeight,
  loadFoldersTreeHeight,
  saveFoldersTreeHeight,
} from "../state/folders-tree-height";

/** Les morceaux de la liste des dossiers que la poignée mesure. */
export interface FoldersParts {
  readonly folders: HTMLElement;
  readonly foldersList: HTMLElement;
  readonly recentButton: HTMLElement;
  readonly tagsList: HTMLElement;
  readonly foldersFooter: HTMLElement;
}

/** Le pas des flèches du clavier, en pixels. */
const KEY_STEP = 16;
const SIZED = "tree-sized";
const HEIGHT = "--folders-tree-height";

/** La mise en page de l'arborescence : sa hauteur réglée, rendue, et les bornes entre lesquelles elle tient. */
function createSizing(parts: FoldersParts) {
  const { folders, foldersList: tree, recentButton: recent, tagsList: tags } = parts;
  const treeHeight = () => tree.getBoundingClientRect().height;
  const fix = (height: number) => {
    folders.style.setProperty(HEIGHT, `${height}px`);
    folders.classList.add(SIZED);
  };
  const release = () => {
    folders.style.removeProperty(HEIGHT);
    folders.classList.remove(SIZED);
  };
  const minOf = (element: HTMLElement) => Number.parseFloat(getComputedStyle(element).minHeight);

  /**
   * Les bornes de l'arborescence : son minimum, et le maximum qui laisse au bloc du bas son minimum.
   * Mesurées dans la mise en page réglée (là où chaque zone a son minimum) : sans réglage, on la
   * pose un instant à la hauteur d'aujourd'hui, ce qui ne déplace rien.
   */
  const bounds = () => {
    const sized = folders.classList.contains(SIZED);
    if (!sized) fix(treeHeight());
    const now = treeHeight();
    const min = minOf(tree);
    const last = (tags.hidden ? recent : tags).getBoundingClientRect().bottom;
    const spare = parts.foldersFooter.getBoundingClientRect().top - last;
    const tagsSurplus = tags.hidden ? 0 : tags.getBoundingClientRect().height - minOf(tags);
    if (!sized) release();
    return { now, min, max: Math.max(min, now + spare + tagsSurplus) };
  };
  return { treeHeight, fix, release, bounds };
}

/** La poignée elle-même : une ligne focusable, posée sous l'arborescence. */
function createHandle(tree: HTMLElement): HTMLElement {
  const handle = document.createElement("div");
  handle.className = "folders-handle";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "Hauteur de l'arborescence des dossiers");
  handle.title = "Tirer pour changer la hauteur ; double-clic : hauteur par défaut";
  tree.after(handle);
  return handle;
}

/** Pose la poignée sous l'arborescence, à la hauteur gardée dans `storage`. */
export function connectFoldersHandle(parts: FoldersParts, storage: PreferenceStorage): void {
  const { folders } = parts;
  const { treeHeight, fix, release, bounds } = createSizing(parts);
  const handle = createHandle(parts.foldersList);

  /** Dit la hauteur, son minimum et son maximum aux lecteurs d'écran. */
  const describe = () => {
    const { now, min, max } = bounds();
    handle.setAttribute("aria-valuenow", String(Math.round(now)));
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
  };
  /** Donne à l'arborescence cette hauteur, ramenée entre ses bornes ; rend celle qu'elle prend. */
  const resize = (height: number) => {
    const { min, max } = bounds();
    const clamped = Math.min(max, Math.max(min, height));
    fix(clamped);
    describe();
    return clamped;
  };

  const stored = loadFoldersTreeHeight(storage);
  if (stored !== null) fix(stored);
  describe();
  handle.addEventListener("focus", describe);
  handle.addEventListener("pointerenter", describe);
  window.addEventListener("resize", describe);

  // La poignée suit le pointeur depuis là où on l'a prise : un simple clic ne change rien.
  handle.addEventListener("pointerdown", (start) => {
    start.preventDefault();
    folders.classList.add("resizing-height");
    const from = treeHeight();
    const follow = (y: number) => resize(from + y - start.clientY);
    const move = (event: PointerEvent) => void follow(event.clientY);
    const stop = (event: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      folders.classList.remove("resizing-height");
      if (event.clientY !== start.clientY) saveFoldersTreeHeight(storage, follow(event.clientY));
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
  });
  handle.addEventListener("dblclick", () => {
    release();
    forgetFoldersTreeHeight(storage);
    describe();
  });
  handle.addEventListener("keydown", (event) => {
    const { now, min, max } = bounds();
    const targets = new Map([
      ["ArrowUp", now - KEY_STEP],
      ["ArrowDown", now + KEY_STEP],
      ["Home", min],
      ["End", max],
    ]);
    const target = targets.get(event.key);
    if (target === undefined) return;
    event.preventDefault();
    saveFoldersTreeHeight(storage, resize(target));
  });
}
