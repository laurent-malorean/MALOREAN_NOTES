//! Pont entre l'interface et Rust : une commande Tauri par intention.
//! Lit la requête, appelle un cas d'usage, met la réponse en forme. Aucune règle métier.

pub mod commands;
mod dto;
mod error;
#[cfg(target_os = "macos")]
mod pdf;
mod session;

pub use dto::{
    AppMenu, AssistantStatus, AttachedFile, ChosenFolder, ClaudeStatusItem, DifferenceItem,
    DifferenceKind, ExcerptPartItem, ExportFile, ExportFormatItem, LinkingNoteItem, MenuEntryItem,
    MenuRoleItem, NoteContent, NoteListItem, NoteOrderItem, ProposalItem, SaveResult, SavedNote,
    SearchResultItem, StandardItem, TagItem, TrashInfo, TrashedNoteItem, VersionItem,
    WorkspaceChanged, WorkspaceInfo, WorkspaceItem, WorkspaceNoteItem, WritingActionItem,
};
pub use error::ApiError;
pub use session::Session;
