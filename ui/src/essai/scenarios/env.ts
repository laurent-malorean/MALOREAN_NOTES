// Essai de l'application réelle (fiche 0054) : ce que les scénarios reçoivent de l'application, et leurs
// outils de mesure dans la vraie fenêtre. Rien ici n'existe dans l'application livrée.
import { invoke } from "@tauri-apps/api/core";
import type * as Bridge from "../../bridge";
import type { WorkspaceInfo } from "../../bridge";
import type { Pixels } from "../png";
import { messageOf } from "../runner";

/** Ce que l'application donne à l'essai : le vrai pont, et de quoi ouvrir et exporter comme l'utilisateur. */
export interface Env {
  readonly bridge: typeof Bridge;
  /** Ouvre la note (ou le canvas, ou la carte mentale) dans la colonne active. */
  readonly open: (path: string) => void;
  /** Montre l'espace de travail ouvert par Rust dans les listes de l'interface. */
  readonly showWorkspace: (info: WorkspaceInfo) => Promise<void>;
  /** « Canvas : exporter en image » de la colonne active. */
  readonly exportCanvasImage: () => Promise<void>;
  /** Le dossier de l'espace de travail temporaire de l'essai. */
  readonly directory: string;
  /** Ce que les scénarios se passent l'un à l'autre (le canvas fait par le premier, par exemple). */
  readonly shared: { canvas?: string };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Les espaces de travail de l'essai, sous le dossier donné par l'environnement. */
export const notesFolder = (env: Env) => `${env.directory}/notes`;
export const searchFolder = (env: Env) => `${env.directory}/recherche`;

/** Le PNG de l'essai, lu sur le disque. */
export async function fixtureImage(env: Env): Promise<Uint8Array> {
  const bytes = await readDisk(`${notesFolder(env)}/Fixtures/image.png`);
  if (bytes === null) throw new Error("le PNG de l'essai est introuvable dans l'espace de travail");
  return bytes;
}

export function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}

export const centreOf = (rect: Rect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

export function pointer(target: EventTarget, type: string, at: { x: number; y: number }): void {
  const init = { bubbles: true, button: 0, clientX: at.x, clientY: at.y, pointerId: 1 };
  target.dispatchEvent(new PointerEvent(type, init));
}

export const find = <T extends Element>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);

export const findAll = <T extends Element>(selector: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(selector),
];

/** Le bouton de la fenêtre qui porte ce nom accessible. */
export const buttonNamed = (name: string, root: ParentNode = document) =>
  find<HTMLButtonElement>(`button[aria-label="${name}"]`, root);

/** Le contenu d'un fichier du disque, lu par Rust (jamais par le protocole des fichiers qu'on teste par ailleurs). */
export async function readDisk(path: string): Promise<Uint8Array | null> {
  try {
    const encoded = await invoke<string>("essai_read_file", { path });
    return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** L'image que la fenêtre charge à `address` : sa taille réelle, ou `null` si elle ne se charge pas. */
export function loadedImage(address: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = address;
  });
}

/** Ce que la fenêtre dit à l'utilisateur en ce moment (notifications, barre d'état) : la raison d'un échec silencieux. */
export const shownMessages = (): string =>
  findAll(".status, .toast, [role=alert]")
    .map((e) => (e.textContent ?? "").trim())
    .filter((text) => text !== "")
    .join(" | ");

/** Fait `action` ; son erreur dit à quelle étape elle est arrivée. */
export async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new Error(`${name} : ${messageOf(error)}`, { cause: error });
  }
}

/** Les pixels d'un PNG, décodés par la fenêtre. */
export async function pixelsOf(bytes: Uint8Array): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context?.drawImage(bitmap, 0, 0);
  const data = context?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? [];
  return { width: bitmap.width, height: bitmap.height, data };
}

/** Donne le fichier que rendra la prochaine fenêtre d'enregistrement. */
export const setExportDestination = (path: string) =>
  invoke<null>("essai_set_destination", { path });

/** Un bouton de la barre du canvas, « déposé » en `at` comme par un glissement de souris. */
export function dropFromBar(button: HTMLButtonElement, at: { x: number; y: number }): void {
  pointer(button, "pointerdown", centreOf(rectOf(button)));
  // Sur le corps de la page : l'événement monte jusqu'à la fenêtre, où la barre l'attend.
  pointer(document.body, "pointerup", at);
}
