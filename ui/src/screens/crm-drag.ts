// Glisser à la souris dans le CRM (fiche 0060) : une carte d'une colonne à l'autre, d'un jour à
// l'autre, l'en-tête d'une étape. Le geste commence après 4 points de mouvement ; avant, c'est un
// clic. Fait aux événements du pointeur, comme la carte mentale : pareil dans les tests, dans la
// fenêtre de l'application et à la souris.

/** Le mouvement, en points, avant lequel un appui reste un clic. */
const THRESHOLD = 4;
/** À moins de ce nombre de points du bord du tableau, le glissé le fait défiler. */
const EDGE = 48;
/** De combien de points le tableau défile à chaque pas, et le délai entre deux pas (millisecondes). */
const SCROLL_STEP = 20;
const SCROLL_DELAY = 16;

export interface DragHandlers<T> {
  /** Le glissé commence : marque la source (« elle est en train d'être déplacée »). */
  readonly start: () => void;
  /** Le pointeur est en `x`, `y` : marque la cible et la rend, ou `null` si rien n'accepte le dépôt ici. */
  readonly over: (x: number, y: number) => T | null;
  /** Le pointeur est relâché sur la cible `target`. */
  readonly drop: (target: T) => void;
  /** Le glissé s'arrête, déposé ou abandonné : efface toutes les marques. */
  readonly end: () => void;
  /** Le tableau qui défile quand le pointeur reste contre son bord gauche ou droit : un jour ou une colonne hors de vue reste atteignable. */
  readonly scroller: HTMLElement;
}

/** Du côté où le pointeur touche le bord du tableau : -1 à gauche, 1 à droite, 0 ailleurs. */
function edgeSide(area: HTMLElement, x: number): -1 | 0 | 1 {
  const box = area.getBoundingClientRect();
  if (x < box.left + EDGE) return -1;
  return x > box.right - EDGE ? 1 : 0;
}

/** Une copie de la source qui suit le pointeur, insensible à lui. */
function ghostOf(source: HTMLElement, box: DOMRect): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add("crm-ghost");
  ghost.style.width = `${String(box.width)}px`;
  document.body.append(ghost);
  return ghost;
}

/** Un glissé qui s'achève n'est pas un clic : le prochain clic de la page, s'il vient, est avalé. */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => event.stopPropagation();
  document.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener("click", swallow, true), 0);
}

/** Le défilement du tableau tant que le pointeur reste contre son bord ; le dépôt visé est remarqué à chaque pas. */
function edgeScroller<T>(handlers: DragHandlers<T>) {
  let last = { x: 0, y: 0 };
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  return {
    stop,
    /** Le pointeur est en `x`, `y` : lance ou arrête le défilement selon qu'il touche le bord. */
    pointer(x: number, y: number) {
      last = { x, y };
      const side = edgeSide(handlers.scroller, x);
      if (side === 0) return stop();
      if (timer !== null) return;
      timer = setInterval(() => {
        handlers.scroller.scrollLeft += edgeSide(handlers.scroller, last.x) * SCROLL_STEP;
        handlers.over(last.x, last.y);
      }, SCROLL_DELAY);
    },
  };
}

/**
 * Suit le pointeur à partir de l'appui `event` sur `source`. Échap abandonne. Sans effet pour un
 * autre bouton que le premier.
 */
export function startDrag<T>(
  event: PointerEvent,
  source: HTMLElement,
  handlers: DragHandlers<T>,
): void {
  if (event.button !== 0) return;
  const origin = { x: event.clientX, y: event.clientY };
  const box = source.getBoundingClientRect();
  let ghost: HTMLElement | null = null;
  const scroller = edgeScroller(handlers);

  const stop = () => {
    scroller.stop();
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("keydown", key);
    ghost?.remove();
  };
  const follow = (e: PointerEvent, shown: HTMLElement) => {
    shown.style.left = `${String(box.left + e.clientX - origin.x)}px`;
    shown.style.top = `${String(box.top + e.clientY - origin.y)}px`;
  };
  function move(e: PointerEvent) {
    if (ghost === null) {
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < THRESHOLD) return;
      ghost = ghostOf(source, box);
      handlers.start();
    }
    follow(e, ghost);
    handlers.over(e.clientX, e.clientY);
    scroller.pointer(e.clientX, e.clientY);
  }
  function up(e: PointerEvent) {
    const dragging = ghost !== null;
    stop();
    if (!dragging) return;
    const target = handlers.over(e.clientX, e.clientY);
    handlers.end();
    swallowNextClick();
    if (target !== null) handlers.drop(target);
  }
  function cancel() {
    const dragging = ghost !== null;
    stop();
    if (!dragging) return;
    handlers.end();
    swallowNextClick();
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") cancel();
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("keydown", key);
}
