// Un CRM monté dans une page de test (fiche 0060) : un faux Rust qui rend le CRM donné et note
// chaque appel, la mémoire de l'onglet, les erreurs, les questions posées.
import { expect, vi } from "vitest";
import type { CrmActionChangeItem, CrmFiltersItem, CrmItem, StageChangeItem } from "../src/bridge";
import { createCrmView, type CrmView, type CrmViewDeps } from "../src/screens/crm-view";
import type { CrmTab } from "../src/state/crm";
import { sample } from "./crm-fixture";
import { moreBackend } from "./crm-lists-fixture";

/** Un appel au pont : son nom puis ses arguments. */
export type Call = readonly [string, ...unknown[]];

export interface MountedCrm {
  view: CrmView;
  host: HTMLElement;
  calls: Call[];
  errors: unknown[];
  questions: string[];
  /** Les onglets gardés, du premier au dernier. */
  stored: CrmTab[];
  /** Ce que la lecture rend : à remplacer pour changer le CRM. */
  disk: { crm: CrmItem };
  /** Le prochain geste ou la prochaine lecture échoue avec ce message. */
  fail: { next: string | null; read: string | null };
  /** La réponse à la prochaine confirmation. */
  answer: { value: boolean };
  /** Le retard, en millisecondes, de chacune des prochaines lectures. */
  delays: number[];
  /** Les fiches ouvertes par un clic sur un nom, les appels aux points de branchement de la fenêtre d'une action, ce qui est gardé déplié. */
  opened: string[];
  hooked: Call[];
  kept: string[];
}

export interface MountOptions {
  crm?: CrmItem;
  tab?: string | null;
  width?: number;
  /** Faux : le CRM n'est pas lu à l'ouverture. */
  load?: boolean;
  /** Ce qui était gardé déplié (texte JSON). */
  unfolded?: string | null;
}

function emptyMount(host: HTMLElement, calls: Call[], crm: CrmItem): MountedCrm {
  return {
    ...{ host, calls, errors: [], questions: [], stored: [] },
    ...{ fail: { next: null, read: null }, answer: { value: true }, delays: [] },
    ...{ opened: [], hooked: [], kept: [], disk: { crm }, view: undefined as never },
  };
}

/** Ce que les listes demandent à l'écran : ouvrir une fiche, la fenêtre d'une action, la mémoire de ce qui est déplié. */
function listsDeps(mounted: MountedCrm, options: MountOptions): Partial<CrmViewDeps> {
  return {
    openFiche: (path) => void mounted.opened.push(path),
    hooks: {
      onOpenAction: (reference, crm) => void mounted.hooked.push(["onOpenAction", reference, crm]),
      onNewAction: (person, crm) => void mounted.hooked.push(["onNewAction", person, crm]),
    },
    unfolded: { load: () => options.unfolded ?? null, store: (raw) => void mounted.kept.push(raw) },
  };
}

export async function mountCrm(options: MountOptions = {}): Promise<MountedCrm> {
  const host = document.createElement("div");
  host.className = "column";
  host.style.cssText = `width:${String(options.width ?? 1500)}px;height:700px;position:relative`;
  document.body.replaceChildren(host);
  const calls: Call[] = [];
  const mounted = emptyMount(host, calls, options.crm ?? sample());
  const gesture = async (name: string, ...args: unknown[]) => {
    calls.push([name, ...args]);
    const { next } = mounted.fail;
    mounted.fail.next = null;
    if (next !== null) throw { message: next };
  };
  mounted.view = createCrmView({
    path: "clients.md",
    backend: {
      readCrm: async (path: string, filters: CrmFiltersItem, weekDay: string | null) => {
        calls.push(["readCrm", path, structuredClone(filters), weekDay]);
        if (mounted.fail.read !== null) throw { message: mounted.fail.read };
        const snapshot = structuredClone(mounted.disk.crm);
        const delay = mounted.delays.shift() ?? 0;
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        return snapshot;
      },
      createCrmAction: async (crm, draft) => {
        await gesture("createCrmAction", crm, draft);
        return "nouvelle-action";
      },
      moveCrmAction: async (crm, action, status, placement) => {
        await gesture("moveCrmAction", crm, action, status, placement);
        return null;
      },
      changeCrmAction: async (crm: string, action: string, change: CrmActionChangeItem) => {
        await gesture("changeCrmAction", crm, action, change);
        return null;
      },
      changeCrmStages: async (crm: string, change: StageChangeItem) => {
        await gesture("changeCrmStages", crm, change);
        return [];
      },
      ...moreBackend(gesture),
    },
    confirm: async (question) => {
      mounted.questions.push(question);
      return mounted.answer.value;
    },
    error: (error) => mounted.errors.push(error),
    tab: {
      load: () => options.tab ?? null,
      store: (tab) => void mounted.stored.push(tab),
    },
    ...listsDeps(mounted, options),
  });
  host.append(mounted.view.element);
  if (options.load !== false) await mounted.view.reload();
  return mounted;
}

/** Les appels de ce nom. */
export const callsTo = (mounted: MountedCrm, name: string) =>
  mounted.calls.filter((call) => call[0] === name);

export const column = (status: string) =>
  document.querySelector<HTMLElement>(`.crm-column[data-status="${status}"]`) as HTMLElement;
export const dayColumn = (day: string) =>
  document.querySelector<HTMLElement>(`.crm-column[data-day="${day}"]`) as HTMLElement;
export const card = (name: string) =>
  document.querySelector<HTMLElement>(`.crm-card[data-card="${name}"]`) as HTMLElement;
export const cardsOf = (scope: ParentNode) =>
  [...scope.querySelectorAll<HTMLElement>(".crm-card")].map((c) => c.dataset.card);
export const text = (scope: ParentNode, selector: string) =>
  scope.querySelector(selector)?.textContent ?? null;
export const buttonNamed = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  ) as HTMLButtonElement;
export const tabNamed = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".crm-tab")].find(
    (b) => b.textContent === name,
  ) as HTMLButtonElement;

export const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
  );
export const centre = (element: HTMLElement) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};

/** Glisse `source` jusqu'au point `to` et le lâche ; rend de quoi observer le glissé avant de lâcher. */
export function drag(source: HTMLElement, to: { x: number; y: number }) {
  const from = centre(source);
  pointer(source, "pointerdown", from.x, from.y);
  pointer(document, "pointermove", from.x + 2, from.y);
  pointer(document, "pointermove", to.x, to.y);
  return { drop: () => pointer(document, "pointerup", to.x, to.y) };
}

/** Un point dans `element` : `share` de sa hauteur depuis le haut, au milieu en largeur. */
export function inside(element: HTMLElement, share: number) {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height * share };
}

/** Saisit `value` dans le champ `input` comme au clavier. */
export function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

export const settled = () =>
  vi.waitFor(() => expect(document.querySelector(".crm-board")).not.toBeNull());
