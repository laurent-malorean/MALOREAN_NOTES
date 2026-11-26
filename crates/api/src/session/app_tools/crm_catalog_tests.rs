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
