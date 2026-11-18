//! Données échangées avec l'interface ; leurs types TypeScript sont générés par `cargo test`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// L'espace de travail ouvert.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceInfo {
    /// Le nom de l'espace de travail, montré par le sélecteur et à la racine des dossiers.
    pub name: String,
    /// L'emplacement complet de son dossier, pour charger les images des notes.
    pub path: String,
}

/// Un espace de travail de la liste, désigné par son nom.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceItem {
    /// Le nom de l'espace de travail.
    pub name: String,
    /// Vrai pour l'espace de travail ouvert.
    pub active: bool,
}

/// Le dossier choisi pour un nouvel espace de travail, et le nom qu'on lui propose.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChosenFolder {
    /// Le nom du dossier, proposé pour l'espace de travail.
    pub name: String,
    /// L'emplacement complet du dossier.
    pub path: String,
}

/// Une ligne de la liste des notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteListItem {
    /// Le chemin de la note depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Millisecondes depuis le 1er janvier 1970.
    #[ts(type = "number")]
    pub modified: u64,
    /// La note est épinglée en tête de liste.
    pub pinned: bool,
    /// Les étiquettes de son en-tête, dans l'ordre où elles sont écrites.
    pub tags: Vec<String>,
}

/// Le tri de la liste choisi dans l'interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NoteOrderItem {
    /// La plus récemment modifiée d'abord.
    Modified,
    /// Par titre, de A à Z.
    Title,
}

impl From<NoteOrderItem> for domain::NoteOrder {
    fn from(order: NoteOrderItem) -> Self {
        match order {
            NoteOrderItem::Modified => Self::Modified,
            NoteOrderItem::Title => Self::Title,
        }
    }
}

/// Le format d'export choisi dans l'interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExportFormatItem {
    /// La note mise en forme, en pages.
    Pdf,
    /// Le fichier de la note tel quel.
    Markdown,
}

impl From<ExportFormatItem> for domain::export::ExportFormat {
    fn from(format: ExportFormatItem) -> Self {
        match format {
            ExportFormatItem::Pdf => Self::Pdf,
            ExportFormatItem::Markdown => Self::Markdown,
        }
    }
}

/// Le fichier exporté choisi dans la fenêtre d'enregistrement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportFile {
    /// L'emplacement complet du fichier à écrire.
    pub path: String,
    /// Le dossier qui le contient, où s'ouvrira la fenêtre d'enregistrement suivante.
    pub folder: String,
}

/// Une étiquette de la liste des étiquettes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TagItem {
    /// L'étiquette, telle qu'écrite dans les en-têtes.
    pub name: String,
    /// Le nombre de notes qui la portent.
    #[ts(type = "number")]
    pub count: usize,
}

/// Une note trouvée par la recherche.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResultItem {
    /// Le chemin de la note depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
    /// Millisecondes depuis le 1er janvier 1970.
    #[ts(type = "number")]
    pub modified: u64,
    /// L'extrait, en morceaux : les mots trouvés sont marqués.
    pub excerpt: Vec<ExcerptPartItem>,
}

/// Un morceau d'extrait.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExcerptPartItem {
    /// Le texte du morceau, tel qu'il est écrit dans la note.
    pub text: String,
    /// Vrai si c'est un mot cherché, à mettre en évidence.
    pub matched: bool,
}

/// Une note ouverte dans l'éditeur.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteContent {
    /// Le chemin de la note depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le contenu Markdown complet.
    pub content: String,
    /// Le titre affiché : le titre `#`, ou « Sans titre ».
    pub title: String,
    /// L'empreinte de ce contenu, à renvoyer à l'enregistrement : si le fichier a changé
    /// ailleurs entre-temps, sa version est gardée dans une copie de conflit.
    pub fingerprint: String,
}

/// Ce qu'a donné l'enregistrement d'une note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaveResult {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: String,
    /// Le titre affiché de ce qui vient d'être écrit : le titre `#`, ou « Sans titre ».
    pub title: String,
    /// L'empreinte de ce qui vient d'être écrit, à renvoyer au prochain enregistrement.
    pub fingerprint: String,
    /// Le chemin de la copie de conflit qui garde la version trouvée sur le disque,
    /// si la note avait changé hors de l'application.
    pub conflict_copy: Option<String>,
    /// Les étiquettes de la note ont changé : la liste des étiquettes est à relire.
    pub tags_changed: bool,
}

