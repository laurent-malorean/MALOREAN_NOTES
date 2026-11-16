// Seul module qui parle à Rust. Les types viennent de `generated/`, produits par `cargo test`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ApiError } from "./generated/ApiError";
import type { LibraryInfo } from "./generated/LibraryInfo";
import type { NoteContent } from "./generated/NoteContent";
import type { NoteListItem } from "./generated/NoteListItem";
import type { SavedNote } from "./generated/SavedNote";

export type { LibraryInfo, NoteContent, NoteListItem, SavedNote };

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
export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });
export const saveNote = (path: string, content: string) =>
  invoke<SavedNote>("save_note", { path, content });
export const createNote = (folder: string) => invoke<SavedNote>("create_note", { folder });
/** L'adresse qui charge dans la fenêtre un fichier de la bibliothèque, comme une image. */
export const fileAddress = (path: string) => convertFileSrc(path);
