// Seul module qui parle à Rust. Les types viennent de `generated/`, produits par `cargo test`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ApiError } from "./generated/ApiError";
import type { AppMenu } from "./generated/AppMenu";
import type { AssistantStatus } from "./generated/AssistantStatus";
import type { AttachedFile } from "./generated/AttachedFile";
import type { ChosenFolder } from "./generated/ChosenFolder";
import type { ActionKindItem } from "./generated/ActionKindItem";
import type { AgentStateItem } from "./generated/AgentStateItem";
import type { ClaudeEventItem } from "./generated/ClaudeEventItem";
import type { LimitPeriodItem } from "./generated/LimitPeriodItem";
import type { UsageWindowItem } from "./generated/UsageWindowItem";
import type { ClaudeStatusItem } from "./generated/ClaudeStatusItem";
import type { ClaudeModelItem } from "./generated/ClaudeModelItem";
import type { EffortItem } from "./generated/EffortItem";
import type { EntryItem } from "./generated/EntryItem";
import type { TurnSettingsItem } from "./generated/TurnSettingsItem";
import type { DifferenceItem } from "./generated/DifferenceItem";
import type { ExportFile } from "./generated/ExportFile";
import type { ExportFormatItem } from "./generated/ExportFormatItem";
import type { MeaningOverviewItem } from "./generated/MeaningOverviewItem";
import type { MeaningProgressItem } from "./generated/MeaningProgressItem";
import type { MeaningSearchItem } from "./generated/MeaningSearchItem";
import type { MeaningUseItem } from "./generated/MeaningUseItem";
import type { MenuEntryItem } from "./generated/MenuEntryItem";
import type { ModelDownloadItem } from "./generated/ModelDownloadItem";
import type { ModelOverviewItem } from "./generated/ModelOverviewItem";
import type { StandardItem } from "./generated/StandardItem";
import type { WorkspaceChanged } from "./generated/WorkspaceChanged";
import type { WorkspaceInfo } from "./generated/WorkspaceInfo";
import type { WorkspaceItem } from "./generated/WorkspaceItem";
import type { WorkspaceNoteItem } from "./generated/WorkspaceNoteItem";
import type { IndexOverviewItem } from "./generated/IndexOverviewItem";
import type { LinkingNoteItem } from "./generated/LinkingNoteItem";
import type { NoteContent } from "./generated/NoteContent";
import type { NoteListItem } from "./generated/NoteListItem";
import type { NoteOrderItem } from "./generated/NoteOrderItem";
import type { ProposalItem } from "./generated/ProposalItem";
import type { SaveResult } from "./generated/SaveResult";
import type { SavedNote } from "./generated/SavedNote";
import type { ContentTypeItem } from "./generated/ContentTypeItem";
import type { SearchResultItem } from "./generated/SearchResultItem";
import type { TagItem } from "./generated/TagItem";
import type { TrashedNoteItem } from "./generated/TrashedNoteItem";
import type { TrashInfo } from "./generated/TrashInfo";
import type { VersionItem } from "./generated/VersionItem";
import type { WritingActionItem } from "./generated/WritingActionItem";

export type {
  ActionKindItem,
  AgentStateItem,
  AppMenu,
  AssistantStatus,
  AttachedFile,
  ChosenFolder,
  ClaudeEventItem,
  ClaudeStatusItem,
  LimitPeriodItem,
  UsageWindowItem,
  ClaudeModelItem,
  EffortItem,
  EntryItem,
  TurnSettingsItem,
  DifferenceItem,
  ExportFile,
  ExportFormatItem,
  MeaningOverviewItem,
  MeaningProgressItem,
  MeaningSearchItem,
  MeaningUseItem,
  MenuEntryItem,
  ModelDownloadItem,
  ModelOverviewItem,
  StandardItem,
  WorkspaceChanged,
  WorkspaceInfo,
  WorkspaceItem,
  WorkspaceNoteItem,
  LinkingNoteItem,
  NoteContent,
  NoteListItem,
  NoteOrderItem,
  ContentTypeItem,
  ProposalItem,
  SaveResult,
  SavedNote,
  SearchResultItem,
  TagItem,
  TrashedNoteItem,
  TrashInfo,
  VersionItem,
  WritingActionItem,
};

/** Le message lisible d'une erreur rendue par Rust, ou de toute autre erreur. */
export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as ApiError).message);
  }
  return String(error);
}

