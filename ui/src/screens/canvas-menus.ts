// Canvas (fiche 0052, spécification § 8) : les menus du clic droit, et ceux des boutons des barres.
import type { Alignment, Distribution } from "../state/canvas-align";
import type { Sense } from "../state/canvas-model";
import type { MenuEntry } from "./context-menu";

/** Un choix de menu ; `readOnly` : il ne change rien, il reste en lecture seule. */
export type CanvasEntry = MenuEntry & { readonly readOnly?: true };

/** Ce que les menus font faire au canvas. */
export interface MenuActions {
  readonly addNote: () => void;
  readonly addMedia: () => void;
  readonly addPage: () => void;
  readonly addGroup: () => void;
  readonly groupSelection: () => void;
  readonly edit: () => void;
  readonly remove: () => void;
  readonly zoomToSelection: () => void;
  readonly copyAddress: () => void;
  readonly changeAddress: () => void;
  readonly openExternal: () => void;
  readonly changeFile: () => void;
  readonly follow: () => void;
  readonly editLabel: () => void;
  readonly removeLabel: () => void;
  readonly setSense: (sense: Sense) => void;
  readonly align: (how: Alignment) => void;
  readonly distribute: (how: Distribution) => void;
  readonly toggleSetting: (name: "grid" | "objects" | "readOnly") => void;
}

/** Sur le canvas : ajouter une note, un média, une page web, créer un groupe. */
export const canvasMenu = (a: MenuActions): CanvasEntry[] => [
  { label: "Ajouter une note de l'espace de travail", run: a.addNote },
  { label: "Ajouter un média de l'espace de travail", run: a.addMedia },
  { label: "Ajouter une page web", run: a.addPage },
  { label: "Créer un groupe", run: a.addGroup },
];

export type CardMenuKind = "text" | "file" | "link" | "group";

/** Sur une carte (le cas d'une sélection de plusieurs cartes ajoute « Créer un groupe »). */
export function cardMenu(a: MenuActions, kind: CardMenuKind, several: boolean): CanvasEntry[] {
  const entries: CanvasEntry[] = [];
  if (kind === "file") entries.push({ label: "Changer le fichier", run: a.changeFile });
  if (kind === "link")
    entries.push(
      { label: "Ouvrir le lien externe", readOnly: true, run: a.openExternal },
      { label: "Copier l'adresse", readOnly: true, run: a.copyAddress },
      { label: "Changer l'adresse…", run: a.changeAddress },
    );
  if (kind === "text" || kind === "file" || kind === "group") {
    entries.push({ label: "Modifier", run: a.edit });
  }
  entries.push({ label: "Zoomer sur la sélection", readOnly: true, run: a.zoomToSelection });
  if (several) entries.push({ label: "Créer un groupe", run: a.groupSelection });
  entries.push({ label: "Retirer", separatorBefore: true, run: a.remove });
  return entries;
}

/** Sur une ligne : retirer, modifier l'étiquette, suivre la connexion. */
export const arrowMenu = (a: MenuActions, hasLabel: boolean): CanvasEntry[] => [
  { label: "Suivre la connexion", readOnly: true, run: a.follow },
  { label: "Modifier l'étiquette", run: a.editLabel },
  ...(hasLabel ? [{ label: "Retirer l'étiquette", run: a.removeLabel }] : []),
  { label: "Retirer", separatorBefore: true, run: a.remove },
];

const SENSES: readonly { sense: Sense; label: string }[] = [
  { sense: "none", label: "Non directionnel" },
  { sense: "single", label: "Unidirectionnel" },
  { sense: "both", label: "Bidirectionnel" },
];

/** Le menu du sens de la ligne : trois choix, une coche sur le choix actuel. */
export const senseMenu = (a: MenuActions, current: Sense | null): MenuEntry[] =>
  SENSES.map(({ sense, label }) => ({
    label,
    checked: current === sense,
    run: () => a.setSense(sense),
  }));

const ALIGNMENTS: readonly { how: Alignment; label: string }[] = [
  { how: "left", label: "Aligner à gauche" },
  { how: "center", label: "Aligner au centre" },
  { how: "right", label: "Aligner à droite" },
  { how: "top", label: "Aligner en haut" },
  { how: "middle", label: "Aligner au milieu" },
  { how: "bottom", label: "Aligner en bas" },
];

/** Le menu « Aligner » : les six alignements puis la répartition de l'espace. */
export const alignMenu = (a: MenuActions, count: number): MenuEntry[] => [
  ...ALIGNMENTS.map(({ how, label }) => ({ label, run: () => a.align(how) })),
  {
    label: "Répartir l'espace horizontal",
    separatorBefore: true,
    disabled: count < 3,
    run: () => a.distribute("horizontal"),
  },
  { label: "Répartir l'espace vertical", disabled: count < 3, run: () => a.distribute("vertical") },
];

/** Le menu de l'engrenage : trois cases. */
export const settingsMenu = (
  a: MenuActions,
  state: { grid: boolean; objects: boolean; readOnly: boolean },
): MenuEntry[] => [
  { label: "Accrocher à la grille", checked: state.grid, run: () => a.toggleSetting("grid") },
  { label: "Accrocher aux objets", checked: state.objects, run: () => a.toggleSetting("objects") },
  { label: "Lecture seule", checked: state.readOnly, run: () => a.toggleSetting("readOnly") },
];

/** Les raccourcis que le canvas connaît : ce que montre le bouton d'aide. */
export const HELP_LINES: readonly string[] = [
  "Double-clic sur le canvas : une carte texte.",
  "Maj + clic : ajouter ou retirer une carte de la sélection.",
  "Cmd + A : tout sélectionner. Suppr : retirer la sélection.",
  "Cmd + Z : annuler. Cmd + Maj + Z (ou Cmd + Y) : rétablir.",
  "Espace + glisser, ou bouton central : déplacer la vue.",
  "Cmd + molette : zoomer. Maj + 1 : tout voir. Maj + 2 : zoom sur la sélection.",
  "Espace pendant un glissement : sans accrochage. Maj : une seule direction, ou garder les proportions.",
];
