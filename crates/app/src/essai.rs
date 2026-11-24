//! Essai de l'application réelle (fiche 0054) : compilé seulement avec la fonctionnalité `essai`.
//!
//! L'interface (construite elle aussi pour l'essai) joue ses scénarios dans la vraie fenêtre, puis
//! remet son rapport à Rust, qui l'écrit et quitte. Rust ne sait rien des scénarios : il donne les
//! deux emplacements de l'essai (pris dans l'environnement du lancement), écrit le rapport, répond à
//! la place de la fenêtre d'enregistrement du Mac (qu'aucun scénario ne peut piloter) et quitte.
//! Sans les variables d'environnement, l'application se comporte comme d'habitude.

use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine as _;
use serde::Serialize;
use tauri::ipc::Invoke;
use tauri::{AppHandle, Runtime, State};

/// Le fichier où l'essai écrit son rapport (JSON).
const REPORT_VARIABLE: &str = "MALOREAN_ESSAI";
/// Le dossier de l'espace de travail temporaire de l'essai.
const WORKSPACE_VARIABLE: &str = "MALOREAN_ESSAI_ESPACE";
/// La commande de la fenêtre d'enregistrement du Mac, que l'essai remplace.
const EXPORT_DIALOG: &str = "choose_export_file";
/// Le début du nom de chaque commande propre à l'essai.
const OWN_PREFIX: &str = "essai_";

/// Les deux emplacements de l'essai, tels que l'interface les reçoit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    /// Où écrire le rapport.
    report: String,
    /// Le dossier qui contient les espaces de travail de l'essai.
    workspace: String,
}

impl Settings {
    /// Les emplacements donnés par l'environnement `get` ; rien si l'un manque ou est vide : ce n'est
    /// alors pas un lancement d'essai.
    pub(crate) fn from_environment(get: impl Fn(&str) -> Option<String>) -> Option<Self> {
        let given = |name: &str| get(name).filter(|value| !value.is_empty());
        Some(Self {
            report: given(REPORT_VARIABLE)?,
            workspace: given(WORKSPACE_VARIABLE)?,
        })
    }
}

/// Ce que l'essai garde pendant la vie de l'application.
#[derive(Debug)]
pub(crate) struct Essai {
    settings: Option<Settings>,
    /// Le fichier que la prochaine « fenêtre d'enregistrement » rendra.
    destination: Mutex<Option<String>>,
}

impl Essai {
    /// L'essai que demande l'environnement du lancement, s'il en demande un.
    pub(crate) fn from_environment() -> Self {
        Self {
            settings: Settings::from_environment(|name| env::var(name).ok()),
            destination: Mutex::new(None),
        }
    }
}

/// Le fichier choisi dans la fenêtre d'enregistrement : même forme que celle du Mac.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChosenFile {
    path: String,
    folder: String,
}

impl ChosenFile {
    fn at(path: String) -> Self {
        let folder = Path::new(&path)
            .parent()
            .map(|parent| parent.to_string_lossy().into_owned())
            .unwrap_or_default();
        Self { path, folder }
    }
}

/// Écrit `report` à `path` d'un coup (fichier voisin puis renommage) : celui qui attend le rapport
/// n'en lit jamais la moitié.
pub(crate) fn write_report(path: &Path, report: &str) -> io::Result<()> {
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    let mut partial = path.as_os_str().to_owned();
    partial.push(".partiel");
    let partial = PathBuf::from(partial);
    fs::write(&partial, report)?;
    fs::rename(&partial, path)
}

/// Les emplacements de l'essai, ou rien si l'application n'est pas lancée pour un essai.
#[tauri::command]
pub(crate) fn essai_settings(essai: State<'_, Essai>) -> Option<Settings> {
    essai.settings.clone()
}

/// Crée le dossier du fichier d'export, que la vraie fenêtre d'enregistrement du Mac aurait créé ou
/// montré existant.
pub(crate) fn prepare_destination(path: &Path) -> io::Result<()> {
    path.parent().map_or(Ok(()), fs::create_dir_all)
}

/// Donne le fichier que rendra la prochaine fenêtre d'enregistrement.
#[tauri::command]
pub(crate) fn essai_set_destination(essai: State<'_, Essai>, path: String) -> Result<(), String> {
    prepare_destination(Path::new(&path)).map_err(|error| format!("{path} : {error}"))?;
    if let Ok(mut destination) = essai.destination.lock() {
        *destination = Some(path);
    }
    Ok(())
}

/// Écrit le rapport de l'essai.
#[tauri::command]
pub(crate) fn essai_write_report(essai: State<'_, Essai>, report: String) -> Result<(), String> {
    let settings = essai
        .settings
        .as_ref()
        .ok_or("aucun essai demandé : le rapport n'a pas d'emplacement")?;
    write_report(Path::new(&settings.report), &report).map_err(|error| error.to_string())
}

/// Lit un fichier du disque, en base64 : ce que l'interface mesure d'un fichier écrit par Rust
/// (signature, taille), sans passer par le protocole des fichiers qu'elle teste par ailleurs.
pub(crate) fn read_base64(path: &Path) -> io::Result<String> {
    Ok(base64::engine::general_purpose::STANDARD.encode(fs::read(path)?))
}

/// Le contenu du fichier `path`, en base64.
#[tauri::command]
pub(crate) fn essai_read_file(path: String) -> Result<String, String> {
    read_base64(Path::new(&path)).map_err(|error| format!("{path} : {error}"))
}

