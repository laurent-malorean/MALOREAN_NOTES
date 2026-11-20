//! Pont entre l'interface et Rust : une commande Tauri par intention.
//! Lit la requête, appelle un cas d'usage, met la réponse en forme. Aucune règle métier.

pub mod commands;
mod dto;
mod error;
#[cfg(target_os = "macos")]
mod pdf;
mod session;

pub use dto::{
    ActionKindItem, AgentStateItem, AppMenu, AssistantStatus, AttachedFile, ChosenFolder,
    ClaudeEventItem, ClaudeModelItem, ClaudeStatusItem, ContentTypeItem, DifferenceItem,
    DifferenceKind, EffortItem, EntryItem, ExcerptPartItem, ExportFile, ExportFormatItem,
    LinkingNoteItem, MenuEntryItem, MenuRoleItem, NoteContent, NoteListItem, NoteOrderItem,
    ProposalItem, SaveResult, SavedNote, SearchResultItem, StandardItem, TagItem, TrashInfo,
    TrashedNoteItem, TurnSettingsItem, VersionItem, WorkspaceChanged, WorkspaceInfo, WorkspaceItem,
    WorkspaceNoteItem, WritingActionItem,
};
pub use error::ApiError;
pub use session::{AppScreen, Session};
