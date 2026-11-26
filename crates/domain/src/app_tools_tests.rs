use super::*;

#[test]
fn only_the_two_tools_that_talk_about_the_screen_use_it() {
    let using: Vec<_> = AppTool::ALL.iter().filter(|t| t.uses_screen()).collect();
    assert_eq!(using, [&AppTool::ViewedNote, &AppTool::ShowNote]);
}

#[test]
fn every_tool_but_the_list_of_workspaces_aims_at_a_workspace() {
    let others: Vec<_> = AppTool::ALL
        .iter()
        .filter(|t| !t.aims_at_a_workspace())
        .collect();
    assert_eq!(others, [&AppTool::ListWorkspaces]);
}

#[test]
fn the_list_of_workspaces_reads_without_changing_and_has_no_target() {
    assert_eq!(AppTool::ListWorkspaces.name(), "list_workspaces");
    assert_eq!(
        AppTool::ListWorkspaces.full_name(),
        "mcp__malorean_notes__list_workspaces"
    );
    assert!(!AppTool::ListWorkspaces.changes_notes());
    assert_eq!(AppTool::ListWorkspaces.target_field(), None);
    assert_eq!(AppTool::ALL[0], AppTool::ListWorkspaces);
}

#[test]
fn each_tool_is_found_by_its_name_and_its_claude_code_name() {
    for tool in AppTool::ALL {
        assert_eq!(AppTool::named(tool.name()), Some(tool));
        assert_eq!(AppTool::of_full_name(&tool.full_name()), Some(tool));
    }
    assert_eq!(
        AppTool::SearchNotes.full_name(),
        "mcp__malorean_notes__search_notes"
    );
    assert_eq!(AppTool::named("rm"), None);
    assert_eq!(AppTool::SearchByMeaning.name(), "search_by_meaning");
    assert_eq!(
        AppTool::SearchByMeaning.full_name(),
        "mcp__malorean_notes__search_by_meaning"
    );
    assert_eq!(AppTool::ALL[2], AppTool::SearchByMeaning);
}

#[test]
fn a_tool_of_another_server_or_a_built_in_tool_is_not_an_app_tool() {
    assert_eq!(AppTool::of_full_name("search_notes"), None);
    assert_eq!(AppTool::of_full_name("mcp__autre__search_notes"), None);
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes_search_notes"),
        None
    );
    assert_eq!(AppTool::of_full_name("mcp__malorean__search_notes"), None);
    assert_eq!(AppTool::of_full_name("Read"), None);
    assert_eq!(AppTool::of_full_name("mcp__malorean_notes__inconnu"), None);
}

#[test]
fn tool_names_are_distinct() {
    let mut names: Vec<_> = AppTool::ALL.iter().map(|tool| tool.name()).collect();
    assert!(names.iter().all(|name| !name.is_empty()));
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), AppTool::ALL.len());
}

#[test]
fn only_the_tools_that_create_change_move_or_trash_a_note_change_notes() {
    let changing: Vec<_> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.changes_notes())
        .map(AppTool::name)
        .collect();
    assert_eq!(
        changing,
        [
            "create_note",
            "create_folder",
            "rename_folder",
            "move_folder",
            "trash_folder",
            "create_note_from_template",
            "trash_note",
            "rename_note",
            "move_note",
            "restore_version",
            "replace_in_note",
            "add_canvas_card",
            "change_canvas_card",
            "move_canvas_card",
            "resize_canvas_card",
            "remove_canvas_card",
            "add_canvas_arrow",
            "change_canvas_arrow",
            "remove_canvas_arrow",
            "add_canvas_group",
            "change_canvas_group",
            "add_tags",
            "remove_tags",
            "pin_note",
            "unpin_note",
            "add_attachment",
            "add_entry",
            "create_mind_map",
            "add_mind_map_child",
            "add_mind_map_sibling",
            "add_mind_map_root",
            "edit_mind_map_node",
            "color_mind_map_node",
            "move_mind_map_node",
            "delete_mind_map_node",
            "create_crm",
            "create_crm_action",
            "change_crm_action",
            "move_crm_action",
            "delete_crm_action",
            "create_crm_person",
            "change_crm_person",
            "delete_crm_person",
            "create_crm_company",
            "change_crm_company",
            "delete_crm_company",
            "create_crm_project",
            "change_crm_project",
            "delete_crm_project",
            "change_crm_stages"
        ]
    );
}

