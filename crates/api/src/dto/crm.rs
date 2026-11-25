//! Le CRM tel que l'interface le reçoit (fiche 0058) : ses fiches, les colonnes du Kanban, Ma semaine
//! et les compteurs, tout calculé par le domaine.

use application::use_cases::{
    ColumnView, CompanyEntry, CrmView, NoDataEntry, PersonEntry, ProjectEntry, WeekView,
};
use domain::crm::kanban::CLOSED_PAGE;
use domain::crm::{
    Action, ActionPerson, Checklist, Comment, Day, Passage, Reference, Tally, Urgency,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Combien d'actions ouvertes, en retard (en rouge) et à faire aujourd'hui (en orange).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TallyItem {
    /// Les actions ouvertes.
    pub open: u32,
    /// Parmi elles, celles en retard.
    pub late: u32,
    /// Parmi elles, celles à faire aujourd'hui.
    pub today: u32,
}

/// L'urgence d'une action ouverte datée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum UrgencyItem {
    /// En retard de ce nombre de jours (1 le lendemain de sa date).
    Late {
        /// Les jours de retard.
        days: u32,
    },
    /// À faire aujourd'hui.
    Today,
}

/// Une personne d'une action, avec son entreprise au moment où on l'a donnée.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActionPersonItem {
    /// La référence de la personne.
    pub person: String,
    /// La référence de son entreprise de ce moment ; rien si elle était dans NODATA.
    pub company: Option<String>,
}

/// Un élément à cocher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChecklistEntryItem {
    /// Vrai s'il est coché.
    pub done: bool,
    /// Son texte.
    pub text: String,
}

/// Une liste à cocher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChecklistItem {
    /// Son nom.
    pub name: String,
    /// Ses éléments.
    pub items: Vec<ChecklistEntryItem>,
    /// Le nombre d'éléments cochés.
    pub done: u32,
}

/// Un commentaire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommentItem {
    /// Son moment, `2026-11-24 10:32`.
    pub at: String,
    /// Son texte.
    pub text: String,
}

/// Une action : une carte du Kanban.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmActionItem {
    /// Sa référence : le nom de son fichier sans extension.
    pub name: String,
    /// Son titre.
    pub title: String,
    /// Ses personnes.
    pub people: Vec<ActionPersonItem>,
    /// Les entreprises de ses personnes d'alors ; rien est NODATA.
    pub companies: Vec<Option<String>>,
    /// Le nom de sa colonne.
    pub status: String,
    /// Vrai si elle est ouverte (« TODO » ou une étape).
    pub open: bool,
    /// Son jour, `2026-11-24`.
    pub date: Option<String>,
    /// Son retard ou son jour, aujourd'hui.
    pub urgency: Option<UrgencyItem>,
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
    /// Sa place choisie dans sa colonne.
    pub rank: Option<u32>,
    /// Sa description.
    pub description: String,
    /// Ses listes à cocher.
    pub checklists: Vec<ChecklistItem>,
    /// Ses commentaires, dans l'ordre écrit.
    pub comments: Vec<CommentItem>,
}

/// Une colonne du Kanban.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ColumnItem {
    /// Le nom du statut.
    pub status: String,
    /// Vrai pour « Done » et « Cancel ».
    pub closed: bool,
    /// Le nombre de cartes de la colonne, filtres ou non.
    pub count: u32,
    /// Le nombre de cartes en retard, filtres ou non.
    pub late: u32,
    /// Les références des cartes visibles, dans l'ordre de la colonne.
    pub cards: Vec<String>,
}

/// Ma semaine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WeekItem {
    /// Le lundi, `2026-11-23`.
    pub monday: String,
    /// Le dimanche.
    pub sunday: String,
    /// « En retard » : les références des actions ouvertes datées d'avant le lundi.
    pub late: Vec<String>,
    /// Les sept jours, lundi à dimanche.
    pub days: Vec<WeekDayItem>,
}

/// Un jour de Ma semaine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WeekDayItem {
    /// Le jour, `2026-11-24`.
    pub day: String,
    /// Les références de ses actions ouvertes.
    pub cards: Vec<String>,
}

/// Un passage dans une entreprise.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PassageItem {
    /// La référence de l'entreprise.
    pub company: String,
    /// Le jour d'arrivée.
    pub from: String,
    /// Le jour de départ ; rien pour le passage en cours.
    pub to: Option<String>,
}

