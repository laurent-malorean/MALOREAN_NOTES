//! Ce que l'interface demande au CRM (fiche 0058) : filtres, action à créer, gestes sur une fiche.
//! Tout est converti à la frontière, une fois, en types de l'application.

use application::AppError;
use application::use_cases::{
    ActionChange, ActionDraft, CompanyChange, PersonChange, Placement, ProjectChange, StageChange,
};
use domain::crm::{
    BodyChange, Channel, Color, CompanyChoice, CompanyField, Day, Filters, PersonField, Reference,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

fn reference(text: &str) -> Result<Reference, AppError> {
    Reference::to(text).ok_or_else(|| AppError::InvalidReference(text.to_owned()))
}

fn references(texts: &[String]) -> Result<Vec<Reference>, AppError> {
    texts.iter().map(|text| reference(text)).collect()
}

fn optional_reference(text: Option<&String>) -> Result<Option<Reference>, AppError> {
    text.map(|text| reference(text)).transpose()
}

fn color(text: &str) -> Result<Color, AppError> {
    Color::parse(text).ok_or_else(|| AppError::UnknownColor(text.to_owned()))
}

fn optional_color(text: Option<&String>) -> Result<Option<Color>, AppError> {
    text.map(|text| color(text)).transpose()
}

fn optional_channel(text: Option<&String>) -> Result<Option<Channel>, AppError> {
    text.map(|text| Channel::read(text).ok_or_else(|| AppError::UnknownChannel(text.clone())))
        .transpose()
}

pub(crate) fn day(text: &str) -> Result<Day, AppError> {
    Ok(Day::parse(text)?)
}

/// Le choix de la liste « Toutes les entreprises ».
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum CompanyChoiceItem {
    /// NODATA.
    NoData,
    /// Une entreprise.
    Company {
        /// Sa référence.
        name: String,
    },
}

/// La rangée de recherche et de filtres du Kanban.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmFiltersItem {
    /// Le mot cherché ; vide : tout passe.
    pub search: String,
    /// La référence de la personne choisie.
    pub person: Option<String>,
    /// L'entreprise choisie.
    pub company: Option<CompanyChoiceItem>,
    /// Les références des projets cochés.
    pub projects: Vec<String>,
    /// Les étiquettes cochées.
    pub tags: Vec<String>,
}

impl TryFrom<CrmFiltersItem> for Filters {
    type Error = AppError;

    fn try_from(item: CrmFiltersItem) -> Result<Self, AppError> {
        Ok(Self {
            search: item.search,
            person: optional_reference(item.person.as_ref())?,
            company: match &item.company {
                None => None,
                Some(CompanyChoiceItem::NoData) => Some(CompanyChoice::NoData),
                Some(CompanyChoiceItem::Company { name }) => {
                    Some(CompanyChoice::Company(reference(name)?))
                }
            },
            projects: references(&item.projects)?,
            tags: item.tags,
        })
    }
}

/// Une action à créer.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmActionDraftItem {
    /// Son titre.
    pub title: String,
    /// Le nom de sa colonne ; « TODO » sans nom.
    pub status: Option<String>,
    /// Son jour, `2026-11-24` ; aujourd'hui sans jour.
    pub date: Option<String>,
    /// Les références de ses personnes.
    pub people: Vec<String>,
    /// Son canal.
    pub channel: Option<String>,
    /// La référence de son projet.
    pub project: Option<String>,
    /// Sa couleur d'action.
    pub color: Option<String>,
    /// Ses étiquettes.
    pub tags: Vec<String>,
    /// Ses notes liées, désignées par leur titre.
    pub linked_notes: Vec<String>,
    /// Sa description.
    pub description: String,
}

impl TryFrom<CrmActionDraftItem> for ActionDraft {
    type Error = AppError;

    fn try_from(item: CrmActionDraftItem) -> Result<Self, AppError> {
        Ok(Self {
            title: item.title,
            status: item.status,
            date: item.date.as_deref().map(day).transpose()?,
            people: references(&item.people)?,
            channel: optional_channel(item.channel.as_ref())?,
            project: optional_reference(item.project.as_ref())?,
            color: optional_color(item.color.as_ref())?,
            tags: item.tags,
            linked_notes: references(&item.linked_notes)?,
            description: item.description,
        })
    }
}