#[test]
fn each_tool_says_what_it_targets() {
    let targets: Vec<_> = AppTool::ALL.map(AppTool::target_field).into();
    let path = Some("path");
    // Avant les outils du CRM : le même nombre d'outils que dans `ALL` jusqu'à `CreateCrm`.
    const ALL_BEFORE_CRM: usize = 48;
    assert_eq!(
        targets[..ALL_BEFORE_CRM],
        [
            None,
            Some("query"),
            Some("question"),
            None,
            None,
            path,
            path,
            path,
            None,
            path,
            path,
            Some("title"),
            path,
            path,
            path,
            path,
            Some("title"),
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            Some("title"),
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            path,
            Some("title"),
        ]
    );
    // Les quinze outils du CRM (lire, puis changer) visent leur CRM, puis viennent les deux outils
    // de l'écran.
    assert_eq!(targets[ALL_BEFORE_CRM..ALL_BEFORE_CRM + 15], [path; 15]);
    assert_eq!(targets[ALL_BEFORE_CRM + 15..], [None, path]);
}

#[test]
fn reading_a_note_changes_nothing_and_targets_its_path() {
    let tool = AppTool::ReadNote;
    assert_eq!(tool.name(), "read_note");
    assert_eq!(tool.full_name(), "mcp__malorean_notes__read_note");
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes__read_note"),
        Some(tool)
    );
    assert!(!tool.changes_notes());
    assert!(tool.aims_at_a_workspace());
    assert!(!tool.uses_screen());
    assert_eq!(tool.target_field(), Some("path"));
    let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
    assert_eq!(AppTool::ALL[at - 1], AppTool::LinkingNotes);
}

#[test]
fn reading_a_mind_map_changes_nothing_and_targets_its_path() {
    let tool = AppTool::ReadMindMap;
    assert_eq!(tool.name(), "read_mind_map");
    assert_eq!(tool.full_name(), "mcp__malorean_notes__read_mind_map");
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes__read_mind_map"),
        Some(tool)
    );
    assert!(!tool.changes_notes());
    assert!(tool.aims_at_a_workspace());
    assert!(!tool.uses_screen());
    assert_eq!(tool.target_field(), Some("path"));
    let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
    assert_eq!(AppTool::ALL[at - 1], AppTool::CreateMindMap);
}

#[test]
fn replacing_a_text_changes_a_note_and_targets_its_path() {
    let tool = AppTool::ReplaceInNote;
    assert_eq!(tool.name(), "replace_in_note");
    assert_eq!(tool.full_name(), "mcp__malorean_notes__replace_in_note");
    assert!(tool.changes_notes());
    assert!(tool.aims_at_a_workspace());
    assert!(!tool.uses_screen());
    assert_eq!(tool.target_field(), Some("path"));
    let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
    assert_eq!(AppTool::ALL[at - 1], AppTool::RestoreVersion);
}

#[test]
fn the_folder_tools_are_named_ordered_and_guarded_as_their_decision_says() {
    let names: Vec<_> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.name().ends_with("_folder") || tool.name() == "list_folders")
        .map(AppTool::name)
        .collect();
    assert_eq!(
        names,
        [
            "list_folders",
            "create_folder",
            "rename_folder",
            "move_folder",
            "trash_folder"
        ]
    );
    assert_eq!(
        AppTool::TrashFolder.full_name(),
        "mcp__malorean_notes__trash_folder"
    );
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes__rename_folder"),
        Some(AppTool::RenameFolder)
    );
    assert!(!AppTool::ListFolders.changes_notes());
    assert_eq!(AppTool::ListFolders.target_field(), None);
    for tool in [
        AppTool::ListFolders,
        AppTool::RenameFolder,
        AppTool::MoveFolder,
        AppTool::TrashFolder,
    ] {
        assert!(tool.aims_at_a_workspace(), "{tool:?}");
        assert!(!tool.uses_screen(), "{tool:?}");
    }
}

#[test]
fn reading_a_canvas_changes_nothing_and_targets_its_path() {
    let tool = AppTool::ReadCanvas;
    assert_eq!(tool.name(), "read_canvas");
    assert_eq!(tool.full_name(), "mcp__malorean_notes__read_canvas");
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes__read_canvas"),
        Some(tool)
    );
    assert!(!tool.changes_notes());
    assert!(tool.aims_at_a_workspace());
    assert!(!tool.uses_screen());
    assert_eq!(tool.target_field(), Some("path"));
    let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
    assert_eq!(AppTool::ALL[at - 1], AppTool::ReadNote);
}

#[test]
fn the_ten_tools_that_change_a_canvas_are_named_ordered_and_guarded_as_their_decision_says() {
    let names: Vec<_> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.name().contains("_canvas_"))
        .map(AppTool::name)
        .collect();
    assert_eq!(
        names,
        [
            "add_canvas_card",
            "change_canvas_card",
            "move_canvas_card",
            "resize_canvas_card",
            "remove_canvas_card",
            "add_canvas_arrow",
            "change_canvas_arrow",
            "remove_canvas_arrow",
            "add_canvas_group",
            "change_canvas_group"
        ]
    );
    let first = AppTool::ALL
        .iter()
        .position(|t| *t == AppTool::AddCanvasCard)
        .unwrap();
    assert_eq!(AppTool::ALL[first - 1], AppTool::ReplaceInNote);
    assert_eq!(AppTool::ALL[first + 10], AppTool::AddTags);
}

