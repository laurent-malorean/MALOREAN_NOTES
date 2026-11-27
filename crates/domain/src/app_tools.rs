//! Outils de l'application : les actions de l'application offertes à Claude dans la colonne
//! Claude Code, par le serveur MCP local (fiche 0040). Ici, leur liste, leurs noms et ce qu'ils
//! font ; rien de leur transport.

/// Le nom du serveur MCP local de l'application, tel que Claude Code le voit : ses outils
/// s'appellent `mcp__malorean_notes__<outil>`.
pub const APP_TOOLS_SERVER: &str = "malorean_notes";

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
    /// Créer un canvas vide selon les règles : titre, nom du fichier tiré du titre (fiche 0087).
    CreateCanvas,
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
    /// Mettre un contenu en favori : une ligne de lien à la fin de la note des favoris (fiche 0102).
    AddFavorite,
    /// Retirer un contenu des favoris : les lignes de la note des favoris qui le désignent
    /// (fiche 0102).
    RemoveFavorite,
    /// Les favoris : la note des favoris et les contenus qu'elle désigne, dans son ordre
    /// (fiche 0102).
    ListFavorites,
    /// Joindre à une note un fichier de l'espace de travail (image ou PDF).
    AddAttachment,
    /// Créer un cahier de recherche selon les règles : titre, nom du fichier tiré du titre ; sans
    /// entrée (fiche 0087).
    CreateResearchNotebook,
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
    /// Déplacer un nœud d'une carte mentale, avec sa branche (fiche 0080).
    MoveMindMapNode,
    /// Supprimer un nœud d'une carte mentale, avec sa branche (fiche 0080).
    DeleteMindMapNode,
    /// Créer un CRM selon les règles : titre, nom du fichier tiré du titre (spécification
    /// `doc/specs/crm.md`, § 13).
    CreateCrm,
    /// Lire un CRM comme des données : colonnes du Kanban, personnes, entreprises, projets,
    /// étapes (fiche 0081).
    ReadCrm,
    /// Créer une action dans un CRM (fiche 0081).
    CreateCrmAction,
    /// Changer une action d'un CRM par un geste de l'interface (fiche 0081).
    ChangeCrmAction,
    /// Mettre une action dans une colonne du Kanban d'un CRM (fiche 0081).
    MoveCrmAction,
    /// Mettre une action d'un CRM à la corbeille (fiche 0081).
    DeleteCrmAction,
    /// Créer une personne dans un CRM (fiche 0081).
    CreateCrmPerson,
    /// Changer une personne d'un CRM par un geste de l'interface (fiche 0081).
    ChangeCrmPerson,
    /// Mettre une personne d'un CRM à la corbeille (fiche 0081).
    DeleteCrmPerson,
    /// Créer une entreprise dans un CRM (fiche 0081).
    CreateCrmCompany,
    /// Changer une entreprise d'un CRM par un geste de l'interface (fiche 0081).
    ChangeCrmCompany,
    /// Mettre une entreprise d'un CRM à la corbeille (fiche 0081).
    DeleteCrmCompany,
    /// Créer un projet dans un CRM (fiche 0081).
    CreateCrmProject,
    /// Changer un projet d'un CRM par un geste de l'interface (fiche 0081).
    ChangeCrmProject,
    /// Mettre un projet d'un CRM à la corbeille (fiche 0081).
    DeleteCrmProject,
    /// Changer les étapes d'un CRM (fiche 0081).
    ChangeCrmStages,
    /// Lire un agenda 12 comme des données : ses événements case par case, dans l'ordre de la
    /// grille, avec ses archives en option (fiche 0104).
    ReadAgenda12,
    /// Ajouter un événement à un agenda 12 : un titre, un mois et les champs facultatifs
    /// (fiche 0104).
    AddAgenda12Event,
    /// Clore un événement d'un agenda 12, avec ou sans copie pour le suivant (fiche 0104).
    CloseAgenda12Event,
    /// Ce que l'utilisateur regarde : la note ouverte dans la colonne active, le texte
    /// sélectionné.
    ViewedNote,
    /// Montrer une note à l'utilisateur : l'ouvrir dans la colonne active.
    ShowNote,
}