/// Quitte l'application : l'essai est fini.
#[tauri::command]
pub(crate) fn essai_quit<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

/// La fenêtre d'enregistrement de l'essai : rend le fichier donné par `essai_set_destination`, une
/// seule fois.
#[tauri::command]
pub(crate) fn choose_export_file(essai: State<'_, Essai>) -> Result<Option<ChosenFile>, String> {
    let given = essai
        .destination
        .lock()
        .map_err(|error| error.to_string())?
        .take();
    given
        .map(|path| Some(ChosenFile::at(path)))
        .ok_or_else(|| "essai : aucun fichier d'export donné à la fenêtre d'enregistrement".into())
}

/// Les commandes de l'essai.
fn own_handler<R: Runtime>() -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        essai_settings,
        essai_set_destination,
        essai_write_report,
        essai_read_file,
        essai_quit,
        choose_export_file
    ]
}

/// Le gestionnaire des commandes : celles de l'essai d'abord, les autres comme d'habitude. La
/// fenêtre d'enregistrement n'est remplacée que si l'environnement demande un essai.
pub(crate) fn handler<R: Runtime>(
    main: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    let own = own_handler::<R>();
    let active = Settings::from_environment(|name| env::var(name).ok()).is_some();
    move |invoke: Invoke<R>| {
        let command = invoke.message.command();
        let ours = command.starts_with(OWN_PREFIX) || (active && command == EXPORT_DIALOG);
        if ours { own(invoke) } else { main(invoke) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn environment(report: &str, workspace: &str) -> impl Fn(&str) -> Option<String> {
        let (report, workspace) = (report.to_owned(), workspace.to_owned());
        move |name| match name {
            REPORT_VARIABLE => Some(report.clone()),
            WORKSPACE_VARIABLE => Some(workspace.clone()),
            _ => None,
        }
    }

    #[test]
    fn the_settings_come_from_the_two_variables() {
        let settings = Settings::from_environment(environment("/r.json", "/e"));
        assert_eq!(
            settings,
            Some(Settings {
                report: "/r.json".into(),
                workspace: "/e".into()
            })
        );
    }

    #[test]
    fn a_missing_or_empty_variable_is_not_an_essai() {
        assert_eq!(Settings::from_environment(|_| None), None);
        assert_eq!(Settings::from_environment(environment("", "/e")), None);
        assert_eq!(Settings::from_environment(environment("/r.json", "")), None);
        let only_report = |name: &str| (name == REPORT_VARIABLE).then(|| "/r.json".to_owned());
        assert_eq!(Settings::from_environment(only_report), None);
    }

    #[test]
    fn the_settings_are_sent_in_camel_case() {
        let settings = Settings::from_environment(environment("/r.json", "/e"))
            .unwrap_or_else(|| unreachable!("les deux variables sont données"));
        let json = serde_json::to_string(&settings).unwrap_or_default();
        assert_eq!(json, r#"{"report":"/r.json","workspace":"/e"}"#);
    }

    #[test]
    fn the_report_is_written_whole_in_a_new_folder() -> io::Result<()> {
        let folder = tempfile::tempdir()?;
        let path = folder.path().join("sous/dossier/rapport.json");
        write_report(&path, "{\"a\":1}")?;
        assert_eq!(fs::read_to_string(&path)?, "{\"a\":1}");
        write_report(&path, "{\"a\":2}")?;
        assert_eq!(fs::read_to_string(&path)?, "{\"a\":2}");
        let names: Vec<_> = fs::read_dir(path.parent().unwrap_or(folder.path()))?
            .filter_map(Result::ok)
            .map(|entry| entry.file_name())
            .collect();
        assert_eq!(names, ["rapport.json"]);
        Ok(())
    }

    #[test]
    fn a_report_that_cannot_be_written_is_an_error() -> io::Result<()> {
        let folder = tempfile::tempdir()?;
        let blocker = folder.path().join("fichier");
        fs::write(&blocker, "x")?;
        assert!(write_report(&blocker.join("rapport.json"), "{}").is_err());
        Ok(())
    }

    #[test]
    fn the_folder_of_an_export_is_created() -> io::Result<()> {
        let folder = tempfile::tempdir()?;
        let path = folder.path().join("Exports/carte.png");
        prepare_destination(&path)?;
        assert!(folder.path().join("Exports").is_dir());
        assert!(!path.exists());
        prepare_destination(Path::new("sans-dossier.png"))?;
        Ok(())
    }

    #[test]
    fn the_chosen_file_knows_its_folder() {
        let chosen = ChosenFile::at("/espace/exports/carte.png".into());
        assert_eq!(chosen.path, "/espace/exports/carte.png");
        assert_eq!(chosen.folder, "/espace/exports");
        assert_eq!(ChosenFile::at("carte.png".into()).folder, "");
    }

    #[test]
    fn a_file_is_read_in_base64() -> io::Result<()> {
        let folder = tempfile::tempdir()?;
        let path = folder.path().join("a.bin");
        fs::write(&path, [0x89, b'P', b'N', b'G'])?;
        assert_eq!(read_base64(&path)?, "iVBORw==");
        let missing = essai_read_file(folder.path().join("absent").to_string_lossy().into_owned());
        assert!(missing.is_err_and(|message| message.contains("absent")));
        Ok(())
    }

    #[test]
    fn the_destination_is_given_once() {
        let essai = Essai::from_environment();
        assert_eq!(essai.settings, None);
        assert!(essai.destination.lock().is_ok_and(|d| d.is_none()));
    }
}