#[test]
fn a_key_is_never_empty_and_never_shown() {
    assert_eq!(AppToolsKey::new(""), None);
    let key = AppToolsKey::new("secret").unwrap();
    assert_eq!(key.as_str(), "secret");
    assert_eq!(format!("{key:?}"), "AppToolsKey(..)");
}

#[test]
fn each_tool_that_changes_a_canvas_is_guarded_aims_at_a_workspace_and_targets_its_path() {
    let names = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.name().contains("_canvas_"))
        .map(AppTool::name);
    for name in names {
        let tool = AppTool::named(name).unwrap();
        assert!(tool.changes_notes(), "{name}");
        assert!(tool.aims_at_a_workspace(), "{name}");
        assert!(!tool.uses_screen(), "{name}");
        assert_eq!(tool.target_field(), Some("path"), "{name}");
        assert_eq!(tool.full_name(), format!("mcp__malorean_notes__{name}"));
        assert_eq!(AppTool::of_full_name(&tool.full_name()), Some(tool));
    }
}

#[test]
fn only_the_fourteen_crm_tools_change_a_crm() {
    let changing: Vec<_> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.changes_a_crm())
        .collect();
    assert_eq!(changing.len(), 14);
    assert!(changing.iter().all(|tool| tool.name().contains("_crm_")));
    assert!(!AppTool::ReadCrm.changes_a_crm());
    assert!(!AppTool::CreateCrm.changes_a_crm());
}

#[test]
fn reading_a_crm_changes_nothing_targets_its_path_and_follows_the_creation_of_a_crm() {
    let tool = AppTool::ReadCrm;
    assert_eq!(tool.name(), "read_crm");
    assert_eq!(tool.full_name(), "mcp__malorean_notes__read_crm");
    assert_eq!(
        AppTool::of_full_name("mcp__malorean_notes__read_crm"),
        Some(tool)
    );
    assert!(!tool.changes_notes());
    assert!(tool.aims_at_a_workspace());
    assert!(!tool.uses_screen());
    assert_eq!(tool.target_field(), Some("path"));
    let at = AppTool::ALL.iter().position(|t| *t == tool).unwrap();
    assert_eq!(AppTool::ALL[at - 1], AppTool::CreateCrm);
}

#[test]
fn the_fourteen_tools_that_change_a_crm_are_named_and_ordered_as_their_decision_says() {
    let names: Vec<_> = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.name().contains("_crm_"))
        .map(AppTool::name)
        .collect();
    assert_eq!(
        names,
        [
            "create_crm_action",
            "change_crm_action",
            "move_crm_action",
            "delete_crm_action",
            "create_crm_person",
            "change_crm_person",
            "delete_crm_person",
            "create_crm_company",
            "change_crm_company",
            "delete_crm_company",
            "create_crm_project",
            "change_crm_project",
            "delete_crm_project",
            "change_crm_stages",
        ]
    );
    let first = AppTool::ALL
        .iter()
        .position(|t| *t == AppTool::CreateCrmAction)
        .unwrap();
    assert_eq!(AppTool::ALL[first - 1], AppTool::ReadCrm);
    assert_eq!(AppTool::ALL[first + 14], AppTool::ViewedNote);
}

#[test]
fn each_tool_that_changes_a_crm_is_guarded_aims_at_a_workspace_and_targets_its_path() {
    let names = AppTool::ALL
        .into_iter()
        .filter(|tool| tool.name().contains("_crm_"))
        .map(AppTool::name);
    for name in names {
        let tool = AppTool::named(name).unwrap();
        assert!(tool.changes_notes(), "{name}");
        assert!(tool.changes_a_crm(), "{name}");
        assert!(tool.aims_at_a_workspace(), "{name}");
        assert!(!tool.uses_screen(), "{name}");
        assert_eq!(tool.target_field(), Some("path"), "{name}");
        assert_eq!(tool.full_name(), format!("mcp__malorean_notes__{name}"));
        assert_eq!(AppTool::of_full_name(&tool.full_name()), Some(tool));
    }
}

#[test]
fn the_crm_changing_tools_are_said_in_one_sentence() {
    assert_eq!(
        crm_changing_tools_said(),
        "create_crm_action, change_crm_action, move_crm_action, delete_crm_action, \
         create_crm_person, change_crm_person, delete_crm_person, create_crm_company, \
         change_crm_company, delete_crm_company, create_crm_project, change_crm_project, \
         delete_crm_project ou change_crm_stages"
    );
}
