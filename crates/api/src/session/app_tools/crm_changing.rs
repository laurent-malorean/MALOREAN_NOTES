//! Les outils qui changent un CRM (fiche 0081) : chacun fabrique la requête que l'interface envoie
//! et appelle la même méthode de session que la commande de l'interface, donc le même cas d'usage,
//! les mêmes règles et les mêmes messages. Le changement d'une fiche prend une `operation` qui nomme
//! le geste de l'interface, un seul par appel.

use std::sync::Arc;

use application::KeepingStore;
use domain::NotePath;
use domain::app_tools::AppTool;
use domain::crm::{CrmKind, Day};
use serde_json::{Value, json};

use super::crm::{action_read, company_read, fiche_path, person_read, project_read};
use super::crm_budget::Room;
use super::{given, optional, required, written};
use crate::session::{OpenWorkspaceState, Session, redirect};
use crate::{
    ApiError, BodyChangeItem, CrmActionChangeItem, CrmActionDraftItem, CrmCompanyChangeItem,
    CrmFiltersItem, CrmItem, CrmPersonChangeItem, CrmProjectChangeItem, PlacementItem,
    StageChangeItem,
};

/// Ce que dit l'application quand une fiche n'existe plus.
const FICHE_GONE: &str = "Cette fiche n'existe plus.";

/// Ce que l'application a dit de l'échec, avec, pour une fiche disparue, ce que l'IA peut en faire :
/// une référence se vérifie avec `read_crm`.
fn said(error: impl Into<ApiError>) -> String {
    let message = error.into().message;
    if message == FICHE_GONE {
        format!("{FICHE_GONE} Vérifiez la référence avec read_crm : c'est le `ref` de la fiche.")
    } else {
        message
    }
}

/// Un texte que l'opération exige, vide permis (pour le retirer, ou pour que l'application le
/// refuse avec son message).
fn exact<'a>(arguments: &'a Value, field: &str) -> Result<&'a str, String> {
    given(arguments, field)
}

/// Un texte que l'opération exige et dont le vide retire la valeur : `None` s'il est vide.
fn clearable(arguments: &Value, field: &str) -> Result<Option<String>, String> {
    let text = exact(arguments, field)?;
    Ok((!text.trim().is_empty()).then(|| text.to_owned()))
}

/// Une liste de textes, vide si absente.
fn texts_of(arguments: &Value, field: &str) -> Result<Vec<String>, String> {
    let wrong = || format!("« {field} » est une liste de textes");
    match &arguments[field] {
        Value::Null => Ok(Vec::new()),
        Value::Array(items) => items
            .iter()
            .map(|item| item.as_str().map(str::to_owned).ok_or_else(wrong))
            .collect(),
        _ => Err(wrong()),
    }
}

/// Une place (liste, élément, commentaire), à partir de 0, que l'opération exige.
fn place_of(arguments: &Value, field: &str) -> Result<u32, String> {
    let place = arguments[field]
        .as_u64()
        .and_then(|place| u32::try_from(place).ok());
    place.ok_or_else(|| {
        if arguments[field].is_null() {
            format!("il manque « {field} »")
        } else {
            format!("« {field} » doit être un entier à partir de 0")
        }
    })
}

/// Un oui ou un non facultatif : non si absent.
fn flag(arguments: &Value, field: &str) -> Result<bool, String> {
    match &arguments[field] {
        Value::Null => Ok(false),
        Value::Bool(value) => Ok(*value),
        _ => Err(format!("« {field} » doit être true ou false")),
    }
}

/// L'opération demandée, parmi celles que connaît l'outil.
fn operation_of<'a>(
    arguments: &'a Value,
    tool: AppTool,
    known: &[&str],
) -> Result<&'a str, String> {
    let operation = required(arguments, "operation")?;
    if known.contains(&operation) {
        Ok(operation)
    } else {
        let named: Vec<String> = known.iter().map(|name| format!("`{name}`")).collect();
        Err(format!(
            "« {operation} » n'est pas une opération de {} : {}",
            tool.name(),
            named.join(", ")
        ))
    }
}

