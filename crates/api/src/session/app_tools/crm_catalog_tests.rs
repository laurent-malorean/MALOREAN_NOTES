//! Les descriptions des outils du CRM (fiche 0081) : leurs champs, ce qu'ils rendent, ce qui est
//! refusé, dits à l'IA.

use domain::app_tools::AppTool;

use super::catalog::tool_description;

fn fields(tool: AppTool) -> Vec<String> {
    let mut fields: Vec<_> = tool_description(tool)["inputSchema"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    fields.sort();
    fields
}

fn description(tool: AppTool) -> String {
    tool_description(tool)["description"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn says(tool: AppTool, expected: &[&str]) {
    let description = description(tool);
    for word in expected {
        assert!(description.contains(word), "{tool:?} : {word}");
    }
}

#[test]
fn reading_a_crm_takes_its_path_and_the_filters_of_the_screen() {
    assert_eq!(
        fields(AppTool::ReadCrm),
        [
            "company",
            "path",
            "person",
            "projects",
            "search",
            "tags",
            "workspace"
        ]
    );
}

#[test]
fn reading_a_crm_tells_what_it_gives_how_it_is_cut_and_how_to_list_the_crms() {
    says(
        AppTool::ReadCrm,
        &[
            "`columns`",
            "`people`",
            "`companies`",
            "`projects`",
            "`nodata`",
            "`stages`",
            "`ref`",
            "`fiche`",
            "`late_days`",
            "`due_today`",
            "`checklists`",
            "`comments`",
            "`index`",
            "`tally`",
            "`career`",
            "34 000 caractères pour les actions",
            "`truncated`",
            "`message`",
            "jamais de coupure silencieuse",
            "NODATA : les personnes sans entreprise",
            "`search_notes`",
            "`content_type` : `crm`",
            "Refusé si la note n'est pas un CRM",
        ],
    );
}

const EXPECTED_FIELDS: [(AppTool, &[&str]); 14] = [
    (
        AppTool::CreateCrmAction,
        &[
            "channel",
            "color",
            "date",
            "description",
            "linked_notes",
            "path",
            "people",
            "project",
            "status",
            "tags",
            "title",
            "workspace",
        ],
    ),
    (
        AppTool::ChangeCrmAction,
        &[
            "action",
            "channel",
            "color",
            "comment",
            "date",
            "done",
            "item",
            "linked_notes",
            "list",
            "name",
            "operation",
            "path",
            "person",
            "project",
            "text",
            "title",
            "workspace",
        ],
    ),
    (
        AppTool::MoveCrmAction,
        &["action", "at_end", "before", "path", "status", "workspace"],
    ),
    (AppTool::DeleteCrmAction, &["action", "path", "workspace"]),
    (
        AppTool::CreateCrmPerson,
        &["company", "name", "path", "workspace"],
    ),
    (
        AppTool::ChangeCrmPerson,
        &[
            "company",
            "day",
            "field",
            "name",
            "notes",
            "operation",
            "path",
            "person",
            "value",
            "workspace",
        ],
    ),
    (AppTool::DeleteCrmPerson, &["path", "person", "workspace"]),
    (AppTool::CreateCrmCompany, &["name", "path", "workspace"]),
    (
        AppTool::ChangeCrmCompany,
        &[
            "company",
            "field",
            "name",
            "notes",
            "operation",
            "path",
            "value",
            "workspace",
        ],
    ),
    (AppTool::DeleteCrmCompany, &["company", "path", "workspace"]),
    (AppTool::CreateCrmProject, &["name", "path", "workspace"]),
    (
        AppTool::ChangeCrmProject,
        &["color", "name", "operation", "path", "project", "workspace"],
    ),
    (AppTool::DeleteCrmProject, &["path", "project", "workspace"]),
    (
        AppTool::ChangeCrmStages,
        &[
            "from",
            "name",
            "operation",
            "path",
            "position",
            "to",
            "workspace",
        ],
    ),
];

#[test]
fn each_tool_that_changes_a_crm_takes_the_fields_of_its_decision() {
    for (tool, expected) in EXPECTED_FIELDS {
        assert_eq!(fields(tool), expected, "{tool:?}");
    }
}

#[test]
fn creating_an_action_tells_the_defaults_the_refusals_and_what_it_gives_back() {
    says(
        AppTool::CreateCrmAction,
        &[
            "`title` seul suffit",
            "aujourd'hui et le statut `TODO`",
            "titre vide ou sur plusieurs lignes",
            "`Cette fiche n'existe plus.`",
            "couleur hors palette",
            "`ref`",
            "`fiche`",
            "`add_tags`",
        ],
    );
}

#[test]
fn changing_an_action_lists_every_operation_and_where_the_status_and_the_tags_go() {
    says(
        AppTool::ChangeCrmAction,
        &[
            "`operation`",
            "`title`",
            "`date`",
            "`channel`",
            "`project`",
            "`color`",
            "`linked_notes`",
            "`add_person`",
            "`remove_person`",
            "`description`",
            "`add_checklist`",
            "`rename_checklist`",
            "`remove_checklist`",
            "`add_item`",
            "`edit_item`",
            "`check_item`",
            "`remove_item`",
            "`add_comment`",
            "`edit_comment`",
            "`remove_comment`",
            "compte rendu, ajoutez un commentaire",
            "`index`",
            "avec `move_crm_action`",
            "`add_tags` et `remove_tags`",
            "historique des versions",
        ],
    );
}

#[test]
fn moving_an_action_tells_the_places_and_the_closed_columns() {
    says(
        AppTool::MoveCrmAction,
        &[
            "comme glisser sa carte",
            "`before`",
            "`at_end`",
            "`Done`, `Cancel`) ne se range pas",
            "`status` qui n'est pas une colonne de ce CRM",
        ],
    );
}

#[test]
fn deleting_a_fiche_goes_to_the_trash_and_asks_for_the_users_request() {
    for tool in [
        AppTool::DeleteCrmAction,
        AppTool::DeleteCrmPerson,
        AppTool::DeleteCrmCompany,
        AppTool::DeleteCrmProject,
    ] {
        says(
            tool,
            &[
                "corbeille de MALOREAN Notes",
                "Ne supprimez rien sans que l'utilisateur le demande",
                "`Cette fiche n'existe plus.`",
                "`deleted`",
            ],
        );
    }
}

#[test]
fn people_companies_projects_and_stages_tell_their_operations_and_effects() {
    says(
        AppTool::ChangeCrmPerson,
        &[
            "`rename`",
            "`field`",
            "`role`, `email`, `phone` ou `linkedin`",
            "`notes`",
            "`company`",
            "« Changer d'entreprise »",
            "`warning`",
        ],
    );
    says(
        AppTool::ChangeCrmCompany,
        &[
            "`rename`",
            "`field`",
            "`site`, `sector`, `address` ou `phone`",
            "`notes`",
        ],
    );
    says(
        AppTool::ChangeCrmProject,
        &["`rename`", "`color`", "couleur de la palette"],
    );
    says(
        AppTool::ChangeCrmStages,
        &[
            "`add`",
            "`rename`",
            "`remove`",
            "`move`",
            "`position`",
            "tous ensemble, ou aucun",
            "40 caractères au plus",
            "repartent en `TODO`",
        ],
    );
    says(
        AppTool::DeleteCrmCompany,
        &["Chacune de ses personnes passe à NODATA"],
    );
    says(AppTool::DeleteCrmProject, &["« Sans projet »"]);
    says(
        AppTool::DeleteCrmPerson,
        &["retire de la liste des personnes"],
    );
    says(AppTool::CreateCrmProject, &["la moins utilisée"]);
}

#[test]
fn creating_a_crm_and_the_note_tools_send_to_the_crm_tools_not_to_the_file_tools() {
    says(
        AppTool::CreateCrm,
        &[
            "`read_crm`",
            "outils du CRM",
            "`create_crm_action`",
            "jamais à la main",
        ],
    );
    assert!(!description(AppTool::CreateCrm).contains("outils de fichiers"));
    says(AppTool::ReadNote, &["un CRM et ses fiches avec `read_crm`"]);
    says(
        AppTool::ReplaceInNote,
        &["une fiche de CRM (utilisez `read_crm` et les outils du CRM)"],
    );
    assert!(!description(AppTool::RenameNote).contains("outils de fichiers"));
}