/// Changement fait dans l'espace de travail hors de l'application, annoncé à la page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceChanged {
    /// Les chemins des notes créées, modifiées, supprimées ou renommées ; vide si seuls
    /// des dossiers ont changé.
    pub notes: Vec<String>,
}

/// Le chemin d'une note après enregistrement ou création.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedNote {
    /// Le chemin de la note, dont le nom a peut-être changé avec le titre.
    pub path: String,
}

/// Une note de l'espace de travail, proposée par l'ouverture rapide.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceNoteItem {
    /// Le chemin de la note depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
}

/// Une note dont un lien désigne la note ouverte (lien entrant).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkingNoteItem {
    /// Le chemin de la note depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier de la note : `""` pour la racine.
    pub folder: String,
}

/// Une note de la corbeille.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashedNoteItem {
    /// Son chemin dans la corbeille, qui est son chemin d'origine : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
}

/// Ce que contient la corbeille.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashInfo {
    /// Les dossiers de la corbeille, chacun suivi des siens.
    pub folders: Vec<String>,
    /// Les notes de la corbeille, triées par chemin.
    pub notes: Vec<TrashedNoteItem>,
}

/// Une pièce jointe ajoutée à une note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AttachedFile {
    /// Le lien Markdown à insérer dans la note, là où le fichier a été collé ou glissé.
    pub markdown: String,
}

/// Un menu de la barre des menus du Mac : son titre et ses éléments, dans l'ordre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppMenu {
    /// Le titre montré dans la barre ; celui du premier menu est remplacé par le nom de l'application.
    pub title: String,
    /// Le rôle que le Mac donne au menu, s'il en a un.
    pub role: Option<MenuRoleItem>,
    /// Les éléments du menu, de haut en bas.
    pub entries: Vec<MenuEntryItem>,
}

/// Le rôle d'un menu pour le Mac : il y ajoute la liste des fenêtres, ou le champ d'aide.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MenuRoleItem {
    /// Le menu Fenêtre.
    Window,
    /// Le menu Aide.
    Help,
}

/// Un élément de menu : une commande de la page, un élément standard du Mac, ou un séparateur.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum MenuEntryItem {
    /// Une commande de la page, renvoyée à la page quand on la choisit.
    Command {
        /// L'identifiant de la commande, le même que dans la palette.
        id: String,
        /// Le nom montré.
        label: String,
        /// Le raccourci, écrit pour le Mac (`Cmd+Shift+N`), ou rien.
        accelerator: Option<String>,
        /// Faux pour un élément grisé.
        enabled: bool,
    },
    /// Un élément que le Mac fait lui-même.
    Standard {
        /// Lequel.
        item: StandardItem,
        /// Le nom montré.
        label: String,
    },
    /// Un trait entre deux groupes d'éléments.
    Separator,
}

/// Les éléments standard du Mac, chacun avec son raccourci habituel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum StandardItem {
    /// À propos de l'application.
    About,
    /// Services.
    Services,
    /// Masquer l'application (Cmd+H).
    Hide,
    /// Masquer les autres (Alt+Cmd+H).
    HideOthers,
    /// Tout afficher.
    ShowAll,
    /// Quitter (Cmd+Q).
    Quit,
    /// Annuler (Cmd+Z).
    Undo,
    /// Rétablir (Cmd+Maj+Z).
    Redo,
    /// Couper (Cmd+X).
    Cut,
    /// Copier (Cmd+C).
    Copy,
    /// Coller (Cmd+V).
    Paste,
    /// Tout sélectionner (Cmd+A).
    SelectAll,
    /// Placer dans le Dock (Cmd+M).
    Minimize,
    /// Réduire/agrandir.
    Zoom,
    /// Tout ramener au premier plan.
    BringAllToFront,
}

/// Une version d'une note, dans l'historique.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VersionItem {
    /// Son identifiant, à renvoyer pour la comparer ou la restaurer : `2026-11-18 14h30`.
    pub id: String,
    /// Sa date, telle que l'historique la montre : `18 novembre 2026 à 14:30`.
    pub label: String,
}

/// D'où vient une ligne de la comparaison entre la note actuelle et une version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum DifferenceKind {
    /// La ligne est dans la note et dans la version.
    Same,
    /// La ligne n'est que dans la note actuelle : restaurer la version la retire.
    Removed,
    /// La ligne n'est que dans la version : restaurer la version la remet.
    Added,
}

/// Une ligne de la comparaison entre la note actuelle et une version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DifferenceItem {
    /// D'où vient la ligne.
    pub kind: DifferenceKind,
    /// Le texte de la ligne.
    pub text: String,
}