const PERSON_OPERATIONS: [&str; 4] = ["rename", "field", "notes", "company"];
const COMPANY_OPERATIONS: [&str; 3] = ["rename", "field", "notes"];
const PROJECT_OPERATIONS: [&str; 2] = ["rename", "color"];
const STAGE_OPERATIONS: [&str; 4] = ["add", "rename", "remove", "move"];

const ACTION_OPERATIONS: [&str; 19] = [
    "title",
    "date",
    "channel",
    "project",
    "color",
    "linked_notes",
    "add_person",
    "remove_person",
    "description",
    "add_checklist",
    "rename_checklist",
    "remove_checklist",
    "add_item",
    "edit_item",
    "check_item",
    "remove_item",
    "add_comment",
    "edit_comment",
    "remove_comment",
];

/// Le geste de l'interface sur un champ d'une action, ou rien si l'opération parle du texte.
fn action_field_change(
    operation: &str,
    arguments: &Value,
) -> Result<Option<CrmActionChangeItem>, String> {
    use CrmActionChangeItem as Change;
    let person = || required(arguments, "person").map(str::to_owned);
    Ok(Some(match operation {
        "title" => Change::Title {
            title: exact(arguments, "title")?.to_owned(),
        },
        "date" => Change::Date {
            date: exact(arguments, "date")?.to_owned(),
        },
        "channel" => Change::Channel {
            channel: clearable(arguments, "channel")?,
        },
        "project" => Change::Project {
            project: clearable(arguments, "project")?,
        },
        "color" => Change::Color {
            color: clearable(arguments, "color")?,
        },
        "linked_notes" => Change::LinkedNotes {
            notes: texts_of(arguments, "linked_notes")?,
        },
        "add_person" => Change::AddPerson { person: person()? },
        "remove_person" => Change::RemovePerson { person: person()? },
        _ => return Ok(None),
    }))
}

/// Le geste de l'interface sur la description, les listes à cocher ou les commentaires d'une action.
fn action_body_change(operation: &str, arguments: &Value) -> Result<BodyChangeItem, String> {
    use BodyChangeItem as Body;
    let text = || exact(arguments, "text").map(str::to_owned);
    let name = || exact(arguments, "name").map(str::to_owned);
    let list = || place_of(arguments, "list");
    let item = || place_of(arguments, "item");
    let comment = || place_of(arguments, "comment");
    Ok(match operation {
        "description" => Body::Description { text: text()? },
        "add_checklist" => Body::AddChecklist { name: name()? },
        "rename_checklist" => Body::RenameChecklist {
            list: list()?,
            name: name()?,
        },
        "remove_checklist" => Body::RemoveChecklist { list: list()? },
        "add_item" => Body::AddItem {
            list: list()?,
            text: text()?,
        },
        "edit_item" => Body::EditItem {
            list: list()?,
            item: item()?,
            text: text()?,
        },
        "check_item" => Body::CheckItem {
            list: list()?,
            item: item()?,
            done: arguments["done"]
                .as_bool()
                .ok_or("il manque « done » (true pour cocher, false pour décocher)")?,
        },
        "remove_item" => Body::RemoveItem {
            list: list()?,
            item: item()?,
        },
        "add_comment" => Body::AddComment { text: text()? },
        "edit_comment" => Body::EditComment {
            comment: comment()?,
            text: text()?,
        },
        _ => Body::RemoveComment {
            comment: comment()?,
        },
    })
}

/// Le geste de l'interface sur une personne.
fn person_change(
    operation: &str,
    arguments: &Value,
    today: Day,
) -> Result<CrmPersonChangeItem, String> {
    Ok(match operation {
        "rename" => CrmPersonChangeItem::Rename {
            name: exact(arguments, "name")?.to_owned(),
        },
        "field" => CrmPersonChangeItem::Field {
            field: required(arguments, "field")?.to_owned(),
            value: exact(arguments, "value")?.to_owned(),
        },
        "notes" => CrmPersonChangeItem::Notes {
            notes: exact(arguments, "notes")?.to_owned(),
        },
        _ => CrmPersonChangeItem::Company {
            company: clearable(arguments, "company")?,
            day: optional(arguments, "day").map_or_else(|| today.to_string(), str::to_owned),
        },
    })
}

