use super::*;

fn names(stages: &Stages) -> Vec<String> {
    stages.names()
}

fn strings(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

fn read(names: &[&str]) -> Stages {
    Stages::read(&strings(names))
}

#[test]
fn a_stage_has_a_name_of_one_line_of_forty_characters_at_most() {
    assert_eq!(
        Stage::parse("  Négociation ").unwrap().as_str(),
        "Négociation"
    );
    assert!(Stage::parse(&"é".repeat(40)).is_ok());
    assert_eq!(Stage::parse(&"é".repeat(41)), Err(StageError::TooLong));
    assert_eq!(Stage::parse(""), Err(StageError::Empty));
    assert_eq!(Stage::parse(" \t "), Err(StageError::Empty));
    assert_eq!(Stage::parse("a\nb"), Err(StageError::NotOneLine));
    assert_eq!(Stage::parse("a\rb"), Err(StageError::NotOneLine));
}

#[test]
fn a_stage_is_never_named_like_a_fixed_column() {
    for fixed in ["TODO", "todo", "Done", "DONE", "cancel", "Cancel", " Dóne "] {
        assert_eq!(Stage::parse(fixed), Err(StageError::FixedName), "{fixed}");
    }
    assert!(Stage::parse("TODO list").is_ok());
    assert!(Stage::parse("Donee").is_ok());
}

#[test]
fn a_refused_name_says_why() {
    assert_eq!(StageError::Empty.to_string(), "Le nom de l'étape est vide.");
    assert_eq!(
        StageError::NotOneLine.to_string(),
        "Le nom de l'étape tient sur une seule ligne."
    );
    assert_eq!(
        StageError::TooLong.to_string(),
        "Le nom de l'étape fait 40 caractères au plus."
    );
    assert_eq!(
        StageError::FixedName.to_string(),
        "« TODO », « Done » et « Cancel » sont déjà des colonnes."
    );
    assert_eq!(
        StageError::Taken.to_string(),
        "Une autre étape porte déjà ce nom."
    );
    assert_eq!(StageError::Unknown.to_string(), "Cette étape n'existe pas.");
}

#[test]
fn a_crm_without_chosen_stages_has_progress_then_waiting_for() {
    assert_eq!(
        names(&Stages::default()),
        strings(&["Progress", "WaitingFor"])
    );
}

#[test]
fn reading_stages_leaves_aside_the_names_that_are_not_valid_or_repeated() {
    let stages = read(&[
        "Négo",
        "",
        "done",
        "negó",
        "X",
        " Négo ",
        &"a".repeat(41),
        "TODO",
    ]);
    assert_eq!(names(&stages), strings(&["Négo", "X"]));
    assert_eq!(names(&read(&[])), Vec::<String>::new());
    assert_eq!(stages.as_slice().len(), 2);
}

#[test]
fn a_stage_is_found_whatever_its_case_and_accents() {
    let stages = read(&["Négociation", "Relance"]);
    assert_eq!(
        stages.find("NEGOCIATION").map(Stage::as_str),
        Some("Négociation")
    );
    assert_eq!(stages.find(" relance ").map(Stage::as_str), Some("Relance"));
    assert_eq!(stages.find("Autre"), None);
}

#[test]
fn a_stage_is_added_at_the_end() {
    let stages = read(&["A"]).added(" B ").unwrap();
    assert_eq!(names(&stages), strings(&["A", "B"]));
    assert_eq!(names(&read(&[]).added("A").unwrap()), strings(&["A"]));
}

#[test]
fn an_added_stage_cannot_repeat_another_or_be_refused() {
    let stages = read(&["A", "B"]);
    assert_eq!(stages.added("b"), Err(StageError::Taken));
    assert_eq!(stages.added("Todo"), Err(StageError::FixedName));
    assert_eq!(stages.added(""), Err(StageError::Empty));
}

#[test]
fn a_renamed_stage_keeps_its_place() {
    let stages = read(&["A", "B", "C"]);
    assert_eq!(
        names(&stages.renamed("b", "Z").unwrap()),
        strings(&["A", "Z", "C"])
    );
    assert_eq!(
        names(&stages.renamed("A", "É").unwrap()),
        strings(&["É", "B", "C"])
    );
}

#[test]
fn a_stage_can_change_its_case_but_not_take_the_name_of_another() {
    let stages = read(&["Relance", "B"]);
    assert_eq!(
        names(&stages.renamed("relance", "RELANCE").unwrap()),
        strings(&["RELANCE", "B"])
    );
    assert_eq!(
        names(&stages.renamed("Relance", "Relance").unwrap()),
        strings(&["Relance", "B"])
    );
    assert_eq!(stages.renamed("Relance", "b"), Err(StageError::Taken));
    assert_eq!(
        stages.renamed("Relance", "Done"),
        Err(StageError::FixedName)
    );
    assert_eq!(stages.renamed("Relance", " "), Err(StageError::Empty));
    assert_eq!(stages.renamed("Autre", "C"), Err(StageError::Unknown));
}

#[test]
fn a_removed_stage_leaves_the_others_in_order() {
    let stages = read(&["A", "B", "C"]);
    assert_eq!(names(&stages.removed("b").unwrap()), strings(&["A", "C"]));
    assert_eq!(stages.removed("Z"), Err(StageError::Unknown));
    assert_eq!(
        names(&read(&["A"]).removed("A").unwrap()),
        Vec::<String>::new()
    );
}

#[test]
fn a_moved_stage_takes_the_place_it_is_dropped_at() {
    let stages = read(&["A", "B", "C", "D"]);
    assert_eq!(
        names(&stages.moved("a", 2).unwrap()),
        strings(&["B", "C", "A", "D"])
    );
    assert_eq!(
        names(&stages.moved("D", 0).unwrap()),
        strings(&["D", "A", "B", "C"])
    );
    assert_eq!(
        names(&stages.moved("B", 1).unwrap()),
        strings(&["A", "B", "C", "D"])
    );
    assert_eq!(
        names(&stages.moved("A", 99).unwrap()),
        strings(&["B", "C", "D", "A"])
    );
    assert_eq!(stages.moved("Z", 0), Err(StageError::Unknown));
}

#[test]
fn a_status_is_the_name_of_a_column_whatever_its_case_and_accents() {
    let stages = read(&["Négociation"]);
    let status = |text| Status::read(Some(text), &stages);
    assert_eq!(status("TODO"), Status::Todo);
    assert_eq!(status("todo"), Status::Todo);
    assert_eq!(status("DONE"), Status::Done);
    assert_eq!(status("done"), Status::Done);
    assert_eq!(status("Cancel"), Status::Cancel);
    assert_eq!(status("CANCEL"), Status::Cancel);
    assert_eq!(
        status("negociation"),
        Status::Stage(Stage::parse("Négociation").unwrap())
    );
}

#[test]
fn an_absent_or_unknown_status_is_todo() {
    let stages = read(&["A"]);
    assert_eq!(Status::read(None, &stages), Status::Todo);
    assert_eq!(Status::read(Some("Progress"), &stages), Status::Todo);
    assert_eq!(Status::read(Some(""), &stages), Status::Todo);
}

#[test]
fn a_status_is_written_as_its_column() {
    let stages = read(&["Négociation"]);
    assert_eq!(
        Status::read(Some("negociation"), &stages).name(),
        "Négociation"
    );
    assert_eq!(Status::Todo.name(), "TODO");
    assert_eq!(Status::Done.name(), "Done");
    assert_eq!(Status::Cancel.name(), "Cancel");
}

#[test]
fn an_action_is_open_in_todo_or_in_a_stage_and_closed_otherwise() {
    let stage = Status::Stage(Stage::parse("A").unwrap());
    assert!(Status::Todo.is_open() && !Status::Todo.is_closed());
    assert!(stage.is_open() && !stage.is_closed());
    assert!(Status::Done.is_closed() && !Status::Done.is_open());
    assert!(Status::Cancel.is_closed() && !Status::Cancel.is_open());
}

#[test]
fn the_columns_are_todo_the_stages_then_done_and_cancel() {
    let columns = |stages: &Stages| -> Vec<String> {
        Status::columns(stages)
            .iter()
            .map(|s| s.name().to_owned())
            .collect()
    };
    assert_eq!(
        columns(&Stages::default()),
        strings(&["TODO", "Progress", "WaitingFor", "Done", "Cancel"])
    );
    assert_eq!(columns(&read(&[])), strings(&["TODO", "Done", "Cancel"]));
}
