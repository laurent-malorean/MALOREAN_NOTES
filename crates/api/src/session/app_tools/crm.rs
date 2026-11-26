//! La lecture d'un CRM par une IA (fiche 0081) : colonnes du Kanban, personnes, entreprises, projets
//! et étapes en données, jamais les fichiers des fiches ; la taille est bornée et la coupure
//! toujours dite. Le calcul est celui de l'interface (`ReadCrm`) : l'IA voit ce que l'écran montre.

use std::collections::HashMap;

use domain::NotePath;
use domain::crm::CrmKind;
use serde::Serialize;
use serde_json::Value;

use super::crm_budget::{
    MAX_READ_CRM_ACTION_CHARACTERS, MAX_READ_CRM_COMPANY_CHARACTERS,
    MAX_READ_CRM_PERSON_CHARACTERS, MAX_READ_CRM_PROJECT_CHARACTERS, Room, Section,
};
use super::{optional, required, written};
use crate::session::Session;
use crate::{
    ApiError, CompanyChoiceItem, CrmActionItem, CrmCompanyItem, CrmFiltersItem, CrmItem,
    CrmPersonItem, CrmProjectItem, NoDataItem, TallyItem, UrgencyItem,
};

/// Ce que l'IA lit des compteurs d'une personne, d'une entreprise, d'un projet ou de NODATA.
#[derive(Debug, Serialize)]
pub(super) struct TallyRead {
    open: u32,
    late: u32,
    today: u32,
}

impl From<&TallyItem> for TallyRead {
    fn from(tally: &TallyItem) -> Self {
        Self {
            open: tally.open,
            late: tally.late,
            today: tally.today,
        }
    }
}

/// Une personne d'une action : sa référence, et son entreprise du moment où on l'a donnée.
#[derive(Debug, Serialize)]
struct ActionPersonRead {
    #[serde(rename = "ref")]
    reference: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    company: Option<String>,
}

#[derive(Debug, Serialize)]
struct ItemRead {
    index: usize,
    done: bool,
    text: String,
}

#[derive(Debug, Serialize)]
struct ChecklistRead {
    index: usize,
    name: String,
    items: Vec<ItemRead>,
}

#[derive(Debug, Serialize)]
struct CommentRead {
    index: usize,
    at: String,
    text: String,
}

/// Une action, telle que l'IA la lit.
#[derive(Debug, Serialize)]
pub(super) struct ActionRead {
    #[serde(rename = "ref")]
    reference: String,
    fiche: String,
    title: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    /// En retard de tant de jours.
    #[serde(skip_serializing_if = "Option::is_none")]
    late_days: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    due_today: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    people: Vec<ActionPersonRead>,
    #[serde(skip_serializing_if = "Option::is_none")]
    project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    linked_notes: Vec<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    description: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    checklists: Vec<ChecklistRead>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    comments: Vec<CommentRead>,
    /// Un texte de l'action est coupé : sa fin n'est pas dans la réponse.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    text_truncated: bool,
}

#[derive(Debug, Serialize)]
struct PassageRead {
    company: String,
    from: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    to: Option<String>,
}

/// Une personne, telle que l'IA la lit.
#[derive(Debug, Serialize)]
pub(super) struct PersonRead {
    #[serde(rename = "ref")]
    reference: String,
    fiche: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    /// La référence de son entreprise ; rien pour NODATA.
    #[serde(skip_serializing_if = "Option::is_none")]
    company: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    career: Vec<PassageRead>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    linkedin: Option<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    notes: String,
    tally: TallyRead,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    text_truncated: bool,
}

/// Une entreprise, telle que l'IA la lit.
#[derive(Debug, Serialize)]
pub(super) struct CompanyRead {
    #[serde(rename = "ref")]
    reference: String,
    fiche: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    site: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone: Option<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    notes: String,
    people: Vec<String>,
    tally: TallyRead,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    text_truncated: bool,
}

/// Un projet, tel que l'IA le lit.
#[derive(Debug, Serialize)]
pub(super) struct ProjectRead {
    #[serde(rename = "ref")]
    reference: String,
    fiche: String,
    name: String,
    /// Un nom de la palette de l'application.
    color: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    tally: TallyRead,
}

