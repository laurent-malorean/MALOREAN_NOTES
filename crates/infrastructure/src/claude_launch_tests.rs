//! Les arguments d'un tour : modèle, effort, serveurs MCP ouverts ou cachés, outils permis.

use std::process::Command;

use domain::claude::{ClaudeModel, ConversationId, Effort, TurnSettings};

use super::*;
use crate::claude_code_cli::{REQUIRED_OPTIONS, missing_options};
use crate::claude_server_access::mcp_config;

/// Les arguments d'un tour sans conversation, sans serveur ni garde-fou, avec `settings`.
fn plain(settings: TurnSettings, access: &ServerAccess) -> Vec<String> {
    arguments(&Launch {
        conversation: None,
        settings,
        mcp: None,
        app_tools: false,
        hooks: None,
        forward_subagent_text: false,
        access,
    })
}

fn chosen(model: Option<ClaudeModel>, effort: Option<Effort>) -> Vec<String> {
    let settings = TurnSettings {
        model,
        effort,
        ..TurnSettings::default()
    };
    let arguments = plain(settings, &ServerAccess::default());
    arguments[4..arguments.len() - 10].to_vec()
}

#[test]
fn nothing_chosen_passes_neither_model_nor_effort() {
    assert!(chosen(None, None).is_empty());
}

#[test]
fn each_model_is_passed_by_its_claude_code_alias() {
    for (model, alias) in [
        (ClaudeModel::Haiku, "haiku"),
        (ClaudeModel::Sonnet, "sonnet"),
        (ClaudeModel::Opus, "opus"),
        (ClaudeModel::Fable, "fable"),
    ] {
        assert_eq!(chosen(Some(model), None), ["--model", alias]);
    }
}

#[test]
fn each_effort_is_passed_by_its_claude_code_level() {
    for (effort, level) in [
        (Effort::Low, "low"),
        (Effort::Medium, "medium"),
        (Effort::High, "high"),
        (Effort::ExtraHigh, "xhigh"),
        (Effort::Max, "max"),
    ] {
        assert_eq!(chosen(None, Some(effort)), ["--effort", level]);
    }
}

/// Chaque option passée à `claude` existe dans le `claude` installé : une option inconnue le
/// fait s'arrêter sans rien dire (« aucun bilan »). Sans `claude` installé, rien à vérifier.
#[test]
fn every_option_passed_to_claude_code_exists_in_the_installed_one() {
    let Ok(help) = Command::new("claude").arg("--help").output() else {
        return;
    };
    let help = String::from_utf8_lossy(&help.stdout).into_owned();
    let settings = TurnSettings {
        model: Some(ClaudeModel::Haiku),
        effort: Some(Effort::Low),
        ..TurnSettings::default()
    };
    let conversation = ConversationId::new("aae7955b-a3d2-411a-8134-172857db16ad").unwrap();
    let launch = |access: &ServerAccess| {
        arguments(&Launch {
            conversation: Some(&conversation),
            settings,
            mcp: Some("{}".to_owned()),
            app_tools: true,
            hooks: Some("{}".to_owned()),
            forward_subagent_text: false,
            access,
        })
    };
    // Sans serveur permis, puis avec un connecteur permis et un autre caché.
    let mut passed = launch(&ServerAccess::default());
    passed.extend(launch(&connector_access()));
    for option in passed.iter().filter(|argument| argument.starts_with("--")) {
        assert!(help.contains(option.as_str()), "option inconnue : {option}");
    }
    // Et chaque option que l'application exige est bien passée.
    for option in REQUIRED_OPTIONS {
        assert!(passed.iter().any(|argument| argument == option), "{option}");
    }
    assert!(missing_options(&help).is_empty());
}

/// Un connecteur permis (Noota), un autre caché (Slack).
fn connector_access() -> ServerAccess {
    ServerAccess {
        prefixes: vec!["mcp__claude_ai_Noota".to_owned()],
        hidden: vec!["mcp__claude_ai_Slack".to_owned()],
        names: vec!["Noota".to_owned()],
        connector: true,
        ..ServerAccess::default()
    }
}

