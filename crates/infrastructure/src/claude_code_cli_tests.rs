//! Les tests du programme de Claude Code : arguments d'un tour, adresse de connexion, options
//! connues du `claude` installé.

use super::*;

#[test]
fn the_sign_in_address_is_read_from_the_line_that_holds_it() {
    assert_eq!(
        sign_in_address("If the browser didn't open, visit: https://claude.ai/oauth?a=1 "),
        Some("https://claude.ai/oauth?a=1")
    );
    assert_eq!(
        sign_in_address("Sign in at: https://claude.ai/x"),
        Some("https://claude.ai/x")
    );
    assert_eq!(sign_in_address("Opening browser to sign in…"), None);
}

fn chosen(model: Option<ClaudeModel>, effort: Option<Effort>) -> Vec<String> {
    let settings = TurnSettings {
        model,
        effort,
        ..TurnSettings::default()
    };
    let arguments = arguments(None, settings, None, None, false);
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
    let passed = arguments(Some(&conversation), settings, Some("{}"), Some("{}"), false);
    for option in passed.iter().filter(|argument| argument.starts_with("--")) {
        assert!(help.contains(option.as_str()), "option inconnue : {option}");
    }
    // Et chaque option que l'application exige est bien passée.
    for option in REQUIRED_OPTIONS {
        assert!(passed.iter().any(|argument| argument == option), "{option}");
    }
    assert!(missing_options(&help).is_empty());
}
