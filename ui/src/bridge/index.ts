// Seul module qui parle à Rust. Les types viennent de `generated/`, produits par `cargo test`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ApiError } from "./generated/ApiError";
import type { LibraryInfo } from "./generated/LibraryInfo";
import type { NoteContent } from "./generated/NoteContent";
import type { NoteListItem } from "./generated/NoteListItem";
import type { SavedNote } from "./generated/SavedNote";
import type { SearchResultItem } from "./generated/SearchResultItem";
import type { TrashedNoteItem } from "./generated/TrashedNoteItem";
import type { TrashInfo } from "./generated/TrashInfo";

export type {
  LibraryInfo,
  NoteContent,
  NoteListItem,
  SavedNote,
  SearchResultItem,
  TrashedNoteItem,
  TrashInfo,
};

/** Le message lisible d'une erreur rendue par Rust, ou de toute autre erreur. */
export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as ApiError).message);
  }
  return String(error);
}

export const reopenLastLibrary = () => invoke<LibraryInfo | null>("reopen_last_library");
export const chooseLibrary = () => invoke<LibraryInfo | null>("choose_library");
/** Les notes d'un dossier, désigné par son chemin (`""` pour la racine de la bibliothèque). */
export const listNotes = (folder: string) => invoke<NoteListItem[]>("list_notes", { folder });
/** Les notes de toute la bibliothèque qui contiennent tous les mots de `query`. */
export const searchNotes = (query: string) => invoke<SearchResultItem[]>("search_notes", { query });
export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });
export const saveNote = (path: string, content: string) =>
  invoke<SavedNote>("save_note", { path, content });
export const createNote = (folder: string) => invoke<SavedNote>("create_note", { folder });
/** L'adresse qui charge dans la fenêtre un fichier de la bibliothèque, comme une image. */
export const fileAddress = (path: string) => convertFileSrc(path);
export const listFolders = () => invoke<string[]>("list_folders");
/** Crée le dossier `name` dans `parent` ; rend son chemin. */
export const createFolder = (parent: string, name: string) =>
  invoke<string>("create_folder", { parent, name });
/** Renomme un dossier ; rend son nouveau chemin. */
export const renameFolder = (path: string, name: string) =>
  invoke<string>("rename_folder", { path, name });
/** Déplace un dossier dans `into` ; rend son nouveau chemin. */
export const moveFolder = (path: string, into: string) =>
  invoke<string>("move_folder", { path, into });
export const moveNote = (path: string, into: string) =>
  invoke<SavedNote>("move_note", { path, into });
/** Épingle une note en tête de liste, sans changer sa date ; rend son nouveau contenu. */
export const pinNote = (path: string) => invoke<NoteContent>("pin_note", { path });
/** Désépingle une note ; rend son nouveau contenu. */
export const unpinNote = (path: string) => invoke<NoteContent>("unpin_note", { path });

/** Place une note dans la corbeille ; rend son chemin dans la corbeille. */
export const trashNote = (path: string) => invoke<string>("trash_note", { path });
/** Place un dossier, avec tout ce qu'il contient, dans la corbeille. */
export const trashFolder = (path: string) => invoke<string>("trash_folder", { path });
export const listTrash = () => invoke<TrashInfo>("list_trash");
/** Remet une note de la corbeille à sa place ; rend son chemin, peut-être suffixé. */
export const restoreNote = (path: string) => invoke<SavedNote>("restore_note", { path });
/** Remet un dossier de la corbeille à sa place, avec tout ce qu'il contient. */
export const restoreFolder = (path: string) => invoke<string>("restore_folder", { path });
/** Supprime définitivement tout ce que contient la corbeille. */
export const emptyTrash = () => invoke<null>("empty_trash");

/** Passe la fenêtre en plein écran, ou l'en fait sortir. */
export const setFullScreen = (on: boolean) => getCurrentWindow().setFullscreen(on);
/** La fenêtre est-elle en plein écran (y compris par le bouton vert ou le menu du Mac) ? */
export const isFullScreen = () => getCurrentWindow().isFullscreen();
/** Prévient à chaque changement de taille de la fenêtre, entrée et sortie du plein écran comprises. */
export const onWindowResized = (handler: () => void) => getCurrentWindow().onResized(handler);