export const reopenLastWorkspace = () => invoke<WorkspaceInfo | null>("reopen_last_workspace");
/** Les espaces de travail, dans l'ordre où on les a ajoutés, l'ouvert marqué. */
export const listWorkspaces = () => invoke<WorkspaceItem[]>("list_workspaces");
/** Fait choisir le dossier d'un nouvel espace de travail ; rend aussi le nom proposé, ou rien. */
export const chooseWorkspaceFolder = () => invoke<ChosenFolder | null>("choose_workspace_folder");
/** Ajoute l'espace de travail `name` sur le dossier `folder`, et l'ouvre. */
export const addWorkspace = (name: string, folder: string) =>
  invoke<WorkspaceInfo>("add_workspace", { name, folder });
/** Ouvre l'espace de travail `name` à la place de celui qui l'était. */
export const openWorkspace = (name: string) => invoke<WorkspaceInfo>("open_workspace", { name });
/** Renomme un espace de travail, sans toucher à ses fichiers ; rend le nom gardé. */
export const renameWorkspace = (name: string, newName: string) =>
  invoke<string>("rename_workspace", { name, newName });
/** Retire un espace de travail de la liste, sans toucher à ses fichiers. */
export const removeWorkspace = (name: string) => invoke<null>("remove_workspace", { name });
/**
 * Les notes d'un dossier, désigné par son chemin (`""` pour la racine de l'espace de travail), dans
 * l'ordre du tri de la liste.
 */
export const listNotes = (folder: string, order: NoteOrderItem) =>
  invoke<NoteListItem[]>("list_notes", { folder, order });
/** Les notes de tout l'espace de travail qui contiennent tous les mots de `query`, dans l'ordre du tri. */
export const searchNotes = (query: string, order: NoteOrderItem) =>
  invoke<SearchResultItem[]>("search_notes", { query, order });
/** Toutes les notes de l'espace de travail, la plus récente en premier : pour l'ouverture rapide. */
export const listAllNotes = () => invoke<WorkspaceNoteItem[]>("list_all_notes");
/** Les notes de tout l'espace de travail qui portent l'étiquette `tag` : le filtre par étiquette. */
export const listTaggedNotes = (tag: string, order: NoteOrderItem) =>
  invoke<NoteListItem[]>("list_tagged_notes", { tag, order });
/** Les notes récentes `paths`, dans cet ordre, sans celles qui n'existent plus. */
export const listRecentNotes = (paths: readonly string[]) =>
  invoke<NoteListItem[]>("list_recent_notes", { paths });
/** Chaque étiquette de l'espace de travail et son nombre de notes, par ordre alphabétique. */
export const listTags = () => invoke<TagItem[]>("list_tags");
/** Reconstruit l'index de l'espace de travail ouvert à partir de ses fichiers. */
export const rebuildIndex = () => invoke<null>("rebuild_index");
export const indexOverview = () => invoke<IndexOverviewItem>("index_overview");
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
/** La note du jour dans le dossier `journal`, créée par Rust si besoin, depuis `template` s'il y en a un. */
export const createDailyNote = (journal: string, template: string | null) =>
  invoke<SavedNote>("create_daily_note", { journal, template });
/** Crée dans `folder` un cahier de recherche titré `title`. */
export const createResearchNotebook = (folder: string, title: string) =>
  invoke<SavedNote>("create_research_notebook", { folder, title });
/** Ajoute l'entrée `text` à la fin du cahier, à l'heure qu'il est. */
export const addEntry = (path: string, text: string) =>
  invoke<EntryItem>("add_entry", { path, text });
/** Les entrées du cahier, de la plus ancienne à la plus récente. */
export const listEntries = (path: string) => invoke<EntryItem[]>("list_entries", { path });
/** L'adresse qui charge dans la fenêtre un fichier de l'espace de travail, comme une image. */
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
/** Les versions de la note, la plus récente d'abord. */
export const listVersions = (path: string) => invoke<VersionItem[]>("list_versions", { path });
/** Les lignes de la note actuelle et de la version, marquées selon leur origine. */
export const compareVersion = (path: string, version: string) =>
  invoke<DifferenceItem[]>("compare_version", { path, version });
/** Garde une version du texte actuel de la note, s'il diffère de la plus récente. */
export const keepVersion = (path: string) => invoke<null>("keep_version", { path });
/** Revient à une version de la note ; son texte actuel est d'abord gardé comme version. */
export const restoreVersion = (path: string, version: string) =>
  invoke<NoteContent>("restore_version", { path, version });

/** Passe la fenêtre en plein écran, ou l'en fait sortir. */
export const setFullScreen = (on: boolean) => getCurrentWindow().setFullscreen(on);
/** La fenêtre est-elle en plein écran (y compris par le bouton vert ou le menu du Mac) ? */
export const isFullScreen = () => getCurrentWindow().isFullscreen();
/** Même nom côté Rust (`WORKSPACE_CHANGED_EVENT`). */
const WORKSPACE_CHANGED_EVENT = "workspace-changed";
/** Prévient de chaque changement fait dans l'espace de travail hors de l'application. */
export const onWorkspaceChanged = (handler: (change: WorkspaceChanged) => void) =>
  listen<WorkspaceChanged>(WORKSPACE_CHANGED_EVENT, (event) => handler(event.payload));

