// Le pont vers l'agenda 12 (fiche 0104) : les commandes de `doc/specs/agenda-12.md` § 13, avec les noms d'arguments de Rust.
import { invoke } from "@tauri-apps/api/core";
import type { Agenda12CellItem } from "./generated/Agenda12CellItem";
import type { Agenda12ClosedItem } from "./generated/Agenda12ClosedItem";
import type { Agenda12ClosingItem } from "./generated/Agenda12ClosingItem";
import type { Agenda12EndItem } from "./generated/Agenda12EndItem";
import type { Agenda12EventChangeItem } from "./generated/Agenda12EventChangeItem";
import type { Agenda12EventDetailItem } from "./generated/Agenda12EventDetailItem";
import type { Agenda12EventItem } from "./generated/Agenda12EventItem";
import type { Agenda12Item } from "./generated/Agenda12Item";
import type { Agenda12LineItem } from "./generated/Agenda12LineItem";
import type { CountryItem } from "./generated/CountryItem";
import type { SavedNote } from "./generated/SavedNote";
import type { YearToneItem } from "./generated/YearToneItem";

export type {
  Agenda12CellItem,
  Agenda12ClosedItem,
  Agenda12ClosingItem,
  Agenda12EndItem,
  Agenda12EventChangeItem,
  Agenda12EventDetailItem,
  Agenda12EventItem,
  Agenda12Item,
  Agenda12LineItem,
  CountryItem,
  YearToneItem,
};

/** Crée dans `folder` un agenda 12 titré `title` ; rend le chemin de sa note. */
export const createAgenda12 = (folder: string, title: string) =>
  invoke<SavedNote>("create_agenda_12", { folder, title });
/** L'agenda 12 de la note `path` : la grille, les archives, la liste du filtre ; `tag` : ne montre que les événements qui la portent (`null` : « Toutes »). */
export const readAgenda12 = (path: string, tag: string | null) =>
  invoke<Agenda12Item>("read_agenda_12", { path, tag });
/** Garde 3, 4 ou 6 colonnes dans l'agenda 12 `path`. */
export const changeAgenda12Columns = (path: string, columns: number) =>
  invoke<null>("change_agenda_12_columns", { path, columns });
/** Crée l'événement « Sans titre » du mois `month` (1 à 12) de l'agenda 12 `agenda` ; rend le chemin de sa note. */
export const createAgenda12Event = (agenda: string, month: number) =>
  invoke<SavedNote>("create_agenda_12_event", { agenda, month });
/** La bande de l'événement `path`, ouvert ou clos. */
export const readAgenda12Event = (path: string) =>
  invoke<Agenda12EventDetailItem>("read_agenda_12_event", { path });
/** Un geste de la bande de l'événement `path`. */
export const changeAgenda12Event = (path: string, change: Agenda12EventChangeItem) =>
  invoke<null>("change_agenda_12_event", { path, change });
/** Clôt l'événement `path`, seul ou avec son suivant ; rend son chemin dans les archives et celui de la copie. */
export const closeAgenda12Event = (path: string, closing: Agenda12ClosingItem) =>
  invoke<Agenda12ClosedItem>("close_agenda_12_event", { path, closing });
/** Rouvre l'événement clos `path` ; rend son nouveau chemin. */
export const reopenAgenda12Event = (path: string) =>
  invoke<SavedNote>("reopen_agenda_12_event", { path });
/** Place l'événement `path` dans la corbeille ; rend son chemin dans la corbeille. */
export const deleteAgenda12Event = (path: string) =>
  invoke<string>("delete_agenda_12_event", { path });
/** Les 249 pays de la norme, par nom en français. */
export const listCountries = () => invoke<CountryItem[]>("list_countries");
