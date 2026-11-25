//! Le CRM (spécification `doc/specs/crm.md`, fiche 0057) : les règles pures de ses fiches (CRM,
//! entreprises, personnes, actions, projets), leur format de fichier et les calculs de ses vues.
//! Aucun accès au disque ni à l'horloge : le jour d'aujourd'hui est toujours donné.

mod action;
mod action_body;
pub mod action_write;
pub mod company;
mod crm_note;
mod day;
mod header;
mod kind;
mod name;
mod palette;
pub mod person;
pub mod project;
mod reference;
mod stage;
mod text;
mod under_title;

pub use action::{Action, ActionPerson, Channel};
pub use action_body::{Body, Checklist, ChecklistItem, Comment};
pub use company::{Company, CompanyField, NODATA};
pub use crm_note::{Crm, read_stages, with_stages};
pub use day::{Day, DayTime, InvalidDay};
pub use kind::{CrmKind, Unreadable};
pub use name::{Name, NameError, action_file_name, email_is_known, file_name_of, with_name};
pub use palette::Color;
pub use person::{Passage, Person, PersonField};
pub use project::Project;
pub use reference::Reference;
pub use stage::{
    CANCEL, DEFAULT_STAGES, DONE, MAX_STAGE_NAME, Stage, StageError, Stages, Status, TODO,
};
