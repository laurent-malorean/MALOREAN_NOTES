//! Pont entre l'interface et Rust : une commande Tauri par intention.
//! Lit la requête, appelle un cas d'usage, met la réponse en forme. Aucune règle métier.

pub mod commands;
mod dto;
mod error;
#[cfg(target_os = "macos")]
mod pdf;
mod session;

pub use dto::{
    ActionKindItem, ActionPersonItem, AgentStateItem, AiWorkspaceItem, AppMenu, AssistantStatus,
    AttachedFile, BodyChangeItem, CanvasArrowItem, CanvasCardItem, CanvasExtraItem, CanvasFileItem,
    CanvasItem, ChecklistEntryItem, ChecklistItem, ChosenFolder, ClaudeEventItem, ClaudeModelItem,
    ClaudeStatusItem, ColumnItem, CommentItem, CompanyChoiceItem, ConnectionInfo,
    ConnectionKeyItem, ContentTypeItem, CrmActionChangeItem, CrmActionDraftItem, CrmActionItem,
    CrmCompanyChangeItem, CrmCompanyItem, CrmFiltersItem, CrmItem, CrmPersonChangeItem,
    CrmPersonItem, CrmProjectChangeItem, CrmProjectItem, DifferenceItem, DifferenceKind,
    EffortItem, EntryItem, ExcerptPartItem, ExportFile, ExportFormatItem, FavoritesNoteItem,
    IndexOverviewItem, LinkResolutionItem, LinkableItem, LinkingNoteItem, MeaningOverviewItem,
    MeaningProgressItem, MeaningSearchItem, MeaningUseItem, MenuEntryItem, MenuRoleItem,
    MindMapItem, MindNodeItem, ModelDownloadItem, ModelOverviewItem, NoDataItem, NoteContent,
    NoteListItem, NoteOrderItem, PassageItem, PlaceItem, PlacementItem, ProposalItem,
    RemovedLineItem, SaveResult, SavedNote, SearchResultItem, StageChangeItem, StandardItem,
    TagItem, TallyItem, TemplatesFolderItem, TrashInfo, TrashedNoteItem, TurnSettingsItem,
    UrgencyItem, VersionItem, WeekDayItem, WeekItem, WorkspaceChanged, WorkspaceInfo,
    WorkspaceItem, WorkspaceNoteItem, WritingActionItem,
};
pub use error::ApiError;
pub use session::{AppScreen, MeaningEvents, Session};
