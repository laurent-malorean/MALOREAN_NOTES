//! Outils de l'application : les actions de l'application offertes à Claude dans la colonne
//! Claude Code, par le serveur MCP local (fiche 0040). Ici, leur liste, leurs noms et ce qu'ils
//! font ; rien de leur transport.

/// Le nom du serveur MCP local de l'application, tel que Claude Code le voit : ses outils
/// s'appellent `mcp__malorean__<outil>`.
pub const APP_TOOLS_SERVER: &str = "malorean";

/// Ce que Claude Code met devant le nom d'un outil d'un serveur MCP.
const MCP_PREFIX: &str = "mcp__";

/// Un outil de l'application.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AppTool {
    /// Les espaces de travail que l'utilisateur a autorisés pour les IA, avec celui qui est
    /// ouvert (fiche 0074).
    ListWorkspaces,
    /// Chercher des notes avec l'index : plein texte, étiquette, dossier, type de contenu.
    SearchNotes,
    /// Chercher des notes par ce qu'elles disent plutôt que par leurs mots exacts : la recherche
    /// par le sens, mêlée à celle par les mots.
    SearchByMeaning,
    /// La liste des étiquettes, avec le nombre de notes de chacune.
    ListTags,
    /// L'arbre des dossiers d'un espace de travail, par leurs chemins (fiche 0078).
    ListFolders,
    /// Les notes dont un lien entre notes désigne une note.
    LinkingNotes,
    /// Le texte entier d'une note simple, son en-tête à part du corps (fiche 0076).
    ReadNote,
    /// Lire un canvas comme des données : cartes, flèches, groupes (fiche 0079).
    ReadCanvas,
    /// Les noms des modèles de note.
    ListTemplates,
    /// Les versions d'une note.
    ListVersions,
    /// Le texte d'une version d'une note.
    ReadVersion,
    /// Créer une note selon les règles : titre, nom du fichier tiré du titre.
    CreateNote,
    /// Créer un dossier, avec ceux qui manquent sur son chemin.
    CreateFolder,
    /// Renommer un dossier, qui reste à sa place avec tout son contenu (fiche 0078).
    RenameFolder,
    /// Déplacer un dossier dans un autre, avec tout son contenu (fiche 0078).
    MoveFolder,
    /// Mettre un dossier, avec tout son contenu, à la corbeille (fiche 0078).
    TrashFolder,
    /// Créer une note depuis un modèle de note, nommé, avec un titre.
    CreateNoteFromTemplate,
    /// Mettre une note à la corbeille.
    TrashNote,
    /// Changer le titre d'une note, et donc son nom de fichier.
    RenameNote,
    /// Ranger une note dans un autre dossier.
    MoveNote,
    /// Remettre dans une note le texte d'une de ses versions.
    RestoreVersion,
    /// Remplacer un texte par un autre dans le texte d'une note simple (fiche 0075).
    ReplaceInNote,
    /// Ajouter une carte (texte, fichier ou page web) à un canvas (fiche 0079).
    AddCanvasCard,
    /// Changer le texte, l'adresse, le fichier ou la couleur d'une carte de canvas (fiche 0079).
    ChangeCanvasCard,
    /// Déplacer une carte de canvas, avec les cartes de son groupe s'il en est un (fiche 0079).
    MoveCanvasCard,
    /// Redimensionner une carte de canvas (fiche 0079).
    ResizeCanvasCard,
    /// Retirer une carte d'un canvas, avec les flèches qui y touchent (fiche 0079).
    RemoveCanvasCard,
    /// Ajouter une flèche entre deux cartes d'un canvas (fiche 0079).
    AddCanvasArrow,
    /// Changer le sens, l'étiquette, la couleur ou les extrémités d'une flèche de canvas (fiche 0079).
    ChangeCanvasArrow,
    /// Retirer une flèche d'un canvas (fiche 0079).
    RemoveCanvasArrow,
    /// Ajouter un groupe à un canvas, vide ou autour de cartes (fiche 0079).
    AddCanvasGroup,
    /// Changer le nom ou la couleur d'un groupe de canvas (fiche 0079).
    ChangeCanvasGroup,
    /// Ajouter des étiquettes dans l'en-tête d'une note.
    AddTags,
    /// Retirer des étiquettes de l'en-tête d'une note.
    RemoveTags,
    /// Épingler une note.
    PinNote,
    /// Désépingler une note.
    UnpinNote,
    /// Joindre à une note un fichier de l'espace de travail (image ou PDF).
    AddAttachment,
    /// Ajouter une entrée à la fin d'un cahier de recherche, ou une correction d'une de ses
    /// entrées : jamais rien changer d'autre.
    AddEntry,
    /// Créer une carte mentale selon les règles : titre, nom du fichier tiré du titre, liste de
    /// départ facultative.
    CreateMindMap,
    /// Créer un CRM selon les règles : titre, nom du fichier tiré du titre (spécification
    /// `doc/specs/crm.md`, § 13).
    CreateCrm,
    /// Lire un CRM comme des données : colonnes du Kanban, personnes, entreprises, projets,
    /// étapes (fiche 0081).
    ReadCrm,
    /// Ce que l'utilisateur regarde : la note ouverte dans la colonne active, le texte
    /// sélectionné.
    ViewedNote,
    /// Montrer une note à l'utilisateur : l'ouvrir dans la colonne active.
    ShowNote,
}

