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
    /// Lire une carte mentale en arbre : chaque nœud avec son chemin, son titre, sa couleur et son
    /// détail (fiche 0080).
    ReadMindMap,
    /// Ajouter un dernier enfant à un nœud d'une carte mentale (fiche 0080).
    AddMindMapChild,
    /// Ajouter un frère juste en dessous d'un nœud d'une carte mentale (fiche 0080).
    AddMindMapSibling,
    /// Ajouter un nœud racine à la fin d'une carte mentale (fiche 0080).
    AddMindMapRoot,
    /// Changer le titre et/ou le détail d'un nœud d'une carte mentale (fiche 0080).
    EditMindMapNode,
    /// Changer la couleur d'un nœud d'une carte mentale, parmi la palette (fiche 0080).
    ColorMindMapNode,
    /// Créer un CRM selon les règles : titre, nom du fichier tiré du titre (spécification
    /// `doc/specs/crm.md`, § 13).
    CreateCrm,
    /// Ce que l'utilisateur regarde : la note ouverte dans la colonne active, le texte
    /// sélectionné.
    ViewedNote,
    /// Montrer une note à l'utilisateur : l'ouvrir dans la colonne active.
    ShowNote,
}

impl AppTool {
    /// Tous les outils de l'application, dans l'ordre où Claude les découvre.
    pub const ALL: [Self; 37] = [
        Self::ListWorkspaces,
        Self::SearchNotes,
        Self::SearchByMeaning,
        Self::ListTags,
        Self::ListFolders,
        Self::LinkingNotes,
        Self::ReadNote,
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
        Self::AddTags,
        Self::RemoveTags,
        Self::PinNote,
        Self::UnpinNote,
        Self::AddAttachment,
        Self::AddEntry,
        Self::CreateMindMap,
        Self::ReadMindMap,
        Self::AddMindMapChild,
        Self::AddMindMapSibling,
        Self::AddMindMapRoot,
        Self::EditMindMapNode,
        Self::ColorMindMapNode,
        Self::CreateCrm,
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
            Self::AddTags => "add_tags",
            Self::RemoveTags => "remove_tags",
            Self::PinNote => "pin_note",
            Self::UnpinNote => "unpin_note",
            Self::AddAttachment => "add_attachment",
            Self::AddEntry => "add_entry",
            Self::CreateMindMap => "create_mind_map",
            Self::ReadMindMap => "read_mind_map",
            Self::AddMindMapChild => "add_mind_map_child",
            Self::AddMindMapSibling => "add_mind_map_sibling",
            Self::AddMindMapRoot => "add_mind_map_root",
            Self::EditMindMapNode => "edit_mind_map_node",
            Self::ColorMindMapNode => "color_mind_map_node",
            Self::CreateCrm => "create_crm",
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
            | Self::ReadMindMap
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
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::CreateMindMap
            | Self::AddMindMapChild
            | Self::AddMindMapSibling
            | Self::AddMindMapRoot
            | Self::EditMindMapNode
            | Self::ColorMindMapNode
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
            | Self::ListVersions
            | Self::ReadVersion
            | Self::TrashNote
            | Self::RenameNote
            | Self::MoveNote
            | Self::RestoreVersion
            | Self::ReplaceInNote
            | Self::AddTags
            | Self::RemoveTags
            | Self::PinNote
            | Self::UnpinNote
            | Self::AddAttachment
            | Self::AddEntry
            | Self::ReadMindMap
            | Self::AddMindMapChild
            | Self::AddMindMapSibling
            | Self::AddMindMapRoot
            | Self::EditMindMapNode
            | Self::ColorMindMapNode
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
mod tests {
    use super::*;

    #[test]
    fn only_the_two_tools_that_talk_about_the_screen_use_it() {
        let using: Vec<_> = AppTool::ALL.iter().filter(|t| t.uses_screen()).collect();
        assert_eq!(using, [&AppTool::ViewedNote, &AppTool::ShowNote]);
    }

    #[test]
    fn every_tool_but_the_list_of_workspaces_aims_at_a_workspace() {
        let others: Vec<_> = AppTool::ALL
            .iter()
            .filter(|t| !t.aims_at_a_workspace())
            .collect();
        assert_eq!(others, [&AppTool::ListWorkspaces]);
    }

    #[test]
    fn the_list_of_workspaces_reads_without_changing_and_has_no_target() {
        assert_eq!(AppTool::ListWorkspaces.name(), "list_workspaces");
        assert_eq!(
            AppTool::ListWorkspaces.full_name(),
            "mcp__malorean__list_workspaces"
        );
        assert!(!AppTool::ListWorkspaces.changes_notes());
        assert_eq!(AppTool::ListWorkspaces.target_field(), None);
        assert_eq!(AppTool::ALL[0], AppTool::ListWorkspaces);
    }

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
        assert_eq!(AppTool::ALL[2], AppTool::SearchByMeaning);
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
                "rename_folder",
                "move_folder",
                "trash_folder",
                "create_note_from_template",
                "trash_note",
                "rename_note",
                "move_note",
                "restore_version",
                "replace_in_note",
                "add_tags",
                "remove_tags",
                "pin_note",
                "unpin_note",
                "add_attachment",
                "add_entry",
                "create_mind_map",
                "add_mind_map_child",
                "add_mind_map_sibling",
                "add_mind_map_root",
                "edit_mind_map_node",
                "color_mind_map_node",
                "create_crm"
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
                None,
                Some("query"),
                Some("question"),
                None,
                None,
                path,
                path,
                None,
                path,
                path,
                Some("title"),
                path,
                path,
                path,
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
                path,
                Some("title"),
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
    fn reading_a_note_changes_nothing_and_targets_its_path() {
        let tool = AppTool::ReadNote;
        assert_eq!(tool.name(), "read_note");
        assert_eq!(tool.full_name(), "mcp__malorean__read_note");
        assert_eq!(
            AppTool::of_full_name("mcp__malorean__read_note"),
            Some(tool)
        );
        assert!(!tool.changes_notes());
        assert!(tool.aims_at_a_workspace());
        assert!(!tool.uses_screen());
        assert_eq!(tool.target_field(), Some("path"));
        let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
        assert_eq!(AppTool::ALL[at - 1], AppTool::LinkingNotes);
    }

    #[test]
    fn reading_a_mind_map_changes_nothing_and_targets_its_path() {
        let tool = AppTool::ReadMindMap;
        assert_eq!(tool.name(), "read_mind_map");
        assert_eq!(tool.full_name(), "mcp__malorean__read_mind_map");
        assert_eq!(
            AppTool::of_full_name("mcp__malorean__read_mind_map"),
            Some(tool)
        );
        assert!(!tool.changes_notes());
        assert!(tool.aims_at_a_workspace());
        assert!(!tool.uses_screen());
        assert_eq!(tool.target_field(), Some("path"));
        let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
        assert_eq!(AppTool::ALL[at - 1], AppTool::CreateMindMap);
    }

    #[test]
    fn replacing_a_text_changes_a_note_and_targets_its_path() {
        let tool = AppTool::ReplaceInNote;
        assert_eq!(tool.name(), "replace_in_note");
        assert_eq!(tool.full_name(), "mcp__malorean__replace_in_note");
        assert!(tool.changes_notes());
        assert!(tool.aims_at_a_workspace());
        assert!(!tool.uses_screen());
        assert_eq!(tool.target_field(), Some("path"));
        let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
        assert_eq!(AppTool::ALL[at - 1], AppTool::RestoreVersion);
    }

    #[test]
    fn the_folder_tools_are_named_ordered_and_guarded_as_their_decision_says() {
        let names: Vec<_> = AppTool::ALL
            .into_iter()
            .filter(|tool| tool.name().ends_with("_folder") || tool.name() == "list_folders")
            .map(AppTool::name)
            .collect();
        assert_eq!(
            names,
            [
                "list_folders",
                "create_folder",
                "rename_folder",
                "move_folder",
                "trash_folder"
            ]
        );
        assert_eq!(
            AppTool::TrashFolder.full_name(),
            "mcp__malorean__trash_folder"
        );
        assert_eq!(
            AppTool::of_full_name("mcp__malorean__rename_folder"),
            Some(AppTool::RenameFolder)
        );
        assert!(!AppTool::ListFolders.changes_notes());
        assert_eq!(AppTool::ListFolders.target_field(), None);
        for tool in [
            AppTool::ListFolders,
            AppTool::RenameFolder,
            AppTool::MoveFolder,
            AppTool::TrashFolder,
        ] {
            assert!(tool.aims_at_a_workspace(), "{tool:?}");
            assert!(!tool.uses_screen(), "{tool:?}");
        }
    }

    #[test]
    fn a_key_is_never_empty_and_never_shown() {
        assert_eq!(AppToolsKey::new(""), None);
        let key = AppToolsKey::new("secret").unwrap();
        assert_eq!(key.as_str(), "secret");
        assert_eq!(format!("{key:?}"), "AppToolsKey(..)");
    }
}
