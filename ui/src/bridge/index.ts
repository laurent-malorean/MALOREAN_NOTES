// Seul module qui parle à Rust. Les types viennent de `generated/`, produits par `cargo test`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ApiError } from "./generated/ApiError";
import type { AttachedFile } from "./generated/AttachedFile";
import type { LibraryChanged } from "./generated/LibraryChanged";
import type { LibraryInfo } from "./generated/LibraryInfo";
import type { LibraryNoteItem } from "./generated/LibraryNoteItem";
import type { LinkingNoteItem } from "./generated/LinkingNoteItem";
import type { NoteContent } from "./generated/NoteContent";
import type { NoteListItem } from "./generated/NoteListItem";
import type { SaveResult } from "./generated/SaveResult";
import type { SavedNote } from "./generated/SavedNote";
import type { SearchResultItem } from "./generated/SearchResultItem";
import type { TagItem } from "./generated/TagItem";
import type { TrashedNoteItem } from "./generated/TrashedNoteItem";
import type { TrashInfo } from "./generated/TrashInfo";

export type {
  AttachedFile,
  LibraryChanged,
  LibraryInfo,
  LibraryNoteItem,
  LinkingNoteItem,
  NoteContent,
  NoteListItem,
  SaveResult,
  SavedNote,
  SearchResultItem,
  TagItem,
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
/** Toutes les notes de la bibliothèque, la plus récente en premier : pour l'ouverture rapide. */
export const listAllNotes = () => invoke<LibraryNoteItem[]>("list_all_notes");
/** Les notes de toute la bibliothèque qui portent l'étiquette `tag` : le filtre par étiquette. */
export const listTaggedNotes = (tag: string) =>
  invoke<NoteListItem[]>("list_tagged_notes", { tag });
/** Chaque étiquette de la bibliothèque et son nombre de notes, par ordre alphabétique. */
export const listTags = () => invoke<TagItem[]>("list_tags");
/** Le chemin de la note qu'un lien `[[title]]` désigne, ou rien. */
export const resolveLink = (title: string) => invoke<string | null>("resolve_link", { title });
/** Les liens entrants de la note `path` : les notes qui pointent vers elle. */
export const listBacklinks = (path: string) =>
  invoke<LinkingNoteItem[]>("list_backlinks", { path });
export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });
/** Enregistre une note lue ou enregistrée avec l'empreinte `fingerprint` (voir la fiche 0014). */
export const saveNote = (path: string, content: string, fingerprint: string) =>
  invoke<SaveResult>("save_note", { path, content, fingerprint });
export const createNote = (folder: string) => invoke<SavedNote>("create_note", { folder });
/** Crée une note dans `folder` depuis le modèle `template`, ses variables remplacées par Rust. */
export const createNoteFromTemplate = (template: string, folder: string) =>
  invoke<SavedNote>("create_note_from_template", { template, folder });
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
/** Même nom côté Rust (`LIBRARY_CHANGED_EVENT`). */
const LIBRARY_CHANGED_EVENT = "library-changed";
/** Prévient de chaque changement fait dans la bibliothèque hors de l'application. */
export const onLibraryChanged = (handler: (change: LibraryChanged) => void) =>
  listen<LibraryChanged>(LIBRARY_CHANGED_EVENT, (event) => handler(event.payload));

/** Prévient à chaque changement de taille de la fenêtre, entrée et sortie du plein écran comprises. */
export const onWindowResized = (handler: () => void) => getCurrentWindow().onResized(handler);

/** D'où vient un fichier à joindre : collé (seul son type est connu) ou glissé (il a un nom). */
export type AttachmentOrigin =
  | { readonly kind: "pasted"; readonly mediaType: string }
  | { readonly kind: "dropped"; readonly fileName: string };

/** En-têtes d'une pièce jointe, encodés comme une adresse ; mêmes noms côté Rust. */
const NOTE_HEADER = "x-note";
const FILE_NAME_HEADER = "x-file-name";
const MEDIA_TYPE_HEADER = "x-media-type";

/** Joint un fichier à la note `path` (envoyé tel quel, en octets) ; rend le lien à insérer. */
export async function attachFile(
  path: string,
  file: Blob,
  origin: AttachmentOrigin,
): Promise<AttachedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const headers: Record<string, string> = { [NOTE_HEADER]: encodeURIComponent(path) };
  if (origin.kind === "dropped") headers[FILE_NAME_HEADER] = encodeURIComponent(origin.fileName);
  else headers[MEDIA_TYPE_HEADER] = encodeURIComponent(origin.mediaType);
  return invoke<AttachedFile>("attach_file", bytes, { headers });
}

/** Ouvre avec l'application du Mac la pièce jointe que vise la cible d'un lien de la note. */
export const openAttachment = (path: string, target: string) =>
  invoke<null>("open_attachment", { path, target });