/// Le geste de l'interface sur une entreprise.
fn company_change(operation: &str, arguments: &Value) -> Result<CrmCompanyChangeItem, String> {
    Ok(match operation {
        "rename" => CrmCompanyChangeItem::Rename {
            name: exact(arguments, "name")?.to_owned(),
        },
        "field" => CrmCompanyChangeItem::Field {
            field: required(arguments, "field")?.to_owned(),
            value: exact(arguments, "value")?.to_owned(),
        },
        _ => CrmCompanyChangeItem::Notes {
            notes: exact(arguments, "notes")?.to_owned(),
        },
    })
}

/// Le geste de l'interface sur un projet.
fn project_change(operation: &str, arguments: &Value) -> Result<CrmProjectChangeItem, String> {
    Ok(match operation {
        "rename" => CrmProjectChangeItem::Rename {
            name: exact(arguments, "name")?.to_owned(),
        },
        _ => CrmProjectChangeItem::Color {
            color: exact(arguments, "color")?.to_owned(),
        },
    })
}

/// Le changement des étapes.
fn stage_change(operation: &str, arguments: &Value) -> Result<StageChangeItem, String> {
    Ok(match operation {
        "add" => StageChangeItem::Add {
            name: exact(arguments, "name")?.to_owned(),
        },
        "rename" => StageChangeItem::Rename {
            from: exact(arguments, "from")?.to_owned(),
            to: exact(arguments, "to")?.to_owned(),
        },
        "remove" => StageChangeItem::Remove {
            name: exact(arguments, "name")?.to_owned(),
        },
        _ => StageChangeItem::Move {
            name: exact(arguments, "name")?.to_owned(),
            to: place_of(arguments, "position")?,
        },
    })
}

/// La place de la carte lâchée : avant une carte, tout en bas, ou nulle part.
fn placement_of(arguments: &Value) -> Result<PlacementItem, String> {
    let before = optional(arguments, "before");
    match (before, flag(arguments, "at_end")?) {
        (Some(_), true) => {
            Err("donnez soit « before » (juste avant cette carte), soit « at_end » (tout en bas), pas les deux".to_owned())
        }
        (Some(card), false) => Ok(PlacementItem::Before {
            card: Some(card.to_owned()),
        }),
        (None, true) => Ok(PlacementItem::Before { card: None }),
        (None, false) => Ok(PlacementItem::Unplaced),
    }
}

/// Le brouillon de l'action que l'IA décrit : ce que la fenêtre d'une action demande.
fn draft_of(arguments: &Value) -> Result<CrmActionDraftItem, String> {
    let some = |field: &str| optional(arguments, field).map(str::to_owned);
    Ok(CrmActionDraftItem {
        title: exact(arguments, "title")?.to_owned(),
        status: some("status"),
        date: some("date"),
        people: texts_of(arguments, "people")?,
        channel: some("channel"),
        project: some("project"),
        color: some("color"),
        tags: texts_of(arguments, "tags")?,
        linked_notes: texts_of(arguments, "linked_notes")?,
        description: some("description").unwrap_or_default(),
    })
}

/// Ce que rend une création : le CRM, la référence et le chemin de la fiche.
fn created(crm: &NotePath, kind: CrmKind, reference: &str) -> Result<String, String> {
    written(&json!({
        "path": crm.to_path(),
        "ref": reference,
        "fiche": fiche_path(crm, kind, reference),
    }))
}

/// Ce que rend une suppression : le CRM et la référence de la fiche mise à la corbeille.
fn deleted(crm: &NotePath, reference: &str) -> Result<String, String> {
    written(&json!({ "path": crm.to_path(), "deleted": reference }))
}

impl Session {
    /// Le CRM `path` tel que l'interface le lit, sans filtre.
    fn whole_crm(&self, path: &str) -> Result<(NotePath, CrmItem), String> {
        let item = self
            .read_crm(path, CrmFiltersItem::default(), None)
            .map_err(said)?;
        let note = NotePath::parse(path)
            .map_err(ApiError::from)
            .map_err(said)?;
        Ok((note, item))
    }