/// Une entreprise.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmCompanyItem {
    /// Sa référence.
    pub name: String,
    /// Son nom.
    pub title: String,
    /// Son site.
    pub site: Option<String>,
    /// Son secteur.
    pub sector: Option<String>,
    /// Son adresse.
    pub address: Option<String>,
    /// Son téléphone.
    pub phone: Option<String>,
    /// Ses notes libres.
    pub notes: String,
    /// Les références de ses personnes, par ordre alphabétique.
    pub people: Vec<String>,
    /// Ses compteurs.
    pub tally: TallyItem,
}

/// NODATA.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoDataItem {
    /// Les références des personnes sans entreprise.
    pub people: Vec<String>,
    /// Ses compteurs.
    pub tally: TallyItem,
}

/// Une personne.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmPersonItem {
    /// Sa référence.
    pub name: String,
    /// Son nom entier.
    pub title: String,
    /// Sa fonction.
    pub role: Option<String>,
    /// La référence de son entreprise ; rien est NODATA.
    pub company: Option<String>,
    /// Son parcours.
    pub career: Vec<PassageItem>,
    /// Son e-mail.
    pub email: Option<String>,
    /// Son téléphone.
    pub phone: Option<String>,
    /// Son profil LinkedIn.
    pub linkedin: Option<String>,
    /// Ses notes libres.
    pub notes: String,
    /// Les références de ses actions ouvertes, la plus en retard d'abord.
    pub open_actions: Vec<String>,
    /// Les références de ses actions terminées, la plus récente d'abord.
    pub closed_actions: Vec<String>,
    /// Ses compteurs.
    pub tally: TallyItem,
}

/// Un projet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmProjectItem {
    /// Sa référence.
    pub name: String,
    /// Son nom.
    pub title: String,
    /// Sa couleur, un nom de la palette.
    pub color: String,
    /// Ses étiquettes.
    pub tags: Vec<String>,
    /// Les références de ses actions ouvertes, la plus en retard d'abord.
    pub open_actions: Vec<String>,
    /// Ses compteurs.
    pub tally: TallyItem,
}

/// Un CRM lu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CrmItem {
    /// Son titre.
    pub title: String,
    /// Ses étapes.
    pub stages: Vec<String>,
    /// Le jour du Mac, `2026-11-24`.
    pub today: String,
    /// Combien de cartes montre d'abord une colonne terminée, et combien de plus à chaque clic.
    pub closed_page: u32,
    /// NODATA.
    pub nodata: NoDataItem,
    /// Ses entreprises.
    pub companies: Vec<CrmCompanyItem>,
    /// Ses personnes.
    pub people: Vec<CrmPersonItem>,
    /// Ses projets.
    pub projects: Vec<CrmProjectItem>,
    /// Toutes ses actions.
    pub actions: Vec<CrmActionItem>,
    /// Les colonnes du Kanban.
    pub columns: Vec<ColumnItem>,
    /// Ma semaine.
    pub week: WeekItem,
    /// Les étiquettes de ses actions.
    pub tags: Vec<String>,
    /// Les chemins des fiches illisibles, laissées de côté.
    pub unreadable: Vec<String>,
}

fn count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

fn texts(references: Vec<Reference>) -> Vec<String> {
    references.iter().map(|r| r.as_str().to_owned()).collect()
}

impl From<Tally> for TallyItem {
    fn from(tally: Tally) -> Self {
        Self {
            open: count(tally.open),
            late: count(tally.late),
            today: count(tally.today),
        }
    }
}

impl CrmActionItem {
    /// L'action `action`, le jour `today`.
    fn of(action: Action, today: Day) -> Self {
        let urgency = action.urgency(today).map(|urgency| match urgency {
            Urgency::Late(days) => UrgencyItem::Late {
                days: u32::try_from(days).unwrap_or(u32::MAX),
            },
            Urgency::Today => UrgencyItem::Today,
        });
        Self {
            urgency,
            open: action.is_open(),
            companies: action
                .companies()
                .iter()
                .map(|company| company.as_ref().map(|c| c.as_str().to_owned()))
                .collect(),
            name: action.name.as_str().to_owned(),
            title: action.title,
            people: action.people.iter().map(ActionPersonItem::from).collect(),
            status: action.status.name().to_owned(),
            date: action.date.map(|day| day.to_string()),
            channel: action.channel.map(|c| c.name().to_owned()),
            project: action.project.map(|p| p.as_str().to_owned()),
            color: action.color.map(|c| c.name().to_owned()),
            tags: action.tags,
            linked_notes: action
                .linked_notes
                .iter()
                .map(|note| note.as_str().to_owned())
                .collect(),
            rank: action.rank.map(std::num::NonZeroU32::get),
            description: action.body.description,
            checklists: action
                .body
                .checklists
                .into_iter()
                .map(ChecklistItem::from)
                .collect(),
            comments: action
                .body
                .comments
                .into_iter()
                .map(CommentItem::from)
                .collect(),
        }
    }
}