impl AppTool {
    /// Tous les outils de l'application, dans l'ordre où Claude les découvre.
    pub const ALL: [Self; 73] = [
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
        Self::CreateCanvas,
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
        Self::AddFavorite,
        Self::RemoveFavorite,
        Self::ListFavorites,
        Self::AddAttachment,
        Self::CreateResearchNotebook,
        Self::AddEntry,
        Self::CreateMindMap,
        Self::ReadMindMap,
        Self::AddMindMapChild,
        Self::AddMindMapSibling,
        Self::AddMindMapRoot,
        Self::EditMindMapNode,
        Self::ColorMindMapNode,
        Self::MoveMindMapNode,
        Self::DeleteMindMapNode,
        Self::CreateCrm,
        Self::ReadCrm,
        Self::CreateCrmAction,
        Self::ChangeCrmAction,
        Self::MoveCrmAction,
        Self::DeleteCrmAction,
        Self::CreateCrmPerson,
        Self::ChangeCrmPerson,
        Self::DeleteCrmPerson,
        Self::CreateCrmCompany,
        Self::ChangeCrmCompany,
        Self::DeleteCrmCompany,
        Self::CreateCrmProject,
        Self::ChangeCrmProject,
        Self::DeleteCrmProject,
        Self::ChangeCrmStages,
        Self::ReadAgenda12,
        Self::AddAgenda12Event,
        Self::CloseAgenda12Event,
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
            Self::CreateCanvas => "create_canvas",
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
            Self::AddFavorite => "add_favorite",
            Self::RemoveFavorite => "remove_favorite",
            Self::ListFavorites => "list_favorites",
            Self::AddAttachment => "add_attachment",
            Self::CreateResearchNotebook => "create_research_notebook",
            Self::AddEntry => "add_entry",
            Self::CreateMindMap => "create_mind_map",
            Self::ReadMindMap => "read_mind_map",
            Self::AddMindMapChild => "add_mind_map_child",
            Self::AddMindMapSibling => "add_mind_map_sibling",
            Self::AddMindMapRoot => "add_mind_map_root",
            Self::EditMindMapNode => "edit_mind_map_node",
            Self::ColorMindMapNode => "color_mind_map_node",
            Self::MoveMindMapNode => "move_mind_map_node",
            Self::DeleteMindMapNode => "delete_mind_map_node",
            Self::CreateCrm => "create_crm",
            Self::ViewedNote => "viewed_note",
            Self::ShowNote => "show_note",
            _ => self.crm_name(),
        }
    }

    /// Le nom de l'un des quinze outils du CRM (fiche 0081), à part pour que chaque fonction de
    /// la liste des outils reste courte ; vide pour un autre outil, dont `name` donne le nom (un
    /// test vérifie que chaque outil a le sien).
    const fn crm_name(self) -> &'static str {
        match self {
            Self::ReadCrm => "read_crm",
            Self::CreateCrmAction => "create_crm_action",
            Self::ChangeCrmAction => "change_crm_action",
            Self::MoveCrmAction => "move_crm_action",
            Self::DeleteCrmAction => "delete_crm_action",
            Self::CreateCrmPerson => "create_crm_person",
            Self::ChangeCrmPerson => "change_crm_person",
            Self::DeleteCrmPerson => "delete_crm_person",
            Self::CreateCrmCompany => "create_crm_company",
            Self::ChangeCrmCompany => "change_crm_company",
            Self::DeleteCrmCompany => "delete_crm_company",
            Self::CreateCrmProject => "create_crm_project",
            Self::ChangeCrmProject => "change_crm_project",
            Self::DeleteCrmProject => "delete_crm_project",
            Self::ChangeCrmStages => "change_crm_stages",
            _ => self.agenda_12_name(),
        }
    }

    /// Le nom de l'un des trois outils de l'agenda 12 (fiche 0104) ; vide pour un autre outil.
    const fn agenda_12_name(self) -> &'static str {
        match self {
            Self::ReadAgenda12 => "read_agenda_12",
            Self::AddAgenda12Event => "add_agenda_12_event",
            Self::CloseAgenda12Event => "close_agenda_12_event",
            _ => "",
        }
    }

    /// L'outil qui porte ce nom, s'il y en a un.
    #[must_use]
    pub fn named(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|tool| tool.name() == name)
    }

    /// Son nom tel que Claude Code le donne : `mcp__malorean_notes__<outil>`.
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
    /// lecture du web. Tout outil qui ne fait pas que lire ou montrer change une note : un outil
    /// neuf est donc retenu tant qu'on ne l'a pas déclaré en lecture seule.
    #[must_use]
    pub const fn changes_notes(self) -> bool {
        !matches!(
            self,
            Self::ListWorkspaces
                | Self::SearchNotes
                | Self::SearchByMeaning
                | Self::ListTags
                | Self::ListFolders
                | Self::LinkingNotes
                | Self::ReadNote
                | Self::ReadCanvas
                | Self::ReadMindMap
                | Self::ReadCrm
                | Self::ReadAgenda12
                | Self::ListTemplates
                | Self::ListVersions
                | Self::ReadVersion
                | Self::ListFavorites
                | Self::ViewedNote
                | Self::ShowNote
        )
    }

    /// Il change un CRM ou l'une de ses fiches (fiche 0081) : les quatorze outils du CRM, qui
    /// passent par les mêmes cas d'usage que l'interface.
    #[must_use]
    pub const fn changes_a_crm(self) -> bool {
        matches!(
            self,
            Self::CreateCrmAction
                | Self::ChangeCrmAction
                | Self::MoveCrmAction
                | Self::DeleteCrmAction
                | Self::CreateCrmPerson
                | Self::ChangeCrmPerson
                | Self::DeleteCrmPerson
                | Self::CreateCrmCompany
                | Self::ChangeCrmCompany
                | Self::DeleteCrmCompany
                | Self::CreateCrmProject
                | Self::ChangeCrmProject
                | Self::DeleteCrmProject
                | Self::ChangeCrmStages
        )
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
    /// l'action dans la colonne ; rien s'il ne vise rien. Le chemin, sauf pour ceux-ci.
    #[must_use]
    pub const fn target_field(self) -> Option<&'static str> {
        match self {
            Self::SearchNotes => Some("query"),
            Self::SearchByMeaning => Some("question"),
            Self::CreateNote
            | Self::CreateNoteFromTemplate
            | Self::CreateMindMap
            | Self::CreateCanvas
            | Self::CreateResearchNotebook
            | Self::CreateCrm => Some("title"),
            Self::ListWorkspaces
            | Self::ListTags
            | Self::ListFolders
            | Self::ListTemplates
            | Self::ListFavorites
            | Self::ViewedNote => None,
            _ => Some("path"),
        }
    }
}

/// Les noms des outils qui changent un CRM, dits dans une phrase : « a, b, … ou z » (fiche 0081).
#[must_use]
pub fn crm_changing_tools_said() -> String {
    let names: Vec<&str> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.changes_a_crm())
        .map(AppTool::name)
        .collect();
    match names.split_last() {
        Some((last, first)) => format!("{} ou {last}", first.join(", ")),
        None => String::new(),
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