/** Remplace la barre des menus du Mac par `menus`, de gauche à droite. */
export const installMenu = (menus: AppMenu[]) => invoke<null>("install_menu", { menus });
/** Grise (`enabled` faux) ou rend actifs les éléments de menu des commandes `ids`. */
export const enableMenuItems = (ids: string[], enabled: boolean) =>
  invoke<null>("enable_menu_items", { ids, enabled });
/** Même nom côté Rust (`MENU_COMMAND_EVENT`). */
const MENU_COMMAND_EVENT = "menu-command";
/** Prévient à chaque élément de la barre des menus choisi, avec l'identifiant de sa commande. */
export const onMenuCommand = (handler: (id: string) => void) =>
  listen<string>(MENU_COMMAND_EVENT, (event) => handler(event.payload));

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

/**
 * Fait choisir le fichier d'un export dans la fenêtre d'enregistrement du Mac, le nom tiré du
 * titre, dans `folder` (dossier du dernier export) ou à défaut dans Documents ; rien si annulé.
 */
export const chooseExportFile = (title: string, format: ExportFormatItem, folder: string | null) =>
  invoke<ExportFile | null>("choose_export_file", { title, format, folder });
/** Écrit la note en Markdown au fichier `destination`, ses pièces jointes copiées à côté. */
export const exportMarkdown = (path: string, destination: string) =>
  invoke<null>("export_markdown", { path, destination });
/** Imprime la feuille d'impression de l'interface dans le fichier PDF `destination`. */
export const exportPdf = (destination: string) => invoke<null>("export_pdf", { destination });
/** Ouvre la fenêtre d'impression du Mac sur la feuille d'impression de l'interface. */
export const printPage = () => invoke<null>("print_page");
/** Pose dans le presse-papiers du Mac le texte mis en forme `html` et le texte brut `text`. */
export const copyRichText = (html: string, text: string) =>
  invoke<null>("copy_rich_text", { html, text });
/** Pose dans le presse-papiers du Mac le texte Markdown `text`, en texte brut seul. */
export const copyPlainText = (text: string) => invoke<null>("copy_plain_text", { text });
/** Si l'assistant d'écriture (le modèle d'IA du Mac) peut répondre, sinon pourquoi. */
export const assistantStatus = () => invoke<AssistantStatus>("assistant_status");
/** Ce que l'assistant d'écriture propose pour la sélection ; rien n'est écrit dans la note. */
export const proposeRewriting = (action: WritingActionItem, selection: string) =>
  invoke<ProposalItem>("propose_rewriting", { action, selection });
/** Si Claude Code est installé et connecté, sinon pourquoi et quoi faire ; le modèle n'est pas appelé. */
export const claudeStatus = () => invoke<ClaudeStatusItem>("claude_status");
/**
 * Envoie un message à Claude dans l'espace de travail ouvert, en continuant `conversation` (celle
 * de l'onglet de conversation, annoncée par `conversationStarted` ; `null` en commence une neuve),
 * avec le modèle et le niveau d'effort choisis ; se termine avec le tour. Après une lecture du web,
 * ses créations et modifications de notes sont retenues, sauf si `changesAllowed` (l'utilisateur
 * les autorise pour ce tour). Claude a aussi les outils de l'application, avec `templates` (le
 * dossier des modèles de l'espace de travail, ou `null`) pour les modèles de note. Les événements
 * du tour arrivent par `onClaudeEvent`.
 */
export const sendToClaude = (
  message: string,
  conversation: string | null,
  settings: TurnSettingsItem,
  changesAllowed: boolean,
  templates: string | null,
) => invoke<null>("send_to_claude", { message, conversation, settings, changesAllowed, templates });
/** Arrête le tour en cours (ce que Claude a déjà écrit reste écrit), ou annule la connexion en cours. */
export const stopClaude = () => invoke<null>("stop_claude");
/** Déconnecte Claude Code de son compte Claude, pour tout le Mac (Terminal et VS Code compris). */
export const logOutOfClaude = () => invoke<null>("log_out_of_claude");
/**
 * Connecte Claude Code à un compte Claude, pour tout le Mac : le navigateur s'ouvre sur la page de
 * connexion, dont l'adresse arrive par `onClaudeSignIn` ; se termine avec la connexion.
 */
