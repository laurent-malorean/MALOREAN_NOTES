//! Un agenda 12 d'essai pour les tests des cas d'usage : l'horloge est arrêtée le vendredi 27
//! novembre 2026.

use domain::{Moment, NotePath};

use crate::NoteStore;
use crate::testing::{FixedClock, InMemoryNoteStore};

pub(super) const AGENDA: &str = "pro/salons.md";

pub(super) const EMBEDDED: &str = "---\ntype: agenda-12-evenement\nmois: 2\njour: 10\nannee: 2027\njour-fin: 13\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n\nStand 4A-110.\n";
pub(super) const VIVATECH: &str = "---\ntype: agenda-12-evenement\nmois: 5\nannee: 2026\npays: FR\nville: Paris\n---\n# Vivatech\n";
pub(super) const AUDIT: &str =
    "---\ntype: agenda-12-evenement\nmois: 1\njour: 15\n---\n# Audit ISO\n";
pub(super) const OLD: &str = "---\ntype: agenda-12-evenement\nmois: 3\nannee: 2025\nclos-le: 2026-03-01\n---\n# Salon passé\n";
pub(super) const OLDER: &str =
    "---\ntype: agenda-12-evenement\nmois: 6\nclos-le: 2025-06-30\n---\n# Salon très passé\n";
pub(super) const NO_MONTH: &str = "---\ntype: agenda-12-evenement\n---\n# Sans mois\n";

pub(super) const EMBEDDED_PATH: &str = "pro/salons/salon-embedded-world.md";
pub(super) const VIVATECH_PATH: &str = "pro/salons/vivatech.md";
pub(super) const AUDIT_PATH: &str = "pro/salons/audit-iso.md";
pub(super) const OLD_PATH: &str = "pro/salons/archives/salon-passe.md";

pub(super) fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

pub(super) fn agenda() -> NotePath {
    path(AGENDA)
}

pub(super) fn clock() -> FixedClock {
    FixedClock::at(Moment::new(2026, 11, 27, 14, 0).unwrap())
}

/// Un agenda 12 « Salons » : trois événements ouverts, deux clos, un illisible, une note ordinaire.
pub(super) fn workspace() -> InMemoryNoteStore {
    InMemoryNoteStore::with_notes(&[
        (AGENDA, "---\ntype: agenda-12\n---\n# Salons\n"),
        (EMBEDDED_PATH, EMBEDDED),
        (VIVATECH_PATH, VIVATECH),
        (AUDIT_PATH, AUDIT),
        (OLD_PATH, OLD),
        ("pro/salons/archives/salon-tres-passe.md", OLDER),
        ("pro/salons/sans-mois.md", NO_MONTH),
        ("pro/salons/notes.md", "# Notes\n"),
        ("pro/autre.md", "# Autre\n"),
    ])
}

/// Le texte de la note `name`.
pub(super) fn text(store: &InMemoryNoteStore, name: &str) -> String {
    store.read(&path(name)).unwrap().content
}