impl AppTool {
    /// Tous les outils de l'application, dans l'ordre où Claude les découvre.
    pub const ALL: [Self; 43] = [
        Self::ListWorkspaces,
        Self::SearchNotes,
        Self::SearchByMeaning,
        Self::ListTags,
        Self::ListFolders,
        Self::LinkingNotes,
        Self::ReadNote,
        Self::ReadCanvas,
        Self::ListTemplates,
        Self::ListVersions,
        Self::ReadVersion,
        Self::CreateNote,
        Self::CreateFolder,
        Self::RenameFolder,
        Self::MoveFolder,
        Self::TrashFolder,
        Self::CreateNoteFromTemplate,
        Self::TrashNote,
        Self::RenameNote,
        Self::MoveNote,
        Self::RestoreVersion,
        Self::ReplaceInNote,
        Self::AddCanvasCard,
        Self::ChangeCanvasCard,
        Self::MoveCanvasCard,
        Self::ResizeCanvasCard,
        Self::RemoveCanvasCard,
        Self::AddCanvasArrow,
        Self::ChangeCanvasArrow,
        Self::RemoveCanvasArrow,
        Self::AddCanvasGroup,
        Self::ChangeCanvasGroup,
        Self::AddTags,
        Self::RemoveTags,
        Self::PinNote,
        Self::UnpinNote,
        Self::AddAttachment,
        Self::AddEntry,
        Self::CreateMindMap,
        Self::CreateCrm,
        Self::ReadCrm,
        Self::ViewedNote,
        Self::ShowNote,
    ];

