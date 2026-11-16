// Seul module qui parle à Rust. Les types viennent de `generated/`, produits par `cargo test`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ApiError } from "./generated/ApiError";
import type { LibraryInfo } from "./generated/LibraryInfo";
import type { NoteContent } from "./generated/NoteContent";
import type { NoteListItem } from "./generated/NoteListItem";
import type { SavedNote } from "./generated/SavedNote";
import type { SearchResultItem } from "./generated/SearchResultItem";

export type { LibraryInfo, NoteContent, NoteListItem, SavedNote, SearchResultItem };

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
