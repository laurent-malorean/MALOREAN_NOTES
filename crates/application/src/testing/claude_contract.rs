//! Contrat de Claude Code : joué à l'identique sur le faux et sur l'adaptateur qui lance le
//! programme `claude` (lui-même remplacé, dans les tests, par un faux Claude Code qui rejoue un
//! flux enregistré).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::mpsc;
use std::thread;

use domain::app_tools::AppToolsKey;
use domain::claude::{
    ChangesAfterWeb, ClaudeEvent, ClaudeModel, ConversationId, Effort, TurnSettings,
};
use domain::external_servers::{ExternalServer, ServerName};

use crate::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, ClaudeTurn, WorkspaceLocation};

/// Deux Claude Code préparés pour le contrat, dans l'espace de travail `workspace`.
#[derive(Debug)]
pub struct ClaudeCodes<'a> {
    /// L'espace de travail où chaque tour est joué.
    pub workspace: WorkspaceLocation,
    /// Un Claude Code connecté, dont chaque tour annonce `replayed`, puis se termine.
    pub replaying: &'a dyn ClaudeCode,
    /// Les événements annoncés par chaque tour de `replaying`.
    pub replayed: Vec<ClaudeEvent>,
    /// Un Claude Code dont chaque tour annonce au moins un événement, puis attend d'être arrêté.
    pub hanging: &'a dyn ClaudeCode,
}

/// Joue tout le contrat.
pub fn claude_code_contract(codes: &ClaudeCodes<'_>) {
    a_connected_claude_code_is_ready(codes);
    a_turn_gives_every_event_in_order(codes);
    a_continued_conversation_gives_every_event_in_order(codes);
    a_conversation_continued_with_other_settings_gives_every_event_in_order(codes);
    a_turn_offering_the_app_tools_gives_every_event_in_order(codes);
    a_turn_offering_servers_gives_every_event_in_order(codes);
    stopping_without_a_turn_changes_nothing(codes);
    a_running_turn_is_alone_and_stops_on_request(codes);
}

/// Les événements d'un tour de `claude`, et comment il s'est terminé.
fn turn(
    claude: &dyn ClaudeCode,
    workspace: &WorkspaceLocation,
    conversation: Option<&ConversationId>,
) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
    turn_with(claude, workspace, conversation, TurnSettings::default())
}

/// Les événements d'un tour de `claude` joué avec `settings`, et comment il s'est terminé.
fn turn_with(
    claude: &dyn ClaudeCode,
    workspace: &WorkspaceLocation,
    conversation: Option<&ConversationId>,
    settings: TurnSettings,
) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
    turn_offering(claude, workspace, conversation, settings, None)
}

/// Les événements d'un tour de `claude` joué avec `settings` et la clé des outils de
/// l'application `tools`, et comment il s'est terminé.
fn turn_offering(
    claude: &dyn ClaudeCode,
    workspace: &WorkspaceLocation,
    conversation: Option<&ConversationId>,
    settings: TurnSettings,
    tools: Option<&AppToolsKey>,
) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
    let mut events = Vec::new();
    let end = claude.send(
        ClaudeTurn {
            workspace,
            conversation,
            settings,
            tools,
            servers: &[],
        },
        "Bonjour",
        &mut |event| {
            events.push(event);
        },
    );
    (end, events)
}

fn a_connected_claude_code_is_ready(codes: &ClaudeCodes<'_>) {
    assert!(matches!(codes.replaying.status(), ClaudeStatus::Ready(_)));
}

