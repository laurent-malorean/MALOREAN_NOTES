//! Commandes du CRM (fiche 0058) : chacune lit la requête, appelle un seul cas d'usage, met la
//! réponse en forme.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{
    ApiError, CrmActionChangeItem, CrmActionDraftItem, CrmCompanyChangeItem, CrmFiltersItem,
    CrmItem, CrmPersonChangeItem, CrmProjectChangeItem, PlacementItem, SavedNote, StageChangeItem,
};

/// Crée dans `folder` un CRM titré `title`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_crm`].
#[tauri::command]
pub async fn create_crm(
    session: SharedSession<'_>,
    folder: String,
    title: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_crm(&folder, &title)).await
}

/// Le CRM de la note, avec ses colonnes du Kanban, Ma semaine et ses compteurs.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::read_crm`].
#[tauri::command]
pub async fn read_crm(
    session: SharedSession<'_>,
    path: String,
    filters: CrmFiltersItem,
    week_day: Option<String>,
) -> Result<CrmItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_crm(&path, filters, week_day.as_deref())).await
}

/// Dit si l'e-mail est déjà celui d'une autre personne du CRM.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::crm_email_is_known`].
#[tauri::command]
pub async fn crm_email_is_known(
    session: SharedSession<'_>,
    crm: String,
    email: String,
    except: Option<String>,
) -> Result<bool, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.crm_email_is_known(&crm, &email, except.as_deref())).await
}

/// Crée une action dans le CRM.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_crm_action`].
#[tauri::command]
pub async fn create_crm_action(
    session: SharedSession<'_>,
    crm: String,
    draft: CrmActionDraftItem,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_crm_action(&crm, draft)).await
}

/// Fait un geste sur une action.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_crm_action`].
#[tauri::command]
pub async fn change_crm_action(
    session: SharedSession<'_>,
    crm: String,
    action: String,
    change: CrmActionChangeItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_crm_action(&crm, &action, change)).await
}

/// Lâche une carte dans une colonne du Kanban.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::move_crm_action`].
#[tauri::command]
pub async fn move_crm_action(
    session: SharedSession<'_>,
    crm: String,
    action: String,
    status: String,
    placement: PlacementItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.move_crm_action(&crm, &action, &status, placement)).await
}

/// Met une action à la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::delete_crm_action`].
#[tauri::command]
pub async fn delete_crm_action(
    session: SharedSession<'_>,
    crm: String,
    action: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.delete_crm_action(&crm, &action)).await
}

/// Crée une personne dans le CRM.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_crm_person`].
#[tauri::command]
pub async fn create_crm_person(
    session: SharedSession<'_>,
    crm: String,
    name: String,
    company: Option<String>,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_crm_person(&crm, &name, company.as_deref())).await
}

/// Fait un geste sur une personne.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_crm_person`].
#[tauri::command]
pub async fn change_crm_person(
    session: SharedSession<'_>,
    crm: String,
    person: String,
    change: CrmPersonChangeItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_crm_person(&crm, &person, change)).await
}

/// Met une personne à la corbeille et la retire de ses actions.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::delete_crm_person`].
#[tauri::command]
pub async fn delete_crm_person(
    session: SharedSession<'_>,
    crm: String,
    person: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.delete_crm_person(&crm, &person)).await
}

/// Crée une entreprise dans le CRM.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_crm_company`].
#[tauri::command]
pub async fn create_crm_company(
    session: SharedSession<'_>,
    crm: String,
    name: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_crm_company(&crm, &name)).await
}

/// Fait un geste sur une entreprise.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_crm_company`].
#[tauri::command]
pub async fn change_crm_company(
    session: SharedSession<'_>,
    crm: String,
    company: String,
    change: CrmCompanyChangeItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_crm_company(&crm, &company, change)).await
}

/// Met une entreprise à la corbeille ; ses personnes passent à NODATA.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::delete_crm_company`].
#[tauri::command]
pub async fn delete_crm_company(
    session: SharedSession<'_>,
    crm: String,
    company: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.delete_crm_company(&crm, &company)).await
}

/// Crée un projet dans le CRM.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_crm_project`].
#[tauri::command]
pub async fn create_crm_project(
    session: SharedSession<'_>,
    crm: String,
    name: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_crm_project(&crm, &name)).await
}

/// Fait un geste sur un projet.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_crm_project`].
#[tauri::command]
pub async fn change_crm_project(
    session: SharedSession<'_>,
    crm: String,
    project: String,
    change: CrmProjectChangeItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_crm_project(&crm, &project, change)).await
}

/// Met un projet à la corbeille ; ses actions passent à « Sans projet ».
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::delete_crm_project`].
#[tauri::command]
pub async fn delete_crm_project(
    session: SharedSession<'_>,
    crm: String,
    project: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.delete_crm_project(&crm, &project)).await
}

/// Change les étapes du CRM ; rend les nouvelles.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_crm_stages`].
#[tauri::command]
pub async fn change_crm_stages(
    session: SharedSession<'_>,
    crm: String,
    change: StageChangeItem,
) -> Result<Vec<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_crm_stages(&crm, change)).await
}