/// Un geste sur le texte d'une action ; une liste, un élément et un commentaire se désignent par
/// leur place (à partir de 0) dans l'ordre écrit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum BodyChangeItem {
    /// Remplacer la description.
    Description {
        /// Son texte.
        text: String,
    },
    /// Ajouter une liste à cocher.
    AddChecklist {
        /// Son nom.
        name: String,
    },
    /// Renommer une liste à cocher.
    RenameChecklist {
        /// Sa place.
        list: u32,
        /// Son nouveau nom.
        name: String,
    },
    /// Supprimer une liste à cocher.
    RemoveChecklist {
        /// Sa place.
        list: u32,
    },
    /// Ajouter un élément à une liste.
    AddItem {
        /// La place de la liste.
        list: u32,
        /// Son texte.
        text: String,
    },
    /// Changer le texte d'un élément.
    EditItem {
        /// La place de la liste.
        list: u32,
        /// La place de l'élément.
        item: u32,
        /// Son nouveau texte.
        text: String,
    },
    /// Cocher ou décocher un élément.
    CheckItem {
        /// La place de la liste.
        list: u32,
        /// La place de l'élément.
        item: u32,
        /// Vrai pour le cocher.
        done: bool,
    },
    /// Supprimer un élément.
    RemoveItem {
        /// La place de la liste.
        list: u32,
        /// La place de l'élément.
        item: u32,
    },
    /// Ajouter un commentaire, daté de maintenant.
    AddComment {
        /// Son texte.
        text: String,
    },
    /// Changer le texte d'un commentaire.
    EditComment {
        /// Sa place.
        comment: u32,
        /// Son nouveau texte.
        text: String,
    },
    /// Supprimer un commentaire.
    RemoveComment {
        /// Sa place.
        comment: u32,
    },
}

fn at(place: u32) -> usize {
    usize::try_from(place).unwrap_or(usize::MAX)
}

impl From<BodyChangeItem> for ActionChange {
    fn from(item: BodyChangeItem) -> Self {
        use BodyChangeItem as Item;
        let change = match item {
            Item::Description { text } => BodyChange::Description(text),
            Item::AddChecklist { name } => BodyChange::AddChecklist(name),
            Item::RenameChecklist { list, name } => BodyChange::RenameChecklist {
                list: at(list),
                name,
            },
            Item::RemoveChecklist { list } => BodyChange::RemoveChecklist(at(list)),
            Item::AddItem { list, text } => BodyChange::AddItem {
                list: at(list),
                text,
            },
            Item::EditItem { list, item, text } => BodyChange::EditItem {
                list: at(list),
                item: at(item),
                text,
            },
            Item::CheckItem { list, item, done } => BodyChange::CheckItem {
                list: at(list),
                item: at(item),
                done,
            },
            Item::RemoveItem { list, item } => BodyChange::RemoveItem {
                list: at(list),
                item: at(item),
            },
            Item::AddComment { text } => return Self::AddComment(text),
            Item::EditComment { comment, text } => BodyChange::EditComment {
                comment: at(comment),
                text,
            },
            Item::RemoveComment { comment } => BodyChange::RemoveComment(at(comment)),
        };
        Self::Body(change)
    }
}

/// Un geste sur une action : un seul champ change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum CrmActionChangeItem {
    /// Son titre.
    Title {
        /// Le nouveau titre.
        title: String,
    },
    /// Sa colonne ; son rang s'efface.
    Status {
        /// Le nom de la colonne.
        status: String,
    },
    /// Son jour, `2026-11-24`.
    Date {
        /// Le jour.
        date: String,
    },
    /// Son canal ; rien le retire.
    Channel {
        /// Le canal.
        channel: Option<String>,
    },
    /// Son projet ; rien le retire.
    Project {
        /// La référence du projet.
        project: Option<String>,
    },
    /// Sa couleur d'action ; rien la retire.
    Color {
        /// Le nom de la couleur.
        color: Option<String>,
    },
    /// Ses étiquettes.
    Tags {
        /// Les étiquettes.
        tags: Vec<String>,
    },
    /// Ses notes liées.
    LinkedNotes {
        /// Les titres des notes.
        notes: Vec<String>,
    },
    /// Donner une personne.
    AddPerson {
        /// Sa référence.
        person: String,
    },
    /// Retirer une personne.
    RemovePerson {
        /// Sa référence.
        person: String,
    },
    /// Sa description, ses listes à cocher ou ses commentaires.
    Body {
        /// Le geste.
        change: BodyChangeItem,
    },
}

impl TryFrom<CrmActionChangeItem> for ActionChange {
    type Error = AppError;

    fn try_from(item: CrmActionChangeItem) -> Result<Self, AppError> {
        use CrmActionChangeItem as Item;
        Ok(match item {
            Item::Title { title } => Self::Title(title),
            Item::Status { status } => Self::Status(status),
            Item::Date { date } => Self::Date(day(&date)?),
            Item::Channel { channel } => Self::Channel(optional_channel(channel.as_ref())?),
            Item::Project { project } => Self::Project(optional_reference(project.as_ref())?),
            Item::Color { color } => Self::Color(optional_color(color.as_ref())?),
            Item::Tags { tags } => Self::Tags(tags),
            Item::LinkedNotes { notes } => Self::LinkedNotes(references(&notes)?),
            Item::AddPerson { person } => Self::AddPerson(reference(&person)?),
            Item::RemovePerson { person } => Self::RemovePerson(reference(&person)?),
            Item::Body { change } => change.into(),
        })
    }
}

/// Où une carte est lâchée dans sa colonne.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum PlacementItem {
    /// Nulle part : un filtre est actif, ou la colonne est terminée.
    Unplaced,
    /// Juste avant cette carte ; tout en bas sans carte.
    Before {
        /// La référence de la carte suivante.
        card: Option<String>,
    },
}

impl TryFrom<PlacementItem> for Placement {
    type Error = AppError;

