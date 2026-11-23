// Carte mentale (fiche 0050, spécification § 7.2) : le menu du clic droit sur un nœud.
import { type NodePath, PALETTE } from "../state/mind-map";
import type { MenuEntry } from "./context-menu";

/** Ce que le menu fait faire à la carte. */
export interface MenuHost {
  color(path: NodePath, color: string | null): void;
  add(kind: "child" | "sibling", path: NodePath): void;
  edit(path: NodePath): void;
  remove(path: NodePath): void;
}

/** Les 10 couleurs (la couleur actuelle cochée), « Sans couleur », puis les actions du nœud. */
export function nodeMenu(host: MenuHost, path: NodePath, current: string | null): MenuEntry[] {
  return [
    ...PALETTE.map((name) => ({
      label: name,
      swatch: name,
      checked: current === name,
      run: () => host.color(path, name),
    })),
    { label: "Sans couleur", run: () => host.color(path, null) },
    { label: "Ajouter un enfant", separatorBefore: true, run: () => host.add("child", path) },
    { label: "Ajouter un frère", run: () => host.add("sibling", path) },
    { label: "Modifier", run: () => host.edit(path) },
    { label: "Supprimer", run: () => host.remove(path) },
  ];
}
