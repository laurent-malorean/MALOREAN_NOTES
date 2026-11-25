//! Les actions d'un CRM (spécification §§ 5.3, 7.1, 8 et 10) : en créer une, la changer geste par
//! geste, la déplacer dans le Kanban, la supprimer.

use domain::NotePath;
use domain::crm::action_write::{
    with_body, with_channel, with_color, with_date, with_linked_notes, with_people, with_project,
    with_rank, with_status, with_tags, without_person,
};
use domain::crm::kanban::{columns, placed_ranks};
use domain::crm::{
    Action, ActionPerson, Body, BodyChange, Channel, Color, CrmKind, Day, DayTime, Name, Person,
    Reference, Stages, Status, action_file_name, with_name,
};

use super::files::{CrmFiles, FicheText};
use super::gesture::ApplyGesture;
use super::today_of;
use crate::use_cases::Trash;
use crate::{AppError, Clock, Gesture, GestureStep, NoteStore, PendingGestures};

/// Ce que l'utilisateur donne pour créer une action (spécification § 8) ; le reste (rang, listes à
/// cocher, commentaires) naît vide.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ActionDraft {
    /// Son titre.
    pub title: String,
    /// Le nom de sa colonne ; « TODO » sans nom.
    pub status: Option<String>,
    /// Le jour où elle est à faire ; aujourd'hui sans jour.
    pub date: Option<Day>,
    /// Ses personnes, sans doublon.
    pub people: Vec<Reference>,
    /// Son canal.
    pub channel: Option<Channel>,
    /// Son projet.
    pub project: Option<Reference>,
    /// Sa couleur d'action.
    pub color: Option<Color>,
    /// Ses étiquettes.
    pub tags: Vec<String>,
    /// Ses notes liées.
    pub linked_notes: Vec<Reference>,
    /// Sa description.
    pub description: String,
}

/// Créer une action.
#[derive(Debug)]
pub struct CreateAction<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CreateAction<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Écrit l'action décrite par `draft` dans le CRM `crm`, sous le nom « date de création, titre »,
    /// et rend sa référence. Chaque personne y entre avec son entreprise de ce moment. Le dossier des
    /// actions naît avec la première.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::CrmName`] si le titre est
    /// vide ou sur plusieurs lignes ; [`AppError::UnknownStatus`] si la colonne n'existe pas ;
    /// [`AppError::FicheGone`] si une personne ou le projet n'existe plus ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, draft: ActionDraft) -> Result<Reference, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let today = today_of(self.clock)?;
        let title = Name::parse(&draft.title)?;
        let status = match &draft.status {
            Some(name) => status_of(&files, name)?,
            None => Status::Todo,
        };
        let people = people_of(&files, &draft.people)?;
        if let Some(project) = &draft.project {
            files.read(CrmKind::Project, project)?;
        }
        let taken = files.names(CrmKind::Action)?;
        let file = action_file_name(today, &title, |candidate| taken.contains(candidate));
        let name = Reference::to(file.stem())
            .ok_or_else(|| AppError::InvalidReference(file.stem().to_owned()))?;
        let action = Action {
            name,
            title: title.as_str().to_owned(),
            people,
            status,
            date: Some(draft.date.unwrap_or(today)),
            channel: draft.channel,
            project: draft.project,
            color: draft.color,
            tags: draft.tags,
            linked_notes: draft.linked_notes,
            rank: None,
            body: Body {
                description: draft.description,
                ..Body::default()
            },
        };
        files.write_new(CrmKind::Action, &file, &action.to_content())
    }
}

/// Le statut de la colonne que le CRM a sous ce nom.
fn status_of(files: &CrmFiles<'_>, name: &str) -> Result<Status, AppError> {
    Status::column(name, files.stages()).ok_or_else(|| AppError::UnknownStatus(name.to_owned()))
}

/// Les personnes données à une action, chacune avec son entreprise de ce moment ; une personne
/// citée deux fois n'entre qu'une fois.
fn people_of(files: &CrmFiles<'_>, people: &[Reference]) -> Result<Vec<ActionPerson>, AppError> {
    let mut given: Vec<ActionPerson> = Vec::new();
    for reference in people {
        if given.iter().any(|known| known.person == *reference) {
            continue;
        }
        given.push(action_person(files, reference)?);
    }
    Ok(given)
}

fn action_person(files: &CrmFiles<'_>, reference: &Reference) -> Result<ActionPerson, AppError> {
    let fiche = files.read(CrmKind::Person, reference)?;
    let person = Person::parse(&fiche.content).map_err(|_| AppError::FicheGone)?;
    Ok(ActionPerson {
        person: reference.clone(),
        company: person.company,
    })
}

/// Un geste sur une action : un seul champ change, sur la version la plus récente du fichier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionChange {
    /// Son titre.
    Title(String),
    /// Le nom de sa colonne ; son rang s'efface.
    Status(String),
    /// Le jour où elle est à faire, ou faite.
    Date(Day),
    /// Son canal.
    Channel(Option<Channel>),
    /// Son projet.
    Project(Option<Reference>),
    /// Sa couleur d'action.
    Color(Option<Color>),
    /// Ses étiquettes.
    Tags(Vec<String>),
    /// Ses notes liées.
    LinkedNotes(Vec<Reference>),
    /// Donner une personne à l'action, avec son entreprise de ce moment.
    AddPerson(Reference),
    /// Retirer une personne de l'action.
    RemovePerson(Reference),
    /// Sa description ou ses listes à cocher.
    Body(BodyChange),
    /// Ajouter un commentaire daté de maintenant (heure du Mac).
    AddComment(String),
}