export const logInToClaude = () => invoke<null>("log_in_to_claude");
/** Même nom côté Rust (`CLAUDE_SIGN_IN`). */
const CLAUDE_SIGN_IN = "claude-sign-in";
/** Prévient de l'adresse de la page de connexion pendant une connexion de Claude Code. */
export const onClaudeSignIn = (handler: (address: string) => void) =>
  listen<string>(CLAUDE_SIGN_IN, (event) => handler(event.payload));
/** Même nom côté Rust (`CLAUDE_SHOWS_NOTE`). */
const CLAUDE_SHOWS_NOTE = "claude-shows-note";
/** Claude montre une note à l'utilisateur (outil de l'application) : son chemin, à ouvrir. */
export const onClaudeShowsNote = (handler: (path: string) => void) =>
  listen<string>(CLAUDE_SHOWS_NOTE, (event) => handler(event.payload));
/** Même nom côté Rust (`CLAUDE_ASKS_VIEW`). */
const CLAUDE_ASKS_VIEW = "claude-asks-view";
/** Claude demande ce que l'utilisateur regarde : le numéro de la demande, à rendre à `answerView`. */
export const onClaudeAsksView = (handler: (request: number) => void) =>
  listen<number>(CLAUDE_ASKS_VIEW, (event) => handler(event.payload));
/** Ce que l'utilisateur regarde, en réponse à la demande `request` : la note de la colonne active et le texte sélectionné. */
export const answerView = (request: number, note: string | null, selection: string) =>
  invoke<null>("answer_view", { request, note, selection });
/** Même nom côté Rust (`CLAUDE_EVENT`). */
const CLAUDE_EVENT = "claude-event";
/** Prévient de chaque événement de Claude du tour en cours, dès qu'il arrive. */
export const onClaudeEvent = (handler: (event: ClaudeEventItem) => void) =>
  listen<ClaudeEventItem>(CLAUDE_EVENT, (event) => handler(event.payload));
/** Ouvre l'adresse web `address` dans le navigateur du Mac ; rien d'autre ne s'ouvre ainsi. */
export const openWebAddress = (address: string) => invoke<null>("open_web_address", { address });
/** Ouvre ce que vise la cible d'un lien Markdown de la note : adresse web dans le navigateur, pièce jointe avec l'application du Mac. */
export const openLinkTarget = (path: string, target: string) =>
  invoke<null>("open_link_target", { path, target });

/** L'état de la recherche par le sens : modèle choisi, chaque modèle, index de sens, calcul. */
export const meaningOverview = () => invoke<MeaningOverviewItem>("meaning_overview");
/** Choisit le modèle de sens, désigné par son nom (`e5-small`, `e5-large`). */
export const chooseMeaningModel = (model: string) =>
  invoke<null>("choose_meaning_model", { model });
/** Télécharge un modèle de sens ; se termine avec le téléchargement, dont l'avancement arrive par `onModelDownload`. */
export const downloadMeaningModel = (model: string) =>
  invoke<null>("download_meaning_model", { model });
/** Annule le téléchargement du modèle en cours, s'il y en a un. */
export const cancelModelDownload = () => invoke<null>("cancel_model_download");
/** Supprime un modèle de sens du Mac. */
export const removeMeaningModel = (model: string) =>
  invoke<null>("remove_meaning_model", { model });
/** Reconstruit l'index de sens de l'espace de travail ouvert ; les vecteurs se recalculent ensuite. */
export const rebuildMeaning = () => invoke<null>("rebuild_meaning");
/** Les notes de tout l'espace de travail qui répondent à `query` par leurs mots ou leur sens, et ce qu'il est advenu du sens. */
export const searchNotesWithMeaning = (query: string) =>
  invoke<MeaningSearchItem>("search_notes_with_meaning", { query });
/** Les notes dont le sens est le plus proche de la note `path` : dix au plus. */
export const relatedNotes = (path: string) => invoke<NoteListItem[]>("related_notes", { path });
/** Même nom côté Rust (`MEANING_PROGRESS_EVENT`). */
const MEANING_PROGRESS_EVENT = "meaning-progress";
/** Prévient de l'avancement du calcul des vecteurs de sens, en arrière-plan. */
export const onMeaningProgress = (handler: (progress: MeaningProgressItem) => void) =>
  listen<MeaningProgressItem>(MEANING_PROGRESS_EVENT, (event) => handler(event.payload));
/** Même nom côté Rust (`MODEL_DOWNLOAD_EVENT`). */
const MODEL_DOWNLOAD_EVENT = "model-download";
/** Prévient de l'avancement du téléchargement d'un modèle de sens. */
export const onModelDownload = (handler: (progress: ModelDownloadItem) => void) =>
  listen<ModelDownloadItem>(MODEL_DOWNLOAD_EVENT, (event) => handler(event.payload));