fn a_turn_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let (end, events) = turn(codes.replaying, &codes.workspace, None);
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_continued_conversation_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let conversation = ConversationId::new("conversation-1").unwrap();
    let (end, events) = turn(codes.replaying, &codes.workspace, Some(&conversation));
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_conversation_continued_with_other_settings_gives_every_event_in_order(
    codes: &ClaudeCodes<'_>,
) {
    let conversation = ConversationId::new("conversation-1").unwrap();
    let settings = TurnSettings {
        model: Some(ClaudeModel::Opus),
        effort: Some(Effort::Max),
        changes_after_web: ChangesAfterWeb::Allowed,
    };
    let (end, events) = turn_with(
        codes.replaying,
        &codes.workspace,
        Some(&conversation),
        settings,
    );
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_turn_offering_the_app_tools_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let key = AppToolsKey::new("clé-du-tour").unwrap();
    let settings = TurnSettings::default();
    let (end, events) = turn_offering(
        codes.replaying,
        &codes.workspace,
        None,
        settings,
        Some(&key),
    );
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_turn_offering_servers_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let servers = [
        ServerName::new("claude.ai Noota").unwrap(),
        ServerName::new("mon serveur").unwrap(),
    ];
    let mut events = Vec::new();
    let end = codes.replaying.send(
        ClaudeTurn {
            workspace: &codes.workspace,
            conversation: None,
            settings: TurnSettings::default(),
            tools: None,
            servers: &servers,
        },
        "Bonjour",
        &mut |event| events.push(event),
    );
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn stopping_without_a_turn_changes_nothing(codes: &ClaudeCodes<'_>) {
    codes.replaying.stop();
    let (end, events) = turn(codes.replaying, &codes.workspace, None);
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_running_turn_is_alone_and_stops_on_request(codes: &ClaudeCodes<'_>) {
    let (sender, received) = mpsc::channel();
    thread::scope(|scope| {
        let running = scope.spawn(|| {
            codes.hanging.send(
                ClaudeTurn {
                    workspace: &codes.workspace,
                    conversation: None,
                    settings: TurnSettings::default(),
                    tools: None,
                    servers: &[],
                },
                "Bonjour",
                &mut |event| {
                    sender.send(event).unwrap();
                },
            )
        });
        received.recv().unwrap();
        let second = turn(codes.hanging, &codes.workspace, None);
        codes.hanging.stop();
        assert_eq!(second, (Err(ClaudeError::Busy), Vec::new()));
        assert_eq!(running.join().unwrap(), Err(ClaudeError::Stopped));
    });
}

/// Un Claude Code préparé pour le contrat de la liste des serveurs MCP extérieurs.
#[derive(Debug)]
pub struct ClaudeServers<'a> {
    /// Un Claude Code connecté qui connaît `known`.
    pub knowing: &'a dyn ClaudeCode,
    /// Les serveurs qu'il connaît, tels qu'il les donne.
    pub known: Vec<ExternalServer>,
}

/// Joue tout le contrat de la liste des serveurs MCP extérieurs.
pub fn claude_servers_contract(servers: &ClaudeServers<'_>) {
    claude_code_gives_the_servers_it_knows_with_their_state(servers);
    listing_the_servers_again_gives_the_same_list(servers);
}

fn claude_code_gives_the_servers_it_knows_with_their_state(servers: &ClaudeServers<'_>) {
    assert_eq!(
        servers.knowing.external_servers(),
        Ok(servers.known.clone())
    );
}

fn listing_the_servers_again_gives_the_same_list(servers: &ClaudeServers<'_>) {
    servers.knowing.external_servers().unwrap();
    assert_eq!(
        servers.knowing.external_servers(),
        Ok(servers.known.clone())
    );
}

/// Deux Claude Code connectés, préparés pour le contrat du compte Claude.
#[derive(Debug)]
pub struct ClaudeAccounts<'a> {
    /// L'espace de travail où un tour est tenté pendant une connexion.
    pub workspace: WorkspaceLocation,
    /// Un Claude Code dont la connexion donne `address`, puis le connecte à `account`.
    pub signing_in: &'a dyn ClaudeCode,
    /// L'adresse de connexion qu'il donne.
    pub address: String,
    /// Le compte auquel il se connecte.
    pub account: ClaudeAccount,
    /// Un Claude Code dont la connexion donne une adresse, puis attend le navigateur jusqu'à être
    /// annulée.
    pub waiting: &'a dyn ClaudeCode,
}

/// Joue tout le contrat du compte Claude.
pub fn claude_account_contract(accounts: &ClaudeAccounts<'_>) {
    logging_out_leaves_claude_code_logged_out(accounts);
    logging_in_gives_the_sign_in_address_then_the_account(accounts);
    a_login_waiting_for_the_browser_is_alone_and_cancelled_on_request(accounts);
}

fn logging_out_leaves_claude_code_logged_out(accounts: &ClaudeAccounts<'_>) {
    assert_eq!(accounts.signing_in.log_out(), Ok(()));
    assert_eq!(accounts.signing_in.status(), ClaudeStatus::LoggedOut);
}

fn logging_in_gives_the_sign_in_address_then_the_account(accounts: &ClaudeAccounts<'_>) {
    let mut addresses = Vec::new();
    let end = accounts
        .signing_in
        .log_in(&mut |address| addresses.push(address.to_owned()));
    assert_eq!(end, Ok(()));
    assert_eq!(addresses, std::slice::from_ref(&accounts.address));
    assert_eq!(
        accounts.signing_in.status(),
        ClaudeStatus::Ready(accounts.account.clone())
    );
}

fn a_login_waiting_for_the_browser_is_alone_and_cancelled_on_request(
    accounts: &ClaudeAccounts<'_>,
) {
    let (sender, received) = mpsc::channel();
    thread::scope(|scope| {
        let running = scope.spawn(|| {
            accounts.waiting.log_in(&mut |address| {
                sender.send(address.to_owned()).unwrap();
            })
        });
        received.recv().unwrap();
        let mut addresses = 0;
        let second = accounts.waiting.log_in(&mut |_| addresses += 1);
        let logged_out = accounts.waiting.log_out();
        let a_turn = turn(accounts.waiting, &accounts.workspace, None);
        accounts.waiting.stop();
        assert_eq!((second, addresses), (Err(ClaudeError::Busy), 0));
        assert_eq!(logged_out, Err(ClaudeError::Busy));
        assert_eq!(a_turn, (Err(ClaudeError::Busy), Vec::new()));
        assert_eq!(running.join().unwrap(), Err(ClaudeError::Stopped));
    });
    assert!(matches!(accounts.waiting.status(), ClaudeStatus::Ready(_)));
}