/// Changer une action.
#[derive(Debug)]
pub struct ChangeAction<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> ChangeAction<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Fait ce geste sur l'action `action` du CRM `crm` ; le texte de l'action est relu juste
    /// avant, pour ne changer que le champ touché.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si l'action (ou
    /// la personne ou le projet donné) n'existe plus ; [`AppError::CrmName`],
    /// [`AppError::UnknownStatus`] ou [`AppError::CrmBody`] si le geste est refusé ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        action: &Reference,
        change: ActionChange,
    ) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Action, action)?;
        let written = changed(&files, &fiche.content, action, change, self.clock)?;
        if written != fiche.content {
            self.store.write(&fiche.path, &written)?;
        }
        Ok(())
    }
}

/// Le texte de l'action `action`, de texte `content`, une fois ce geste fait.
fn changed(
    files: &CrmFiles<'_>,
    content: &str,
    action: &Reference,
    change: ActionChange,
    clock: &dyn Clock,
) -> Result<String, AppError> {
    let stages = files.stages();
    let read = || Action::parse(action.clone(), content, stages).map_err(|_| AppError::FicheGone);
    Ok(match change {
        ActionChange::Title(title) => with_name(content, &Name::parse(&title)?),
        ActionChange::Status(name) => with_status(content, stages, &status_of(files, &name)?),
        ActionChange::Date(day) => with_date(content, day),
        ActionChange::Channel(channel) => with_channel(content, channel),
        ActionChange::Project(Some(project)) => {
            files.read(CrmKind::Project, &project)?;
            with_project(content, Some(&project))
        }
        ActionChange::Project(None) => with_project(content, None),
        ActionChange::Color(color) => with_color(content, color),
        ActionChange::Tags(tags) => with_tags(content, &tags),
        ActionChange::LinkedNotes(notes) => with_linked_notes(content, &notes),
        ActionChange::AddPerson(person) => {
            let mut people = read()?.people;
            if people.iter().all(|known| known.person != person) {
                people.push(action_person(files, &person)?);
            }
            with_people(content, &people)
        }
        ActionChange::RemovePerson(person) => without_person(content, &person),
        ActionChange::Body(change) => with_body(content, &change.apply(&read()?.body)?),
        ActionChange::AddComment(text) => {
            let at = DayTime::from_moment(clock.now())?;
            let change = BodyChange::AddComment { at, text };
            with_body(content, &change.apply(&read()?.body)?)
        }
    })
}

/// Où une carte est lâchée dans sa colonne.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Placement {
    /// Nulle part : elle change de colonne sans être placée (un filtre est actif, ou la colonne est
    /// terminée).
    Unplaced,
    /// Juste avant cette carte ; tout en bas sans carte, ou si la carte n'est pas dans la colonne.
    Before(Option<Reference>),
}

/// Déplacer une carte dans le Kanban : son statut change et, dans une colonne ouverte, elle prend la
/// place où elle est lâchée (spécification § 7.1).
#[derive(Debug)]
pub struct MoveAction<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> MoveAction<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Met l'action `action` dans la colonne `status` du CRM `crm`, à cette place. Le rang de chaque
    /// carte de la colonne dont la place change est réécrit, tous ensemble ou aucun. Une colonne
    /// terminée ne se range pas à la main.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si l'action n'existe
    /// plus ; [`AppError::UnknownStatus`] si la colonne n'existe pas ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        action: &Reference,
        status: &str,
        placement: &Placement,
    ) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let status = status_of(&files, status)?;
        let fiches = files.load()?;
        if fiches
            .actions
            .iter()
            .all(|(fiche, _)| fiche.name != *action)
        {
            return Err(AppError::FicheGone);
        }
        let steps = moved_steps(files.stages(), &fiches.actions, action, &status, placement);
        ApplyGesture::new(self.store, self.pending).execute(&Gesture::new(steps))
    }
}

/// Les pas du geste : chaque action dont le texte change, le sien (nouveau statut, rang effacé) et le
/// rang des cartes de la colonne ouverte dont la place change.
fn moved_steps(
    stages: &Stages,
    actions: &[(FicheText, Action)],
    moved: &Reference,
    status: &Status,
    placement: &Placement,
) -> Vec<GestureStep> {
    let mut texts: Vec<(&FicheText, String)> = actions
        .iter()
        .map(|(fiche, _)| {
            let text = if fiche.name == *moved {
                with_status(&fiche.content, stages, status)
            } else {
                fiche.content.clone()
            };
            (fiche, text)
        })
        .collect();
    if let (Placement::Before(before), true) = (placement, status.is_open()) {
        let all: Vec<Action> = actions.iter().map(|(_, action)| action.clone()).collect();
        let column = columns(stages, &all)
            .into_iter()
            .find(|column| column.status == *status)
            .map(|column| column.cards)
            .unwrap_or_default();
        for (name, rank) in placed_ranks(&column, moved, before.as_ref()) {
            for (fiche, text) in &mut texts {
                if fiche.name == name {
                    *text = with_rank(text, Some(rank));
                }
            }
        }
    }
    texts
        .into_iter()
        .filter(|(fiche, text)| *text != fiche.content)
        .map(|(fiche, text)| GestureStep::Rewrite {
            note: fiche.path.clone(),
            content: text,
        })
        .collect()
}

/// Supprimer une action : elle part à la corbeille avec ses pièces jointes (spécification § 11).
#[derive(Debug)]
pub struct DeleteAction<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> DeleteAction<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Met l'action `action` du CRM `crm` à la corbeille ; rend son chemin dans la corbeille. Les
    /// autres fiches ne changent pas : une référence perdue est retirée au prochain enregistrement.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si l'action n'existe
    /// plus ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, action: &Reference) -> Result<NotePath, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Action, action)?;
        Trash::new(self.store).put_note(&fiche.path)
    }
}

#[cfg(test)]
#[path = "actions_tests.rs"]
mod tests;