    /// Son nom, tel que le serveur MCP le donne.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::ListWorkspaces => "list_workspaces",
            Self::SearchNotes => "search_notes",
            Self::SearchByMeaning => "search_by_meaning",
            Self::ListTags => "list_tags",
            Self::ListFolders => "list_folders",
            Self::LinkingNotes => "linking_notes",
            Self::ReadNote => "read_note",
            Self::ReadCanvas => "read_canvas",
            Self::ListTemplates => "list_templates",
            Self::ListVersions => "list_versions",
            Self::ReadVersion => "read_version",
            Self::CreateNote => "create_note",
            Self::CreateFolder => "create_folder",
            Self::RenameFolder => "rename_folder",
            Self::MoveFolder => "move_folder",
            Self::TrashFolder => "trash_folder",
            Self::CreateNoteFromTemplate => "create_note_from_template",
            Self::TrashNote => "trash_note",
            Self::RenameNote => "rename_note",
            Self::MoveNote => "move_note",
            Self::RestoreVersion => "restore_version",
            Self::ReplaceInNote => "replace_in_note",
            Self::AddCanvasCard => "add_canvas_card",
            Self::ChangeCanvasCard => "change_canvas_card",
            Self::MoveCanvasCard => "move_canvas_card",
            Self::ResizeCanvasCard => "resize_canvas_card",
            Self::RemoveCanvasCard => "remove_canvas_card",
            Self::AddCanvasArrow => "add_canvas_arrow",
            Self::ChangeCanvasArrow => "change_canvas_arrow",
            Self::RemoveCanvasArrow => "remove_canvas_arrow",
            Self::AddCanvasGroup => "add_canvas_group",
            Self::ChangeCanvasGroup => "change_canvas_group",
            Self::AddTags => "add_tags",
            Self::RemoveTags => "remove_tags",
            Self::PinNote => "pin_note",
            Self::UnpinNote => "unpin_note",
            Self::AddAttachment => "add_attachment",
            Self::AddEntry => "add_entry",
            Self::CreateMindMap => "create_mind_map",
            Self::CreateCrm => "create_crm",
            Self::ReadCrm => "read_crm",
            Self::ViewedNote => "viewed_note",
            Self::ShowNote => "show_note",
        }
    }

    /// L'outil qui porte ce nom, s'il y en a un.
    #[must_use]
    pub fn named(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|tool| tool.name() == name)
    }

    /// Son nom tel que Claude Code le donne : `mcp__malorean__<outil>`.
    #[must_use]
    pub fn full_name(self) -> String {
        format!("{MCP_PREFIX}{APP_TOOLS_SERVER}__{}", self.name())
    }

    /// L'outil que désigne ce nom de Claude Code, s'il est un outil de l'application.
    #[must_use]
    pub fn of_full_name(full_name: &str) -> Option<Self> {
        let name = full_name
            .strip_prefix(MCP_PREFIX)?
            .strip_prefix(APP_TOOLS_SERVER)?
            .strip_prefix("__")?;
        Self::named(name)
    }

    /// Il crée, change, déplace ou jette une note : le garde-fou du web le retient après une
    /// lecture du web.
    #[must_use]
    pub const fn changes_notes(self) -> bool {
        match self {
            Self::ListWorkspaces
            | Self::SearchNotes
            | Self::SearchByMeaning
            | Self::ListTags
            | Self::ListFolders
            | Self::LinkingNotes
            | Self::ReadNote
            | Self::ReadCanvas
            | Self::ReadCrm
            | Self::ListTemplates
            | Self::ListVersions
            | Self::ReadVersion
            | Self::ViewedNote
            | Self::ShowNote => false,
            Self::CreateNote
            | Self::CreateFolder
            | Self::RenameFolder
            | Self::MoveFolder
            | Self::TrashFolder
            | Self::CreateNoteFromTemplate
            | Self::TrashNote
            | Self::RenameNote
            | Self::MoveNote
            | Self::RestoreVersion
            | Self::ReplaceInNote
            | Self::AddCanvasCard
            | Self::ChangeCanvasCard
            | Self::MoveCanvasCard
            | Self::ResizeCanvasCard
            | Self::RemoveCanvasCard
            | Self::AddCanvasArrow
            | Self::ChangeCanvasArrow
            | Self::RemoveCanvasArrow
            | Self::AddCanvasGroup
            | Self::ChangeCanvasGroup
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::CreateMindMap
            | Self::CreateCrm => true,
        }
    }

    /// Il parle de l'écran de l'utilisateur (la note qu'il regarde, la note qu'on lui montre) :
    /// il ne vise que l'espace de travail ouvert, jamais un espace ouvert en arrière-plan.
    #[must_use]
    pub const fn uses_screen(self) -> bool {
        matches!(self, Self::ViewedNote | Self::ShowNote)
    }

    /// Il lit ou écrit dans un espace de travail : il accepte le paramètre `workspace` (tous sauf
    /// la liste des espaces, qui parle de tous).
    #[must_use]
    pub const fn aims_at_a_workspace(self) -> bool {
        !matches!(self, Self::ListWorkspaces)
    }

    /// Le champ de son entrée qui dit ce qu'il vise (la note, la recherche), montré à côté de
    /// l'action dans la colonne ; rien s'il ne vise rien.
    #[must_use]
    pub const fn target_field(self) -> Option<&'static str> {
        match self {
            Self::SearchNotes => Some("query"),
            Self::SearchByMeaning => Some("question"),
            Self::CreateNote
            | Self::CreateNoteFromTemplate
            | Self::CreateMindMap
            | Self::CreateCrm => Some("title"),
            Self::CreateFolder
            | Self::RenameFolder
            | Self::MoveFolder
            | Self::TrashFolder
            | Self::LinkingNotes
            | Self::ReadNote
            | Self::ReadCanvas
            | Self::ReadCrm
            | Self::ListVersions
            | Self::ReadVersion
            | Self::TrashNote
            | Self::RenameNote
            | Self::MoveNote
            | Self::RestoreVersion
            | Self::ReplaceInNote
            | Self::AddCanvasCard
            | Self::ChangeCanvasCard
            | Self::MoveCanvasCard
            | Self::ResizeCanvasCard
            | Self::RemoveCanvasCard
            | Self::AddCanvasArrow
            | Self::ChangeCanvasArrow
            | Self::RemoveCanvasArrow
            | Self::AddCanvasGroup
            | Self::ChangeCanvasGroup
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::ShowNote => Some("path"),
            Self::ListWorkspaces
            | Self::ListTags
            | Self::ListFolders
            | Self::ListTemplates
            | Self::ViewedNote => None,
        }
    }
}

/// La clé qui ouvre les outils de l'application pour un seul tour : le relais la présente à
/// l'application, qui refuse toute demande sans la clé du tour en cours ; jamais vide.
#[derive(Clone, PartialEq, Eq)]
pub struct AppToolsKey(String);

impl AppToolsKey {
    /// La clé `key`, si elle n'est pas vide.
    #[must_use]
    pub fn new(key: impl Into<String>) -> Option<Self> {
        let key = key.into();
        (!key.is_empty()).then_some(Self(key))
    }

    /// La clé telle qu'elle est présentée.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for AppToolsKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("AppToolsKey(..)")
    }
}

#[cfg(test)]
#[path = "app_tools_tests.rs"]
mod tests;