impl From<&ActionPerson> for ActionPersonItem {
    fn from(person: &ActionPerson) -> Self {
        Self {
            person: person.person.as_str().to_owned(),
            company: person.company.as_ref().map(|c| c.as_str().to_owned()),
        }
    }
}

impl From<Checklist> for ChecklistItem {
    fn from(list: Checklist) -> Self {
        Self {
            done: count(list.progress().0),
            items: list
                .items
                .into_iter()
                .map(|item| ChecklistEntryItem {
                    done: item.done,
                    text: item.text,
                })
                .collect(),
            name: list.name,
        }
    }
}

impl From<Comment> for CommentItem {
    fn from(comment: Comment) -> Self {
        Self {
            at: comment.at.to_string(),
            text: comment.text,
        }
    }
}

impl From<ColumnView> for ColumnItem {
    fn from(column: ColumnView) -> Self {
        Self {
            status: column.status.name().to_owned(),
            closed: column.status.is_closed(),
            count: count(column.count),
            late: count(column.late),
            cards: texts(column.cards),
        }
    }
}

impl From<WeekView> for WeekItem {
    fn from(week: WeekView) -> Self {
        Self {
            monday: week.monday.to_string(),
            sunday: week.sunday.to_string(),
            late: texts(week.late),
            days: week
                .days
                .into_iter()
                .map(|(day, cards)| WeekDayItem {
                    day: day.to_string(),
                    cards: texts(cards),
                })
                .collect(),
        }
    }
}

impl From<Passage> for PassageItem {
    fn from(passage: Passage) -> Self {
        Self {
            company: passage.company.as_str().to_owned(),
            from: passage.from.to_string(),
            to: passage.to.map(|day| day.to_string()),
        }
    }
}

impl From<CompanyEntry> for CrmCompanyItem {
    fn from(entry: CompanyEntry) -> Self {
        Self {
            name: entry.name.as_str().to_owned(),
            title: entry.company.name,
            site: entry.company.site,
            sector: entry.company.sector,
            address: entry.company.address,
            phone: entry.company.phone,
            notes: entry.company.notes,
            people: texts(entry.people),
            tally: entry.tally.into(),
        }
    }
}

impl From<NoDataEntry> for NoDataItem {
    fn from(entry: NoDataEntry) -> Self {
        Self {
            people: texts(entry.people),
            tally: entry.tally.into(),
        }
    }
}

impl From<PersonEntry> for CrmPersonItem {
    fn from(entry: PersonEntry) -> Self {
        let person = entry.person;
        Self {
            name: entry.name.as_str().to_owned(),
            title: person.name,
            role: person.role,
            company: person.company.map(|c| c.as_str().to_owned()),
            career: person.career.into_iter().map(PassageItem::from).collect(),
            email: person.email,
            phone: person.phone,
            linkedin: person.linkedin,
            notes: person.notes,
            open_actions: texts(entry.open_actions),
            closed_actions: texts(entry.closed_actions),
            tally: entry.tally.into(),
        }
    }
}

impl From<ProjectEntry> for CrmProjectItem {
    fn from(entry: ProjectEntry) -> Self {
        Self {
            name: entry.name.as_str().to_owned(),
            title: entry.project.name,
            color: entry.project.color.name().to_owned(),
            tags: entry.project.tags,
            open_actions: texts(entry.open_actions),
            tally: entry.tally.into(),
        }
    }
}

impl From<CrmView> for CrmItem {
    fn from(view: CrmView) -> Self {
        let today = view.today;
        Self {
            title: view.title,
            stages: view.stages.names(),
            today: today.to_string(),
            closed_page: count(CLOSED_PAGE),
            nodata: view.nodata.into(),
            companies: view.companies.into_iter().map(Into::into).collect(),
            people: view.people.into_iter().map(Into::into).collect(),
            projects: view.projects.into_iter().map(Into::into).collect(),
            actions: view
                .actions
                .into_iter()
                .map(|action| CrmActionItem::of(action, today))
                .collect(),
            columns: view.columns.into_iter().map(Into::into).collect(),
            week: view.week.into(),
            tags: view.tags,
            unreadable: view.unreadable.iter().map(|p| p.to_path()).collect(),
        }
    }
}
