//! Un type par intention de l'utilisateur.

mod agenda_12;
mod attachments;
mod canvas;
mod change_canvas;
mod connection;
mod create_note;
mod crm;
mod crm_fiches;
mod export;
mod favorites;
mod favorites_note;
mod folders;
mod history;
mod index;
mod link_choices;
mod list_notes;
mod mcp_servers;
mod meaning;
mod mind_map;
mod move_note;
mod note_links;
mod pin_note;
mod read_note;
mod read_note_text;
mod recent_notes;
mod rename_note;
mod replace_in_note;
mod research_notebook;
mod save_note;
mod search_notes;
mod tags;
mod trash;
mod voice_input;
mod workspace;
mod writing;

pub use agenda_12::{
    Agenda12View, CellView, ChangeAgenda12Event, ChangeColumns, ChangeLayout, CloseAgenda12Event,
    Closed, Closing, CreateAgenda12, CreateAgenda12Event, DeleteAgenda12Event, EventChange,
    EventDraft, EventEntry, EventView, ReadAgenda12, ReadAgenda12Event, ReopenAgenda12Event,
};
pub use attachments::{
    AttachFile, AttachWorkspaceFile, AttachmentSource, LinkDestination, MAX_ATTACHMENT_MEGABYTES,
    OpenLinkTarget,
};
pub use canvas::{CreateCanvas, ReadCanvas, SaveCanvas, SavedCanvas};
pub use change_canvas::{ChangeCanvas, ChangedCanvas};
pub use connection::{CreateConnectionKey, ReadConnectionKey, RevokeConnectionKey};
pub use create_note::{CreateDailyNote, CreateNote, CreateNoteFromTemplate};
pub use crm::{
    ActionChange, ActionDraft, ApplyGesture, ChangeAction, ChangeCompany, ChangePerson,
    ChangeProject, ChangeStages, CheckEmail, ColumnView, CompanyChange, CompanyEntry, CreateAction,
    CreateCompany, CreateCrm, CreatePerson, CreateProject, CrmView, DeleteAction, DeleteCompany,
    DeletePerson, DeleteProject, MoveAction, NoDataEntry, PersonChange, PersonEntry, Placement,
    ProjectChange, ProjectEntry, ReadCrm, RecoverGestures, StageChange, WeekView,
};
pub use export::ExportMarkdown;
pub use favorites::{FavoriteContent, Favorites, FavoritesList};
pub use favorites_note::{FavoritesNote, ManageFavoritesNote};
pub use folders::{CreateFolder, ListFolders, ListShownFolders, MoveFolder, RenameFolder};
pub use history::{
    CompareVersion, KeepVersion, KeepVersionsBeforeChange, ListVersions, ReadVersion,
    RestoreVersion,
};
pub use index::{ReadIndexStatus, RebuildIndex, RefreshIndex};
pub use link_choices::{LinkChoices, LinkableContent};
pub use list_notes::{ListAllNotes, ListNotes};
pub use mcp_servers::{McpServers, ServersListing};
pub use meaning::{
    BATCH_SIZE, ChooseModel, ComputeListener, ComputeMeaning, ComputeOutcome, ComputeProgress,
    DownloadModel, MeaningOverview, MeaningUse, MixedResults, ModelOverview, ReadMeaningStatus,
    RebuildMeaning, RelatedNotes, RemoveModel, SEGMENTS_PER_NOTE, SearchByMeaning,
    SearchWithMeaning,
};
pub use mind_map::{CreateMindMap, EditMindMap, EditedMindMap, ReadMindMap, SaveMindMap};
pub use move_note::MoveNote;
pub use note_links::{LinkingNote, NoteLinks};
pub use pin_note::PinNote;
pub use read_note::ReadNote;
pub use read_note_text::{NoteText, ReadNoteText};
pub use recent_notes::ListRecentNotes;
pub use rename_note::{RenameNote, RenamedNote};
pub use replace_in_note::{ReplaceInNote, ReplacedNote};
pub use research_notebook::{AddEntry, CreateResearchNotebook, ListEntries};
pub use save_note::{SaveNote, SaveOutcome};
pub use search_notes::{MAX_RESULTS, SearchNotes, SearchResult};
pub use tags::{ChangeTags, ListTaggedNotes, ListTags, ReadTags};
pub use trash::{Trash, TrashView};
pub use voice_input::{VoiceInput, VoiceSettings, VoiceStatus};
pub use workspace::{ManageWorkspaces, OpenedWorkspace};
pub use writing::{Proposal, ProposeRewriting};
