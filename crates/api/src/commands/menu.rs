//! La barre des menus du Mac : décrite par la page, construite ici ; le choix d'un élément
//! repart vers la page, qui lance la commande du même identifiant que la palette.

use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

use crate::{ApiError, AppMenu, MenuEntryItem, MenuRoleItem, StandardItem};

/// Événement envoyé à la page quand on choisit un élément de menu qui lance une commande ;
/// il porte l'identifiant de la commande.
pub const MENU_COMMAND_EVENT: &str = "menu-command";

impl From<tauri::Error> for ApiError {
    fn from(error: tauri::Error) -> Self {
        Self::menu_failed(&error)
    }
}

/// Remplace la barre des menus par `menus`, de gauche à droite.
///
/// Commande synchrone : Tauri la lance sur le fil principal, le seul où le Mac construit des menus.
///
/// # Errors
///
/// Le Mac n'a pas pu construire la barre des menus.
#[tauri::command]
pub fn install_menu<R: Runtime>(app: AppHandle<R>, menus: Vec<AppMenu>) -> Result<(), ApiError> {
    let bar = Menu::new(&app)?;
    let mut roles = Vec::new();
    for menu in &menus {
        let submenu = Submenu::new(&app, &menu.title, true)?;
        for entry in &menu.entries {
            append(&app, &submenu, entry)?;
        }
        bar.append(&submenu)?;
        if let Some(role) = menu.role {
            roles.push((role, submenu));
        }
    }
    app.set_menu(bar)?;
    for (role, submenu) in roles {
        give_role(role, &submenu)?;
    }
    Ok(())
}

fn append<R: Runtime>(
    app: &AppHandle<R>,
    submenu: &Submenu<R>,
    entry: &MenuEntryItem,
) -> tauri::Result<()> {
    match entry {
        MenuEntryItem::Command {
            id,
            label,
            accelerator,
            enabled,
        } => submenu.append(&MenuItem::with_id(
            app,
            id,
            label,
            *enabled,
            accelerator.as_deref(),
        )?),
        MenuEntryItem::Standard { item, label } => submenu.append(&standard(app, *item, label)?),
        MenuEntryItem::Separator => submenu.append(&PredefinedMenuItem::separator(app)?),
    }
}

fn standard<R: Runtime>(
    app: &AppHandle<R>,
    item: StandardItem,
    label: &str,
) -> tauri::Result<PredefinedMenuItem<R>> {
    let text = Some(label);
    match item {
        StandardItem::About => PredefinedMenuItem::about(app, text, None),
        StandardItem::Services => PredefinedMenuItem::services(app, text),
        StandardItem::Hide => PredefinedMenuItem::hide(app, text),
        StandardItem::HideOthers => PredefinedMenuItem::hide_others(app, text),
        StandardItem::ShowAll => PredefinedMenuItem::show_all(app, text),
        StandardItem::Quit => PredefinedMenuItem::quit(app, text),
        StandardItem::Undo => PredefinedMenuItem::undo(app, text),
        StandardItem::Redo => PredefinedMenuItem::redo(app, text),
        StandardItem::Cut => PredefinedMenuItem::cut(app, text),
        StandardItem::Copy => PredefinedMenuItem::copy(app, text),
        StandardItem::Paste => PredefinedMenuItem::paste(app, text),
        StandardItem::SelectAll => PredefinedMenuItem::select_all(app, text),
        StandardItem::Minimize => PredefinedMenuItem::minimize(app, text),
        StandardItem::Zoom => PredefinedMenuItem::maximize(app, text),
        StandardItem::BringAllToFront => PredefinedMenuItem::bring_all_to_front(app, text),
    }
}

/// Le Mac ajoute la liste des fenêtres au menu Fenêtre, et le champ de recherche au menu Aide.
#[cfg(target_os = "macos")]
fn give_role<R: Runtime>(role: MenuRoleItem, submenu: &Submenu<R>) -> tauri::Result<()> {
    match role {
        MenuRoleItem::Window => submenu.set_as_windows_menu_for_nsapp(),
        MenuRoleItem::Help => submenu.set_as_help_menu_for_nsapp(),
    }
}

#[cfg(not(target_os = "macos"))]
fn give_role<R: Runtime>(_role: MenuRoleItem, _submenu: &Submenu<R>) -> tauri::Result<()> {
    Ok(())
}

/// Grise (`enabled` faux) ou rend actifs les éléments de menu `ids`, où qu'ils soient dans la barre.
///
/// # Errors
///
/// Le Mac n'a pas pu modifier un élément.
#[tauri::command]
pub fn enable_menu_items<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<String>,
    enabled: bool,
) -> Result<(), ApiError> {
    let Some(bar) = app.menu() else {
        return Ok(());
    };
    for menu in bar.items()? {
        let Some(submenu) = menu.as_submenu() else {
            continue;
        };
        for item in submenu.items()? {
            if let MenuItemKind::MenuItem(item) = item
                && ids.iter().any(|id| item.id() == id)
            {
                item.set_enabled(enabled)?;
            }
        }
    }
    Ok(())
}

/// Un élément de menu choisi : son identifiant part vers la page, qui lance la commande.
/// Les éléments standard ne passent pas par ici : le Mac les fait lui-même.
pub fn chosen<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    if let Err(error) = app.emit(MENU_COMMAND_EVENT, event.id().as_ref()) {
        tracing::error!(%error, "la commande de menu n'a pas pu être envoyée à la page");
    }
}
