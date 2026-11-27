//! Compte Claude : se déconnecter, se connecter, et le compte lu par la vérification de la
//! connexion, avec un faux Claude Code qui répond à `claude auth …` comme le vrai et garde son
//! état dans un dossier jetable. Le vrai `claude` n'est jamais lancé.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::claude_contract::{ClaudeAccounts, claude_account_contract};
use application::{
    ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, ClaudeTurn, WorkspaceLocation,
};
use infrastructure::ClaudeCodeCli;
use tempfile::TempDir;

/// Ce que le vrai `claude auth login` écrit (2.1.311), adresse remplacée.
const ADDRESS: &str = "https://claude.ai/oauth/authorize?code=true&state=faux";

/// La réponse du vrai `claude auth status --json` (2.1.311), compte remplacé.
fn status_json(email: &str, organization: &str) -> String {
    format!(
        r#"{{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","email":"{email}","orgId":"org-1","orgName":"{organization}","subscriptionType":"team"}}"#
    )
}

/// Un faux Claude Code connecté au compte `moi@example.com`, que se connecter fait passer à
/// `autre@example.com` ; `login` est joué au milieu de la connexion.
struct FakeClaude {
    folder: TempDir,
    claude: ClaudeCodeCli,
}

impl FakeClaude {
    fn new(login: &str, logout: &str) -> Self {
        let folder = TempDir::new().unwrap();
        let dir = folder.path().display();
        fs::create_dir(folder.path().join("Notes")).unwrap();
        fs::write(
            folder.path().join("account.json"),
            status_json("moi@example.com", "Moi"),
        )
        .unwrap();
        fs::write(
            folder.path().join("other.json"),
            status_json("autre@example.com", "Autre"),
        )
        .unwrap();
        let script = folder.path().join("claude");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\nd='{dir}'\nprintf '%s ' \"$@\" >> \"$d/calls\"; echo >> \"$d/calls\"\n\
                 env > \"$d/env\"\n\
                 case \"$2\" in\n\
                 status) [ -e \"$d/logged-out\" ] && echo '{{\"loggedIn\":false}}' && exit 1\n\
                   cat \"$d/account.json\";;\n\
                 logout) {logout}\n  touch \"$d/logged-out\"\n\
                   echo 'Successfully logged out from your Anthropic account.';;\n\
                 login) echo 'Opening browser to sign in…'\n\
                   echo \"If the browser didn't open, visit: {ADDRESS}\" >&2\n  {login}\n\
                   rm -f \"$d/logged-out\"; cp \"$d/other.json\" \"$d/account.json\"\n\
                   echo 'Login successful.';;\n\
                 esac\n"
            ),
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        Self {
            claude: ClaudeCodeCli::new(script),
            folder,
        }
    }

    fn workspace(&self) -> WorkspaceLocation {
        WorkspaceLocation::new(self.folder.path().join("Notes").display().to_string()).unwrap()
    }

    /// Ce que le faux Claude Code a noté sous `name`.
    fn received(&self, name: &str) -> String {
        fs::read_to_string(self.folder.path().join(name)).unwrap()
    }
}

fn account(email: &str, organization: &str) -> ClaudeAccount {
    ClaudeAccount {
        email: Some(email.to_owned()),
        organization: Some(organization.to_owned()),
    }
}

#[test]
fn the_claude_code_program_honours_the_claude_account_contract() {
    let signing_in = FakeClaude::new("", "");
    // Tant que son entrée reste ouverte, il attend qu'on colle un code : comme le vrai, qui
    // attend le navigateur.
    let waiting = FakeClaude::new("read code", "");
    claude_account_contract(&ClaudeAccounts {
        workspace: signing_in.workspace(),
        signing_in: &signing_in.claude,
        address: ADDRESS.to_owned(),
        account: account("autre@example.com", "Autre"),
        waiting: &waiting.claude,
    });
}

#[test]
fn the_status_gives_the_account_claude_code_is_logged_in_with() {
    let fake = FakeClaude::new("", "");
    assert_eq!(
        fake.claude.status(),
        ClaudeStatus::Ready(account("moi@example.com", "Moi"))
    );
}

#[test]
fn an_account_without_address_nor_organization_is_still_ready() {
    let fake = FakeClaude::new("", "");
    fs::write(
        fake.folder.path().join("account.json"),
        r#"{"loggedIn":true}"#,
    )
    .unwrap();
    assert_eq!(
        fake.claude.status(),
        ClaudeStatus::Ready(ClaudeAccount::default())
    );
}

#[test]
fn logging_out_then_in_asks_claude_code_with_the_subscription_and_the_kept_variables_only() {
    let fake = FakeClaude::new("", "");
    fake.claude.log_out().unwrap();
    fake.claude.log_in(&mut |_| {}).unwrap();
    assert_eq!(
        fake.received("calls"),
        "auth logout \nauth login --claudeai \n"
    );
    assert!(!fake.received("env").contains("CARGO"));
}

#[test]
fn a_failed_logout_says_so() {
    let fake = FakeClaude::new("", "exit 1");
    assert_eq!(fake.claude.log_out(), Err(ClaudeError::LogoutFailed));
}

#[test]
fn a_login_not_completed_says_so_and_leaves_claude_code_as_it_was() {
    let fake = FakeClaude::new("echo 'Login failed: refusé' >&2; exit 1", "");
    fake.claude.log_out().unwrap();
    let mut addresses = Vec::new();
    let end = fake
        .claude
        .log_in(&mut |address| addresses.push(address.to_owned()));
    assert_eq!(end, Err(ClaudeError::LoginFailed));
    assert_eq!(addresses, [ADDRESS]);
    assert_eq!(fake.claude.status(), ClaudeStatus::LoggedOut);
}

#[test]
fn a_missing_program_cannot_log_in_nor_out() {
    let folder = TempDir::new().unwrap();
    let claude = ClaudeCodeCli::new(folder.path().join("claude"));
    assert_eq!(claude.log_out(), Err(ClaudeError::Missing));
    assert_eq!(claude.log_in(&mut |_| {}), Err(ClaudeError::Missing));
}

#[test]
fn after_a_login_a_turn_can_start() {
    let fake = FakeClaude::new("", "");
    fake.claude.log_in(&mut |_| {}).unwrap();
    // Le faux ne connaît pas les tours : il sort sans bilan, mais il a bien été lancé.
    let end = fake.claude.send(
        ClaudeTurn {
            workspace: &fake.workspace(),
            conversation: None,
            settings: domain::claude::TurnSettings::default(),
            tools: None,
            servers: &[],
        },
        "Bonjour",
        &mut |_| {},
    );
    assert_ne!(end, Err(ClaudeError::Busy));
}
