//! Les outils de l'application qui touchent à ce que l'utilisateur voit (fiche 0040) : savoir ce
//! qu'il regarde (la note de la colonne active et le texte sélectionné, demandés à l'interface au
//! moment de l'appel), et lui montrer une note. Rien d'autre de l'écran : ni colonnes, ni onglets,
//! ni curseur.

use std::fmt::Debug;
use std::sync::atomic::Ordering;
use std::sync::{Arc, MutexGuard, PoisonError, mpsc};
use std::time::Duration;

use serde_json::{Value, json};

use super::{required, written};
use crate::session::Session;

/// Le temps laissé à l'interface pour dire ce que l'utilisateur regarde.
const VIEW_DELAY: Duration = Duration::from_secs(2);

/// L'interface, vue par les outils de l'application.
pub trait AppScreen: Send + Sync + Debug {
    /// Ouvre la note `path` (chemin depuis l'espace de travail) dans la colonne active.
    fn show_note(&self, path: &str);

    /// Demande ce que l'utilisateur regarde ; l'interface répond par
    /// [`Session::answer_view`] avec le même numéro `request`.
    fn ask_view(&self, request: u64);
}

/// Ce que l'interface dit que l'utilisateur regarde.
#[derive(Debug)]
pub(in crate::session) struct View {
    note: Option<String>,
    selection: String,
}

impl Session {
    /// La même session, dont les outils de l'application touchent à l'interface par `screen`.
    #[must_use]
    pub fn with_screen(mut self, screen: Arc<dyn AppScreen>) -> Self {
        self.screen = Some(screen);
        self
    }

    fn views(&self) -> MutexGuard<'_, std::collections::HashMap<u64, mpsc::Sender<View>>> {
        self.views.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// La réponse de l'interface à la demande `request` : la note de la colonne active (aucune
    /// si elle n'en montre pas) et le texte sélectionné. Une demande inconnue, ou déjà passée,
    /// est ignorée.
    pub fn answer_view(&self, request: u64, note: Option<String>, selection: String) {
        if let Some(waiting) = self.views().remove(&request) {
            // Celui qui attendait a pu cesser d'attendre : la réponse ne sert alors plus.
            waiting.send(View { note, selection }).ok();
        }
    }

    /// Ce que l'utilisateur regarde, dans l'espace de travail du tour : la note de la colonne
    /// active (chemin et titre) et le texte sélectionné.
    pub(super) fn tool_viewed_note(&self) -> Result<String, String> {
        let workspace = self.opened().map_err(|error| error.message)?.name;
        let screen = self.screen.as_ref().ok_or_else(no_screen)?;
        let request = self.view_requests.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::channel();
        self.views().insert(request, sender);
        screen.ask_view(request);
        let view = receiver.recv_timeout(VIEW_DELAY);
        self.views().remove(&request);
        let view = view.map_err(|_| "l'interface n'a pas répondu : réessayez".to_owned())?;
        let note = view
            .note
            .and_then(|path| self.read_note(&path).ok())
            .map(|note| json!({ "path": note.path, "title": note.title }));
        written(&json!({
            "workspace": workspace.as_str(),
            "note": note.unwrap_or(Value::Null),
            "selection": view.selection,
        }))
    }

    /// Ouvre pour l'utilisateur une note de l'espace de travail, dans la colonne active.
    pub(super) fn tool_show_note(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let screen = self.screen.as_ref().ok_or_else(no_screen)?;
        let note = self.read_note(path).map_err(|error| error.message)?;
        screen.show_note(&note.path);
        written(&json!({ "shown": note.path }))
    }
}

fn no_screen() -> String {
    "l'interface de MALOREAN Notes n'est pas là pour répondre".to_owned()
}
