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
    /// Chercher des notes avec l'index : plein texte, étiquette, dossier, type de contenu.
    SearchNotes,
    /// Chercher des notes par ce qu'elles disent plutôt que par leurs mots exacts : la recherche
    /// par le sens, mêlée à celle par les mots.
    SearchByMeaning,
    /// La liste des étiquettes, avec le nombre de notes de chacune.
    ListTags,
    /// Les notes dont un lien entre notes désigne une note.
    LinkingNotes,
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
    /// Ce que l'utilisateur regarde : la note ouverte dans la colonne active, le texte
    /// sélectionné.
    ViewedNote,
    /// Montrer une note à l'utilisateur : l'ouvrir dans la colonne active.
    ShowNote,
}

impl AppTool {
    /// Tous les outils de l'application, dans l'ordre où Claude les découvre.
    pub const ALL: [Self; 23] = [
        Self::SearchNotes,
        Self::SearchByMeaning,
        Self::ListTags,
        Self::LinkingNotes,
        Self::ListTemplates,
        Self::ListVersions,
        Self::ReadVersion,
        Self::CreateNote,
        Self::CreateFolder,
        Self::CreateNoteFromTemplate,
        Self::TrashNote,
        Self::RenameNote,
        Self::MoveNote,
        Self::RestoreVersion,
        Self::AddTags,
        Self::RemoveTags,
        Self::PinNote,
        Self::UnpinNote,
        Self::AddAttachment,
        Self::AddEntry,
        Self::CreateMindMap,
        Self::ViewedNote,
        Self::ShowNote,
    ];

    /// Son nom, tel que le serveur MCP le donne.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::SearchNotes => "search_notes",
            Self::SearchByMeaning => "search_by_meaning",
            Self::ListTags => "list_tags",
            Self::LinkingNotes => "linking_notes",
            Self::ListTemplates => "list_templates",
            Self::ListVersions => "list_versions",
            Self::ReadVersion => "read_version",
            Self::CreateNote => "create_note",
            Self::CreateFolder => "create_folder",
            Self::CreateNoteFromTemplate => "create_note_from_template",
            Self::TrashNote => "trash_note",
            Self::RenameNote => "rename_note",
            Self::MoveNote => "move_note",
            Self::RestoreVersion => "restore_version",
            Self::AddTags => "add_tags",
            Self::RemoveTags => "remove_tags",
            Self::PinNote => "pin_note",
            Self::UnpinNote => "unpin_note",
            Self::AddAttachment => "add_attachment",
            Self::AddEntry => "add_entry",
            Self::CreateMindMap => "create_mind_map",
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
            Self::SearchNotes
            | Self::SearchByMeaning
            | Self::ListTags
            | Self::LinkingNotes
            | Self::ListTemplates
            | Self::ListVersions
            | Self::ReadVersion
            | Self::ViewedNote
            | Self::ShowNote => false,
            Self::CreateNote
            | Self::CreateFolder
            | Self::CreateNoteFromTemplate
            | Self::TrashNote
            | Self::RenameNote
            | Self::MoveNote
            | Self::RestoreVersion
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::CreateMindMap => true,
        }
    }

    /// Le champ de son entrée qui dit ce qu'il vise (la note, la recherche), montré à côté de
    /// l'action dans la colonne ; rien s'il ne vise rien.
    #[must_use]
    pub const fn target_field(self) -> Option<&'static str> {
        match self {
            Self::SearchNotes => Some("query"),
            Self::SearchByMeaning => Some("question"),
            Self::CreateNote | Self::CreateNoteFromTemplate | Self::CreateMindMap => Some("title"),
            Self::CreateFolder
            | Self::LinkingNotes
            | Self::ListVersions
            | Self::ReadVersion
            | Self::TrashNote
            | Self::RenameNote
            | Self::MoveNote
            | Self::RestoreVersion
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::ShowNote => Some("path"),
            Self::ListTags | Self::ListTemplates | Self::ViewedNote => None,
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
mod tests {
    use super::*;

    #[test]
    fn each_tool_is_found_by_its_name_and_its_claude_code_name() {
        for tool in AppTool::ALL {
            assert_eq!(AppTool::named(tool.name()), Some(tool));
            assert_eq!(AppTool::of_full_name(&tool.full_name()), Some(tool));
        }
        assert_eq!(
            AppTool::SearchNotes.full_name(),
            "mcp__malorean__search_notes"
        );
        assert_eq!(AppTool::named("rm"), None);
        assert_eq!(AppTool::SearchByMeaning.name(), "search_by_meaning");
        assert_eq!(
            AppTool::SearchByMeaning.full_name(),
            "mcp__malorean__search_by_meaning"
        );
        assert_eq!(AppTool::ALL[1], AppTool::SearchByMeaning);
    }

    #[test]
    fn a_tool_of_another_server_or_a_built_in_tool_is_not_an_app_tool() {
        assert_eq!(AppTool::of_full_name("search_notes"), None);
        assert_eq!(AppTool::of_full_name("mcp__autre__search_notes"), None);
        assert_eq!(AppTool::of_full_name("mcp__malorean_search_notes"), None);
        assert_eq!(AppTool::of_full_name("Read"), None);
        assert_eq!(AppTool::of_full_name("mcp__malorean__inconnu"), None);
    }

    #[test]
    fn tool_names_are_distinct() {
        let mut names: Vec<_> = AppTool::ALL.iter().map(|tool| tool.name()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), AppTool::ALL.len());
    }

    #[test]
    fn only_the_tools_that_create_change_move_or_trash_a_note_change_notes() {
        let changing: Vec<_> = AppTool::ALL
            .into_iter()
            .filter(|tool| tool.changes_notes())
            .map(AppTool::name)
            .collect();
        assert_eq!(
            changing,
            [
                "create_note",
                "create_folder",
                "create_note_from_template",
                "trash_note",
                "rename_note",
                "move_note",
                "restore_version",
                "add_tags",
                "remove_tags",
                "pin_note",
                "unpin_note",
                "add_attachment",
                "add_entry",
                "create_mind_map"
            ]
        );
    }

    #[test]
    fn each_tool_says_what_it_targets() {
        let targets: Vec<_> = AppTool::ALL.map(AppTool::target_field).into();
        let path = Some("path");
        assert_eq!(
            targets,
            [
                Some("query"),
                Some("question"),
                None,
                path,
                None,
                path,
                path,
                Some("title"),
                path,
                Some("title"),
                path,
                path,
                path,
                path,
                path,
                path,
                path,
                path,
                path,
                path,
                Some("title"),
                None,
                path
            ]
        );
    }

    #[test]
    fn a_key_is_never_empty_and_never_shown() {
        assert_eq!(AppToolsKey::new(""), None);
        let key = AppToolsKey::new("secret").unwrap();
        assert_eq!(key.as_str(), "secret");
        assert_eq!(format!("{key:?}"), "AppToolsKey(..)");
    }
}