/// La valeur qui suit l'option `option`.
fn value_of<'a>(arguments: &'a [String], option: &str) -> Option<&'a str> {
    let at = arguments.iter().position(|argument| argument == option)?;
    arguments.get(at + 1).map(String::as_str)
}

#[test]
fn without_a_permitted_server_only_the_app_server_is_let_through() {
    let arguments = plain(TurnSettings::default(), &ServerAccess::default());
    assert!(arguments.contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(
        value_of(&arguments, "--tools"),
        Some("Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch")
    );
    assert_eq!(
        value_of(&arguments, "--allowed-tools"),
        Some("WebSearch,WebFetch")
    );
    for option in [
        "--disallowed-tools",
        "--append-system-prompt",
        "--mcp-config",
    ] {
        assert!(!arguments.contains(&option.to_owned()), "{option}");
    }
}

#[test]
fn a_permitted_connector_arrives_by_itself_and_the_others_are_hidden() {
    let arguments = plain(TurnSettings::default(), &connector_access());
    assert!(!arguments.contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(
        value_of(&arguments, "--tools"),
        Some("Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch,ToolSearch")
    );
    assert_eq!(
        value_of(&arguments, "--allowed-tools"),
        Some("WebSearch,WebFetch,mcp__claude_ai_Noota")
    );
    assert_eq!(
        value_of(&arguments, "--disallowed-tools"),
        Some("mcp__claude_ai_Slack")
    );
    let instructions = value_of(&arguments, "--append-system-prompt").unwrap();
    assert!(instructions.contains(": Noota."), "{instructions}");
    assert!(instructions.contains("ToolSearch"));
}

#[test]
fn a_permitted_server_added_by_the_user_is_passed_by_the_application_and_stays_strict() {
    let access = ServerAccess {
        described: vec![(
            "mon serveur".to_owned(),
            serde_json::json!({ "type": "http", "url": "http://127.0.0.1:1/mcp" }),
        )],
        prefixes: vec!["mcp__mon_serveur".to_owned()],
        names: vec!["mon serveur".to_owned()],
        ..ServerAccess::default()
    };
    let mcp = mcp_config(access.described.clone());
    let arguments = arguments(&Launch {
        conversation: None,
        settings: TurnSettings::default(),
        mcp: Some(mcp.clone()),
        app_tools: false,
        hooks: None,
        forward_subagent_text: false,
        access: &access,
    });
    assert!(arguments.contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(value_of(&arguments, "--mcp-config"), Some(mcp.as_str()));
    assert_eq!(
        value_of(&arguments, "--allowed-tools"),
        Some("WebSearch,WebFetch,mcp__mon_serveur")
    );
    assert!(!arguments.contains(&"--disallowed-tools".to_owned()));
    assert!(
        value_of(&arguments, "--tools")
            .unwrap()
            .ends_with(",ToolSearch")
    );
}

#[test]
fn the_mcp_config_names_each_server_with_its_description() {
    let config: serde_json::Value = serde_json::from_str(&mcp_config(vec![
        ("a".to_owned(), serde_json::json!({ "command": "x" })),
        ("b b".to_owned(), serde_json::json!({ "url": "u" })),
    ]))
    .unwrap();
    assert_eq!(
        config,
        serde_json::json!({ "mcpServers": { "a": { "command": "x" }, "b b": { "url": "u" } } })
    );
}

#[test]
fn the_app_tools_stay_allowed_one_by_one_next_to_the_permitted_servers() {
    let arguments = arguments(&Launch {
        conversation: None,
        settings: TurnSettings::default(),
        mcp: Some("{}".to_owned()),
        app_tools: true,
        hooks: None,
        forward_subagent_text: false,
        access: &connector_access(),
    });
    let allowed = value_of(&arguments, "--allowed-tools").unwrap();
    assert!(allowed.starts_with(&allowed_tools_with_app_tools()));
    assert!(allowed.ends_with(",mcp__claude_ai_Noota"));
}
