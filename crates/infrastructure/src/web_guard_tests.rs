//! Le garde-fou du web : ses crochets joués par le vrai shell, comme Claude Code les joue.

use std::process::Command;

use serde_json::Value;

use super::*;

/// Les réglages du garde-fou, lus.
fn settings_of(guard: &WebGuard) -> Value {
    serde_json::from_str(&guard.settings()).unwrap()
}

/// Le crochet joué avant les outils `tools`.
fn hook<'a>(settings: &'a Value, tools: &str) -> &'a Value {
    settings["hooks"]["PreToolUse"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["matcher"] == tools)
        .unwrap()
}

/// Joue le crochet des outils `tools` comme Claude Code : sa commande par le shell ; rend ce qu'il
/// écrit.
fn run(guard: &WebGuard, tools: &str) -> String {
    let settings = settings_of(guard);
    let entry = hook(&settings, tools);
    assert_eq!(entry["hooks"].as_array().unwrap().len(), 1);
    assert_eq!(entry["hooks"][0]["type"], "command");
    let command = entry["hooks"][0]["command"].as_str().unwrap();
    let output = Command::new("/bin/sh")
        .args(["-c", command])
        .output()
        .unwrap();
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap()
}

#[test]
fn only_the_two_hooks_are_set() {
    let guard = WebGuard::new().unwrap();
    let settings = settings_of(&guard);
    assert_eq!(settings.as_object().unwrap().len(), 1);
    assert_eq!(settings["hooks"].as_object().unwrap().len(), 1);
    let matchers: Vec<&Value> = settings["hooks"]["PreToolUse"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| &entry["matcher"])
        .collect();
    assert_eq!(matchers, ["WebSearch|WebFetch", change_tools().as_str()]);
}

#[test]
fn before_any_web_read_changes_go_through() {
    let guard = WebGuard::new().unwrap();
    assert_eq!(run(&guard, &change_tools()), "");
}

#[test]
fn after_a_web_read_every_change_is_held_back_with_the_reason() {
    let guard = WebGuard::new().unwrap();
    assert_eq!(run(&guard, "WebSearch|WebFetch"), "");
    let refusal: Value = serde_json::from_str(&run(&guard, &change_tools())).unwrap();
    assert_eq!(
        refusal,
        serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": HELD_BACK,
            }
        })
    );
    assert!(!run(&guard, &change_tools()).is_empty());
}

#[test]
fn a_folder_whose_name_has_an_apostrophe_is_quoted_for_the_shell() {
    let parent = tempfile::TempDir::new().unwrap();
    let odd = parent.path().join("l'espace $HOME");
    std::fs::create_dir(&odd).unwrap();
    let guard = WebGuard::within(&odd).unwrap();
    run(&guard, "WebSearch|WebFetch");
    assert!(guard.mark().exists());
    assert!(!run(&guard, &change_tools()).is_empty());
}

#[test]
fn each_turn_has_its_own_guard_removed_at_the_end_of_the_turn() {
    let first = WebGuard::new().unwrap();
    run(&first, "WebSearch|WebFetch");
    let second = WebGuard::new().unwrap();
    assert_eq!(run(&second, &change_tools()), "");
    let folder = first.folder.path().to_owned();
    assert!(folder.starts_with(std::env::temp_dir()));
    drop(first);
    assert!(!folder.exists());
}

#[test]
fn every_change_tool_of_claude_code_or_of_the_application_is_held_back() {
    let tools = change_tools();
    let held: Vec<&str> = tools.split('|').collect();
    let mut expected = vec!["Write".to_owned(), "Edit".to_owned()];
    expected.extend(
        AppTool::ALL
            .iter()
            .filter(|tool| tool.changes_notes())
            .map(|tool| tool.full_name()),
    );
    assert_eq!(held, expected);
    assert!(
        AppTool::ALL
            .iter()
            .filter(|tool| !tool.changes_notes())
            .all(|tool| !held.contains(&tool.full_name().as_str()))
    );
}