    /// Joue un outil qui change un CRM, dans un espace dont chaque écriture garde d'abord le texte
    /// d'avant dans l'historique des versions (le changement d'une IA s'annule), puis demande le
    /// calcul du sens des fiches changées.
    pub(super) fn call_crm_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        let opened = self.opened().map_err(said)?;
        let keeping = KeepingStore::new(
            Arc::clone(&opened.store),
            Arc::clone(&opened.history),
            Arc::clone(&self.clock),
        );
        let state = OpenWorkspaceState {
            store: Arc::new(keeping),
            ..opened
        };
        let answer = redirect::run(state, || self.play_crm_tool(tool, arguments))?;
        self.worker.request();
        Ok(answer)
    }

    fn play_crm_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        match tool {
            AppTool::CreateCrmAction
            | AppTool::ChangeCrmAction
            | AppTool::MoveCrmAction
            | AppTool::DeleteCrmAction => self.call_action_tool(tool, arguments),
            AppTool::CreateCrmPerson | AppTool::ChangeCrmPerson | AppTool::DeleteCrmPerson => {
                self.call_person_tool(tool, arguments)
            }
            AppTool::CreateCrmCompany | AppTool::ChangeCrmCompany | AppTool::DeleteCrmCompany => {
                self.call_company_tool(tool, arguments)
            }
            AppTool::CreateCrmProject | AppTool::ChangeCrmProject | AppTool::DeleteCrmProject => {
                self.call_project_tool(tool, arguments)
            }
            _ => self.call_stages_tool(arguments),
        }
    }

    /// La fiche `reference` de l'action, telle que `read_crm` la montre après le geste.
    fn action_changed(&self, path: &str, reference: &str) -> Result<String, String> {
        let (note, item) = self.whole_crm(path)?;
        let action = item
            .actions
            .iter()
            .find(|action| action.name == reference)
            .map(|action| action_read(&note, action, &mut Room::of(usize::MAX)));
        written(&json!({ "path": note.to_path(), "action": action }))
    }

    fn call_action_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        match tool {
            AppTool::CreateCrmAction => {
                let reference = self
                    .create_crm_action(path, draft_of(arguments)?)
                    .map_err(said)?;
                let note = NotePath::parse(path)
                    .map_err(ApiError::from)
                    .map_err(said)?;
                created(&note, CrmKind::Action, &reference)
            }
            AppTool::ChangeCrmAction => {
                let action = required(arguments, "action")?;
                let operation = operation_of(arguments, tool, &ACTION_OPERATIONS)?;
                let change = match action_field_change(operation, arguments)? {
                    Some(change) => change,
                    None => CrmActionChangeItem::Body {
                        change: action_body_change(operation, arguments)?,
                    },
                };
                self.change_crm_action(path, action, change).map_err(said)?;
                self.action_changed(path, action)
            }
            AppTool::MoveCrmAction => {
                let action = required(arguments, "action")?;
                let status = exact(arguments, "status")?;
                self.move_crm_action(path, action, status, placement_of(arguments)?)
                    .map_err(said)?;
                self.action_changed(path, action)
            }
            _ => {
                let action = required(arguments, "action")?;
                self.delete_crm_action(path, action).map_err(said)?;
                let note = NotePath::parse(path)
                    .map_err(ApiError::from)
                    .map_err(said)?;
                deleted(&note, action)
            }
        }
    }

    /// La fiche `reference` de la sorte `part` (`person`, `company`, `project`), telle que
    /// `read_crm` la montre après le geste.
    fn fiche_changed(&self, path: &str, part: &str, reference: &str) -> Result<Value, String> {
        let (note, item) = self.whole_crm(path)?;
        let mut room = Room::of(usize::MAX);
        let view = match part {
            "person" => item
                .people
                .iter()
                .find(|person| person.name == reference)
                .map(|person| json!(person_read(&note, person, &mut room))),
            "company" => item
                .companies
                .iter()
                .find(|company| company.name == reference)
                .map(|company| json!(company_read(&note, company, &mut room))),
            _ => item
                .projects
                .iter()
                .find(|project| project.name == reference)
                .map(|project| json!(project_read(&note, project))),
        };
        Ok(json!({ "path": note.to_path(), part: view }))
    }

    fn call_person_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let note = NotePath::parse(path)
            .map_err(ApiError::from)
            .map_err(said)?;
        match tool {
            AppTool::CreateCrmPerson => {
                let company = optional(arguments, "company");
                let reference = self
                    .create_crm_person(path, exact(arguments, "name")?, company)
                    .map_err(said)?;
                created(&note, CrmKind::Person, &reference)
            }
            AppTool::ChangeCrmPerson => self.change_person(path, arguments),
            _ => {
                let person = required(arguments, "person")?;
                self.delete_crm_person(path, person).map_err(said)?;
                deleted(&note, person)
            }
        }
    }

    /// Le geste sur une personne ; un e-mail déjà connu d'une autre personne est gardé, avec un
    /// avertissement, comme dans l'interface.
    fn change_person(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let person = required(arguments, "person")?;
        let operation = operation_of(arguments, AppTool::ChangeCrmPerson, &PERSON_OPERATIONS)?;
        let today = Day::from_moment(self.clock.now()).map_err(|error| error.to_string())?;
        let change = person_change(operation, arguments, today)?;
        let duplicate = match &change {
            CrmPersonChangeItem::Field { field, value }
                if field == "email" && !value.is_empty() =>
            {
                self.crm_email_is_known(path, value, Some(person))
                    .map_err(said)?
            }
            _ => false,
        };
        self.change_crm_person(path, person, change).map_err(said)?;
        let mut answer = self.fiche_changed(path, "person", person)?;
        if duplicate {
            answer["warning"] = json!(
                "cet e-mail est déjà celui d'une autre personne du CRM (risque de doublon) ; il est gardé"
            );
        }
        written(&answer)
    }

    fn call_company_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let note = NotePath::parse(path)
            .map_err(ApiError::from)
            .map_err(said)?;
        match tool {
            AppTool::CreateCrmCompany => {
                let reference = self
                    .create_crm_company(path, exact(arguments, "name")?)
                    .map_err(said)?;
                created(&note, CrmKind::Company, &reference)
            }
            AppTool::ChangeCrmCompany => {
                let company = required(arguments, "company")?;
                let operation = operation_of(arguments, tool, &COMPANY_OPERATIONS)?;
                let change = company_change(operation, arguments)?;
                self.change_crm_company(path, company, change)
                    .map_err(said)?;
                written(&self.fiche_changed(path, "company", company)?)
            }
            _ => {
                let company = required(arguments, "company")?;
                self.delete_crm_company(path, company).map_err(said)?;
                deleted(&note, company)
            }
        }
    }

    fn call_project_tool(&self, tool: AppTool, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let note = NotePath::parse(path)
            .map_err(ApiError::from)
            .map_err(said)?;
        match tool {
            AppTool::CreateCrmProject => {
                let reference = self
                    .create_crm_project(path, exact(arguments, "name")?)
                    .map_err(said)?;
                created(&note, CrmKind::Project, &reference)
            }
            AppTool::ChangeCrmProject => {
                let project = required(arguments, "project")?;
                let operation = operation_of(arguments, tool, &PROJECT_OPERATIONS)?;
                let change = project_change(operation, arguments)?;
                self.change_crm_project(path, project, change)
                    .map_err(said)?;
                written(&self.fiche_changed(path, "project", project)?)
            }
            _ => {
                let project = required(arguments, "project")?;
                self.delete_crm_project(path, project).map_err(said)?;
                deleted(&note, project)
            }
        }
    }

    fn call_stages_tool(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let operation = operation_of(arguments, AppTool::ChangeCrmStages, &STAGE_OPERATIONS)?;
        let change = stage_change(operation, arguments)?;
        let stages = self.change_crm_stages(path, change).map_err(said)?;
        written(&json!({ "path": path, "stages": stages }))
    }
}
