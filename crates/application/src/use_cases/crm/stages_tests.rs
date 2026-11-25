use domain::crm::StageError;

use super::*;
use crate::testing::InMemoryNoteStore;
use crate::use_cases::RecoverGestures;
use crate::use_cases::crm::fixture::*;
use crate::{MemoryPendingGestures, PendingGestures};

fn change(store: &InMemoryNoteStore, change: StageChange) -> Result<Stages, AppError> {
    let pending = MemoryPendingGestures::default();
    let result = ChangeStages::new(store, &pending).execute(&crm(), &change);
    assert!(pending.interrupted().unwrap().is_empty());
    result
}

fn names(stages: &Stages) -> Vec<String> {
    stages.names()
}

#[test]
fn a_stage_is_added_before_done_and_written_in_the_crm() {
    let store = workspace();
    let stages = change(&store, StageChange::Add("Négo".to_owned())).unwrap();
    assert_eq!(names(&stages), ["Progress", "WaitingFor", "Négo"]);
    assert_eq!(
        text(&store, CRM),
        "---\ntype: crm\netapes: [Progress, WaitingFor, Négo]\n---\n# Clients\n"
    );
    assert_eq!(text(&store, DEVIS_PATH), DEVIS);
}

#[test]
fn a_renamed_stage_keeps_its_actions_and_their_rank() {
    let store = workspace();
    let stages = change(
        &store,
        StageChange::Rename {
            from: "progress".to_owned(),
            to: "En cours".to_owned(),
        },
    )
    .unwrap();
    assert_eq!(names(&stages), ["En cours", "WaitingFor"]);
    assert!(text(&store, CRM).contains("etapes: [En cours, WaitingFor]\n"));
    assert_eq!(
        text(&store, DEVIS_PATH),
        DEVIS.replace("statut: Progress", "statut: En cours")
    );
    assert_eq!(text(&store, APPEL_PATH), APPEL);
}

#[test]
fn a_removed_stage_sends_its_actions_back_to_todo_and_clears_their_rank() {
    let store = workspace();
    let stages = change(&store, StageChange::Remove("Progress".to_owned())).unwrap();
    assert_eq!(names(&stages), ["WaitingFor"]);
    assert_eq!(
        text(&store, DEVIS_PATH),
        DEVIS
            .replace("statut: Progress", "statut: TODO")
            .replace("rang: 1\n", "")
    );
    assert_eq!(text(&store, APPEL_PATH), APPEL);
    assert_eq!(text(&store, FAIT_PATH), FAIT);
}

#[test]
fn a_stage_is_moved_and_only_the_crm_is_written() {
    let store = workspace();
    let stages = change(
        &store,
        StageChange::Move {
            name: "WaitingFor".to_owned(),
            to: 0,
        },
    )
    .unwrap();
    assert_eq!(names(&stages), ["WaitingFor", "Progress"]);
    assert!(text(&store, CRM).contains("etapes: [WaitingFor, Progress]\n"));
    assert_eq!(text(&store, DEVIS_PATH), DEVIS);
}

#[test]
fn a_refused_change_writes_nothing() {
    let store = workspace();
    let refuse = |change_to: StageChange| change(&store, change_to).unwrap_err();
    assert_eq!(
        refuse(StageChange::Add("todo".to_owned())),
        AppError::CrmStage(StageError::FixedName)
    );
    assert_eq!(
        refuse(StageChange::Add("PROGRESS".to_owned())),
        AppError::CrmStage(StageError::Taken)
    );
    assert_eq!(
        refuse(StageChange::Add(" ".to_owned())),
        AppError::CrmStage(StageError::Empty)
    );
    assert_eq!(
        refuse(StageChange::Rename {
            from: "Progress".to_owned(),
            to: "WaitingFor".to_owned()
        }),
        AppError::CrmStage(StageError::Taken)
    );
    assert_eq!(
        refuse(StageChange::Remove("Absente".to_owned())),
        AppError::CrmStage(StageError::Unknown)
    );
    assert_eq!(
        refuse(StageChange::Move {
            name: "Absente".to_owned(),
            to: 0
        }),
        AppError::CrmStage(StageError::Unknown)
    );
    assert_eq!(text(&store, CRM), "---\ntype: crm\n---\n# Clients\n");
}

#[test]
fn an_interrupted_change_of_stages_is_finished_at_the_next_gesture() {
    let store = workspace();
    let pending = MemoryPendingGestures::default();
    store.fail_writes_to(&path(DEVIS_PATH));
    let failed = ChangeStages::new(&store, &pending)
        .execute(&crm(), &StageChange::Remove("Progress".to_owned()));
    assert!(matches!(failed, Err(AppError::StorageUnavailable(_))));
    store.stop_failing();
    RecoverGestures::new(&store, &pending).execute().unwrap();
    assert!(text(&store, DEVIS_PATH).contains("statut: TODO\n"));
    assert!(text(&store, CRM).contains("etapes: [WaitingFor]\n"));
}
