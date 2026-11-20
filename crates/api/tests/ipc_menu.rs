//! La barre des menus, construite et commandée comme le fait l'interface : nom, arguments JSON.
//! Sans le lanceur de tests habituel (`harness = false`) : le Mac ne construit des menus que sur
//! le fil principal du programme, celui de `main`.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::{Arc, Mutex};

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{NSApplication, NSMenu};

use api::commands::invoke_handler;
use api::commands::menu::{MENU_COMMAND_EVENT, chosen};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::menu::{MenuEvent, MenuId, MenuItemKind};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

fn window() -> WebviewWindow<MockRuntime> {
    let app = mock_builder()
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
}

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Result<Value, Value> {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

/// Chaque élément standard du Mac, nommé comme l'écrit l'interface.
const STANDARD: [&str; 14] = [
    "services",
    "hide",
    "hideOthers",
    "showAll",
    "quit",
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "selectAll",
    "minimize",
    "zoom",
    "bringAllToFront",
];

/// Des menus comme les écrit l'interface : éléments standard, commandes, séparateur, rôles.
fn menus() -> Value {
    json!([
        { "title": "MALOREAN Notes", "role": null, "entries": [
            { "kind": "standard", "item": "quit", "label": "Quitter MALOREAN Notes" },
        ] },
        { "title": "Aide", "role": "help", "entries": [] },
        { "title": "Standard", "role": null, "entries": STANDARD.iter().map(|item| json!(
            { "kind": "standard", "item": item, "label": format!("« {item} »") }
        )).collect::<Vec<_>>() },
        { "title": "Fichier", "role": "window", "entries": [
            { "kind": "command", "id": "close-tab", "label": "Fermer l'onglet",
              "accelerator": "Cmd+W", "enabled": false },
            { "kind": "separator" },
            { "kind": "command", "id": "new-note", "label": "Nouvelle note",
              "accelerator": null, "enabled": true },
        ] },
    ])
}

/// Les menus de la barre installée : titre, puis (texte, actif) de chaque élément.
fn installed(window: &WebviewWindow<MockRuntime>) -> Vec<(String, Vec<(String, bool)>)> {
    let bar = window.app_handle().menu().unwrap();
    bar.items()
        .unwrap()
        .iter()
        .map(|menu| {
            let submenu = menu.as_submenu().unwrap();
            let items = submenu.items().unwrap().iter().map(describe).collect();
            (submenu.text().unwrap(), items)
        })
        .collect()
}

fn describe(item: &MenuItemKind<MockRuntime>) -> (String, bool) {
    match item {
        MenuItemKind::MenuItem(item) => (item.text().unwrap(), item.is_enabled().unwrap()),
        MenuItemKind::Predefined(item) => (item.text().unwrap(), true),
        _ => (String::new(), false),
    }
}

/// Les titres des menus auxquels le Mac a donné le rôle de menu Fenêtre et de menu Aide.
fn roles() -> (Option<String>, Option<String>) {
    let mtm = MainThreadMarker::new().unwrap();
    let app = NSApplication::sharedApplication(mtm);
    let title = |menu: Option<Retained<NSMenu>>| menu.map(|menu| menu.title().to_string());
    (title(app.windowsMenu()), title(app.helpMenu()))
}

fn the_menus_written_by_the_interface_become_the_menu_bar() {
    let window = window();
    call(&window, "install_menu", json!({ "menus": menus() })).unwrap();
    let bar = installed(&window);
    assert_eq!(bar[0].0, "MALOREAN Notes");
    assert_eq!(bar[0].1, vec![("Quitter MALOREAN Notes".to_owned(), true)]);
    assert_eq!(bar[3].0, "Fichier");
    assert_eq!(bar[3].1[0], ("Fermer l'onglet".to_owned(), false));
    assert_eq!(bar[3].1[2], ("Nouvelle note".to_owned(), true));
    assert_eq!(bar[3].1.len(), 3);
    let standard: Vec<_> = STANDARD
        .iter()
        .map(|item| (format!("« {item} »"), true))
        .collect();
    assert_eq!(bar[2].1, standard);
    assert_eq!(
        roles(),
        (Some("Fichier".to_owned()), Some("Aide".to_owned()))
    );
    assert!(BRIDGE_SOURCE.contains("\"install_menu\", { menus }"));
}

fn menu_items_are_greyed_and_enabled_by_their_command_id() {
    let window = window();
    call(&window, "install_menu", json!({ "menus": menus() })).unwrap();
    let args = json!({ "ids": ["close-tab"], "enabled": true });
    call(&window, "enable_menu_items", args).unwrap();
    assert_eq!(
        installed(&window)[3].1[0],
        ("Fermer l'onglet".to_owned(), true)
    );
    assert_eq!(
        installed(&window)[3].1[2],
        ("Nouvelle note".to_owned(), true)
    );
    let args = json!({ "ids": ["new-note"], "enabled": false });
    call(&window, "enable_menu_items", args).unwrap();
    assert_eq!(
        installed(&window)[3].1[0],
        ("Fermer l'onglet".to_owned(), true)
    );
    assert_eq!(
        installed(&window)[3].1[2],
        ("Nouvelle note".to_owned(), false)
    );
    assert!(BRIDGE_SOURCE.contains("\"enable_menu_items\", { ids, enabled }"));
}

fn greying_items_before_the_menu_bar_is_installed_does_nothing() {
    let window = window();
    let args = json!({ "ids": ["close-tab"], "enabled": false });
    assert_eq!(call(&window, "enable_menu_items", args), Ok(Value::Null));
}

fn a_chosen_menu_item_reaches_the_interface_as_its_command_id() {
    let window = window();
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&received);
    window.listen_any(MENU_COMMAND_EVENT, move |event| {
        sink.lock().unwrap().push(event.payload().to_owned());
    });
    let event = MenuEvent {
        id: MenuId::new("close-tab"),
    };
    chosen(window.app_handle(), &event);
    assert_eq!(*received.lock().unwrap(), vec!["\"close-tab\"".to_owned()]);
    assert!(BRIDGE_SOURCE.contains("MENU_COMMAND_EVENT = \"menu-command\""));
}

/// « Malorean.net », dans la fenêtre « À propos », s'ouvre dans le navigateur ; rien d'autre.
fn only_a_web_address_opens_in_the_browser() {
    let window = window();
    let refused = call(
        &window,
        "open_web_address",
        json!({ "address": "file:///etc/passwd" }),
    );
    assert_eq!(
        refused.unwrap_err()["message"],
        "« file:///etc/passwd » n'est pas une adresse web"
    );
    assert!(BRIDGE_SOURCE.contains("\"open_web_address\", { address }"));
}

fn main() {
    the_menus_written_by_the_interface_become_the_menu_bar();
    menu_items_are_greyed_and_enabled_by_their_command_id();
    greying_items_before_the_menu_bar_is_installed_does_nothing();
    a_chosen_menu_item_reaches_the_interface_as_its_command_id();
    only_a_web_address_opens_in_the_browser();
}