/// Une colonne du Kanban : le statut, ses nombres de cartes et les actions visibles.
#[derive(Debug, Serialize)]
struct ColumnRead {
    status: String,
    closed: bool,
    /// Le nombre de cartes de la colonne, filtres ou non.
    count: u32,
    /// Le nombre de cartes en retard de la colonne, filtres ou non.
    late: u32,
    actions: Vec<ActionRead>,
}

/// NODATA : les personnes sans entreprise.
#[derive(Debug, Serialize)]
struct NoDataRead {
    people: Vec<String>,
    tally: TallyRead,
}

/// Un CRM, tel que l'IA le lit.
#[derive(Debug, Serialize)]
struct CrmRead {
    path: String,
    title: String,
    /// Le jour du Mac, `2026-11-24`.
    today: String,
    stages: Vec<String>,
    /// Les étiquettes de ses actions.
    tags: Vec<String>,
    columns: Vec<ColumnRead>,
    people: Vec<PersonRead>,
    companies: Vec<CompanyRead>,
    projects: Vec<ProjectRead>,
    nodata: NoDataRead,
    /// Les chemins des fiches illisibles, laissées de côté (jamais effacées).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    unreadable: Vec<String>,
    /// La lecture est coupée : une partie du CRM n'est pas dans cette réponse.
    truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Le chemin de la fiche `reference` de la sorte `kind` du CRM `crm` : `clients/actions/x.md`.
pub(super) fn fiche_path(crm: &NotePath, kind: CrmKind, reference: &str) -> String {
    let folder = kind
        .folder_of(crm.name().stem())
        .unwrap_or_else(|| crm.name().stem().to_owned());
    let base = crm.folder().to_path();
    if base.is_empty() {
        format!("{folder}/{reference}.md")
    } else {
        format!("{base}/{folder}/{reference}.md")
    }
}

fn checklists_read(action: &CrmActionItem, room: &mut Room, cut: &mut bool) -> Vec<ChecklistRead> {
    action
        .checklists
        .iter()
        .enumerate()
        .map(|(index, list)| ChecklistRead {
            index,
            name: list.name.clone(),
            items: list
                .items
                .iter()
                .enumerate()
                .map(|(index, item)| ItemRead {
                    index,
                    done: item.done,
                    text: room.take(&item.text, cut),
                })
                .collect(),
        })
        .collect()
}

fn comments_read(action: &CrmActionItem, room: &mut Room, cut: &mut bool) -> Vec<CommentRead> {
    action
        .comments
        .iter()
        .enumerate()
        .map(|(index, comment)| CommentRead {
            index,
            at: comment.at.clone(),
            text: room.take(&comment.text, cut),
        })
        .collect()
}

pub(super) fn action_read(crm: &NotePath, action: &CrmActionItem, room: &mut Room) -> ActionRead {
    let mut cut = false;
    let description = room.take(&action.description, &mut cut);
    let checklists = checklists_read(action, room, &mut cut);
    let comments = comments_read(action, room, &mut cut);
    let (late_days, due_today) = match action.urgency {
        Some(UrgencyItem::Late { days }) => (Some(days), false),
        Some(UrgencyItem::Today) => (None, true),
        None => (None, false),
    };
    ActionRead {
        reference: action.name.clone(),
        fiche: fiche_path(crm, CrmKind::Action, &action.name),
        title: action.title.clone(),
        status: action.status.clone(),
        date: action.date.clone(),
        late_days,
        due_today,
        people: action
            .people
            .iter()
            .map(|person| ActionPersonRead {
                reference: person.person.clone(),
                company: person.company.clone(),
            })
            .collect(),
        project: action.project.clone(),
        channel: action.channel.clone(),
        color: action.color.clone(),
        tags: action.tags.clone(),
        linked_notes: action.linked_notes.clone(),
        description,
        checklists,
        comments,
        text_truncated: cut,
    }
}

pub(super) fn person_read(crm: &NotePath, person: &CrmPersonItem, room: &mut Room) -> PersonRead {
    let mut cut = false;
    PersonRead {
        reference: person.name.clone(),
        fiche: fiche_path(crm, CrmKind::Person, &person.name),
        name: person.title.clone(),
        role: person.role.clone(),
        company: person.company.clone(),
        career: person
            .career
            .iter()
            .map(|passage| PassageRead {
                company: passage.company.clone(),
                from: passage.from.clone(),
                to: passage.to.clone(),
            })
            .collect(),
        email: person.email.clone(),
        phone: person.phone.clone(),
        linkedin: person.linkedin.clone(),
        notes: room.take(&person.notes, &mut cut),
        tally: (&person.tally).into(),
        text_truncated: cut,
    }
}

pub(super) fn company_read(
    crm: &NotePath,
    company: &CrmCompanyItem,
    room: &mut Room,
) -> CompanyRead {
    let mut cut = false;
    CompanyRead {
        reference: company.name.clone(),
        fiche: fiche_path(crm, CrmKind::Company, &company.name),
        name: company.title.clone(),
        site: company.site.clone(),
        sector: company.sector.clone(),
        address: company.address.clone(),
        phone: company.phone.clone(),
        notes: room.take(&company.notes, &mut cut),
        people: company.people.clone(),
        tally: (&company.tally).into(),
        text_truncated: cut,
    }
}

pub(super) fn project_read(crm: &NotePath, project: &CrmProjectItem) -> ProjectRead {
    ProjectRead {
        reference: project.name.clone(),
        fiche: fiche_path(crm, CrmKind::Project, &project.name),
        name: project.title.clone(),
        color: project.color.clone(),
        tags: project.tags.clone(),
        tally: (&project.tally).into(),
    }
}

/// Ce que la coupure a retiré, dit à l'IA ; rien si rien n'est coupé. Chaque partie : de quoi
/// elle parle, ce qu'elle a rendu et vu, sa limite en caractères.
fn cut_message(parts: &[(&str, &Section, usize)], texts: usize) -> Option<String> {
    let mut said: Vec<String> = parts
        .iter()
        .filter(|(_, part, _)| part.given() < part.seen())
        .map(|(what, part, limit)| {
            format!(
                "{} {what} sur {} sont données (la réponse en donne {limit} caractères au plus \
                 pour les {what}) : les suivantes ne sont pas listées",
                part.given(),
                part.seen()
            )
        })
        .collect();
    if texts > 0 {
        said.push(format!(
            "{texts} fiche(s) ont un texte coupé : elles portent `text_truncated`"
        ));
    }
    (!said.is_empty()).then(|| {
        format!(
            "la lecture est coupée : {} ; pour la suite, filtrez par `person`, `company`, \
             `projects`, `tags` ou `search`, ou cherchez avec `search_notes` ; les fiches données \
             se changent normalement",
            said.join(" ; ")
        )
    })
}

/// Les filtres que donne l'IA : le mot cherché, la personne, l'entreprise (`NODATA` pour les
/// personnes sans entreprise), les projets, les étiquettes.
fn filters_of(arguments: &Value) -> Result<CrmFiltersItem, String> {
    let list = |field: &str| -> Result<Vec<String>, String> {
        match &arguments[field] {
            Value::Null => Ok(Vec::new()),
            Value::Array(items) => items
                .iter()
                .map(|item| {
                    item.as_str()
                        .map(str::to_owned)
                        .ok_or_else(|| format!("« {field} » est une liste de textes"))
                })
                .collect(),
            _ => Err(format!("« {field} » est une liste de textes")),
        }
    };
    Ok(CrmFiltersItem {
        search: optional(arguments, "search").unwrap_or_default().to_owned(),
        person: optional(arguments, "person").map(str::to_owned),
        company: optional(arguments, "company").map(|company| {
            if company == "NODATA" {
                CompanyChoiceItem::NoData
            } else {
                CompanyChoiceItem::Company {
                    name: company.to_owned(),
                }
            }
        }),
        projects: list("projects")?,
        tags: list("tags")?,
    })
}

/// Les colonnes du Kanban, avec les actions visibles qui tiennent dans la place des actions.
fn columns_read(path: &NotePath, item: &CrmItem, part: &mut Section) -> Vec<ColumnRead> {
    let by_ref: HashMap<&str, &CrmActionItem> = item
        .actions
        .iter()
        .map(|action| (action.name.as_str(), action))
        .collect();
    item.columns
        .iter()
        .map(|column| ColumnRead {
            status: column.status.clone(),
            closed: column.closed,
            count: column.count,
            late: column.late,
            actions: column
                .cards
                .iter()
                .filter_map(|card| by_ref.get(card.as_str()))
                .filter_map(|action| part.add(|room| action_read(path, action, room)))
                .collect(),
        })
        .collect()
}

/// Les parties d'une lecture, chacune avec sa place : ce qu'il en reste dit ce qui est coupé.
struct Parts {
    actions: Section,
    people: Section,
    companies: Section,
    projects: Section,
}

impl Parts {
    fn new() -> Self {
        Self {
            actions: Section::of(MAX_READ_CRM_ACTION_CHARACTERS),
            people: Section::of(MAX_READ_CRM_PERSON_CHARACTERS),
            companies: Section::of(MAX_READ_CRM_COMPANY_CHARACTERS),
            projects: Section::of(MAX_READ_CRM_PROJECT_CHARACTERS),
        }
    }