    fn try_from(item: PlacementItem) -> Result<Self, AppError> {
        Ok(match item {
            PlacementItem::Unplaced => Self::Unplaced,
            PlacementItem::Before { card } => Self::Before(optional_reference(card.as_ref())?),
        })
    }
}

/// Un geste sur une personne.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum CrmPersonChangeItem {
    /// Son nom entier.
    Rename {
        /// Le nouveau nom.
        name: String,
    },
    /// Un de ses champs : `role`, `email`, `phone` ou `linkedin` ; vide, il est retiré.
    Field {
        /// Le champ.
        field: String,
        /// Sa valeur.
        value: String,
    },
    /// Ses notes libres.
    Notes {
        /// Le texte.
        notes: String,
    },
    /// « Changer d'entreprise ».
    Company {
        /// La référence de la nouvelle entreprise ; rien est NODATA.
        company: Option<String>,
        /// Le jour du changement, `2026-11-24`.
        day: String,
    },
}

impl TryFrom<CrmPersonChangeItem> for PersonChange {
    type Error = AppError;

    fn try_from(item: CrmPersonChangeItem) -> Result<Self, AppError> {
        Ok(match item {
            CrmPersonChangeItem::Rename { name } => Self::Rename(name),
            CrmPersonChangeItem::Field { field, value } => {
                let field = [
                    ("role", PersonField::Role),
                    ("email", PersonField::Email),
                    ("phone", PersonField::Phone),
                    ("linkedin", PersonField::LinkedIn),
                ]
                .into_iter()
                .find(|(name, _)| *name == field)
                .map(|(_, field)| field)
                .ok_or_else(|| AppError::InvalidReference(field.clone()))?;
                Self::Field(field, value)
            }
            CrmPersonChangeItem::Notes { notes } => Self::Notes(notes),
            CrmPersonChangeItem::Company {
                company,
                day: written,
            } => Self::Company(optional_reference(company.as_ref())?, day(&written)?),
        })
    }
}

/// Un geste sur une entreprise.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum CrmCompanyChangeItem {
    /// Son nom.
    Rename {
        /// Le nouveau nom.
        name: String,
    },
    /// Un de ses champs : `site`, `sector`, `address` ou `phone` ; vide, il est retiré.
    Field {
        /// Le champ.
        field: String,
        /// Sa valeur.
        value: String,
    },
    /// Ses notes libres.
    Notes {
        /// Le texte.
        notes: String,
    },
}

impl TryFrom<CrmCompanyChangeItem> for CompanyChange {
    type Error = AppError;

    fn try_from(item: CrmCompanyChangeItem) -> Result<Self, AppError> {
        Ok(match item {
            CrmCompanyChangeItem::Rename { name } => Self::Rename(name),
            CrmCompanyChangeItem::Field { field, value } => {
                let field = [
                    ("site", CompanyField::Site),
                    ("sector", CompanyField::Sector),
                    ("address", CompanyField::Address),
                    ("phone", CompanyField::Phone),
                ]
                .into_iter()
                .find(|(name, _)| *name == field)
                .map(|(_, field)| field)
                .ok_or_else(|| AppError::InvalidReference(field.clone()))?;
                Self::Field(field, value)
            }
            CrmCompanyChangeItem::Notes { notes } => Self::Notes(notes),
        })
    }
}

/// Un geste sur un projet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum CrmProjectChangeItem {
    /// Son nom.
    Rename {
        /// Le nouveau nom.
        name: String,
    },
    /// Sa couleur.
    Color {
        /// Le nom de la couleur.
        color: String,
    },
    /// Ses étiquettes.
    Tags {
        /// Les étiquettes.
        tags: Vec<String>,
    },
}

impl TryFrom<CrmProjectChangeItem> for ProjectChange {
    type Error = AppError;

    fn try_from(item: CrmProjectChangeItem) -> Result<Self, AppError> {
        Ok(match item {
            CrmProjectChangeItem::Rename { name } => Self::Rename(name),
            CrmProjectChangeItem::Color { color: written } => Self::Color(color(&written)?),
            CrmProjectChangeItem::Tags { tags } => Self::Tags(tags),
        })
    }
}

/// Un changement des étapes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum StageChangeItem {
    /// Ajouter une étape, avant « Done ».
    Add {
        /// Son nom.
        name: String,
    },
    /// Renommer une étape.
    Rename {
        /// Son nom actuel.
        from: String,
        /// Son nouveau nom.
        to: String,
    },
    /// Retirer une étape.
    Remove {
        /// Son nom.
        name: String,
    },
    /// Déplacer une étape.
    Move {
        /// Son nom.
        name: String,
        /// Sa place (à partir de 0).
        to: u32,
    },
}

impl From<StageChangeItem> for StageChange {
    fn from(item: StageChangeItem) -> Self {
        match item {
            StageChangeItem::Add { name } => Self::Add(name),
            StageChangeItem::Rename { from, to } => Self::Rename { from, to },
            StageChangeItem::Remove { name } => Self::Remove(name),
            StageChangeItem::Move { name, to } => Self::Move { name, to: at(to) },
        }
    }
}

#[cfg(test)]
#[path = "crm_change_tests.rs"]
mod tests;
