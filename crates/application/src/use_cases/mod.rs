//! Un type par intention de l'utilisateur.

mod attachments;
mod create_note;
mod export;
mod folders;
mod history;
mod index;
mod list_notes;
mod meaning;
mod move_note;
mod note_links;
mod pin_note;
mod read_note;
mod recent_notes;
mod research_notebook;
mod save_note;
mod search_notes;
mod tags;
mod trash;
mod workspace;
mod writing;

pub use attachments::{
    AttachFile, AttachWorkspaceFile, AttachmentSource, LinkDestination, MAX_ATTACHMENT_MEGABYTES,
    OpenLinkTarget,
};
pub use create_note::{CreateDailyNote, CreateNote, CreateNoteFromTemplate};
pub use export::ExportMarkdown;
pub use folders::{CreateFolder, ListFolders, MoveFolder, RenameFolder};
pub use history::{
    CompareVersion, KeepVersion, KeepVersionsBeforeChange, ListVersions, ReadVersion,
    RestoreVersion,
};
pub use index::{ReadIndexStatus, RebuildIndex, RefreshIndex};
pub use list_notes::{ListAllNotes, ListNotes};
pub use meaning::{
    BATCH_SIZE, ChooseModel, ComputeListener, ComputeMeaning, ComputeOutcome, ComputeProgress,
    DownloadModel, MeaningOverview, MeaningUse, MixedResults, ModelOverview, ReadMeaningStatus,
    RebuildMeaning, RelatedNotes, RemoveModel, SEGMENTS_PER_NOTE, SearchByMeaning,
    SearchWithMeaning,
};
pub use move_note::MoveNote;
pub use note_links::{LinkingNote, NoteLinks};
pub use pin_note::PinNote;
pub use read_note::ReadNote;
pub use recent_notes::ListRecentNotes;
pub use research_notebook::{AddEntry, CreateResearchNotebook, ListEntries};
pub use save_note::{SaveNote, SaveOutcome};
pub use search_notes::{MAX_RESULTS, SearchNotes, SearchResult};
pub use tags::{ListTaggedNotes, ListTags};
pub use trash::{Trash, TrashView};
pub use workspace::{ManageWorkspaces, OpenedWorkspace};
pub use writing::{Proposal, ProposeRewriting};