    /// Ce que la coupure a retiré, dit à l'IA ; rien si rien n'est coupé. `texts` : le nombre de
    /// fiches dont un texte est coupé.
    fn message(&self, texts: usize) -> Option<String> {
        cut_message(
            &[
                ("actions", &self.actions, MAX_READ_CRM_ACTION_CHARACTERS),
                ("personnes", &self.people, MAX_READ_CRM_PERSON_CHARACTERS),
                (
                    "entreprises",
                    &self.companies,
                    MAX_READ_CRM_COMPANY_CHARACTERS,
                ),
                ("projets", &self.projects, MAX_READ_CRM_PROJECT_CHARACTERS),
            ],
            texts,
        )
    }
}

/// Un CRM lu entier, ses colonnes et ses fiches en données ; coupé, et la réponse le dit, au-delà
/// de la place de chaque partie (fiche 0081).
fn crm_read(path: &NotePath, item: &CrmItem) -> CrmRead {
    let mut parts = Parts::new();
    let columns = columns_read(path, item, &mut parts.actions);
    let people: Vec<PersonRead> = item
        .people
        .iter()
        .filter_map(|person| parts.people.add(|room| person_read(path, person, room)))
        .collect();
    let companies: Vec<CompanyRead> = item
        .companies
        .iter()
        .filter_map(|company| {
            parts
                .companies
                .add(|room| company_read(path, company, room))
        })
        .collect();
    let projects: Vec<ProjectRead> = item
        .projects
        .iter()
        .filter_map(|project| parts.projects.add(|_| project_read(path, project)))
        .collect();
    let cut_texts = columns
        .iter()
        .flat_map(|column| &column.actions)
        .filter(|action| action.text_truncated)
        .count()
        + people.iter().filter(|person| person.text_truncated).count()
        + companies
            .iter()
            .filter(|company| company.text_truncated)
            .count();
    let message = parts.message(cut_texts);
    CrmRead {
        path: path.to_path(),
        title: item.title.clone(),
        today: item.today.clone(),
        stages: item.stages.clone(),
        tags: item.tags.clone(),
        columns,
        people,
        companies,
        projects,
        nodata: nodata_read(&item.nodata),
        unreadable: item.unreadable.clone(),
        truncated: message.is_some(),
        message,
    }
}

fn nodata_read(nodata: &NoDataItem) -> NoDataRead {
    NoDataRead {
        people: nodata.people.clone(),
        tally: (&nodata.tally).into(),
    }
}

impl Session {
    /// Le CRM `path` en données : colonnes du Kanban avec leurs actions, personnes, entreprises,
    /// projets, étapes ; les filtres de l'interface y sont facultatifs (fiche 0081).
    pub(super) fn tool_read_crm(&self, arguments: &Value) -> Result<String, String> {
        let said = |error: ApiError| error.message;
        let path = required(arguments, "path")?;
        let filters = filters_of(arguments)?;
        let item = self.read_crm(path, filters, None).map_err(said)?;
        let note = NotePath::parse(path)
            .map_err(ApiError::from)
            .map_err(said)?;
        written(&crm_read(&note, &item))
    }
}
