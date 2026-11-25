//! Un CRM d'essai pour les tests des cas d'usage : l'horloge est arrêtée le lundi 16 novembre 2026.

use domain::NotePath;
use domain::crm::Reference;

use crate::NoteStore;
use crate::testing::InMemoryNoteStore;

pub(super) const CRM: &str = "clients.md";
pub(super) const ACME: &str =
    "---\ntype: crm-entreprise\nsite: https://acme.fr\n---\n# Acme\n\nNotes.\n";
pub(super) const GLOBEX: &str = "---\ntype: crm-entreprise\n---\n# Globex\n";
pub(super) const JEAN: &str = "---\ntype: crm-personne\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-03-01 →']\nemail: jean@acme.fr\n---\n# Jean Dupont\n";
pub(super) const MARIE: &str = "---\ntype: crm-personne\n---\n# Marie Durand\n";
pub(super) const REFONTE: &str = "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n";
pub(super) const DEVIS: &str = "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']\nstatut: Progress\ndate: '2026-11-10'\nprojet: '[[refonte]]'\nrang: 1\ntags: [urgent]\n---\n# Demande de devis\n\nPour 3 postes.\n";
pub(super) const APPEL: &str =
    "---\ntype: crm-action\npersonnes: ['[[marie-durand]]']\ndate: '2026-11-16'\n---\n# Appel\n";
pub(super) const FAIT: &str =
    "---\ntype: crm-action\nstatut: Done\ndate: '2026-11-01'\n---\n# Fait\n";

pub(super) const DEVIS_PATH: &str = "clients/actions/2026-11-10-demande-de-devis.md";
pub(super) const APPEL_PATH: &str = "clients/actions/2026-11-12-appel.md";
pub(super) const FAIT_PATH: &str = "clients/actions/2026-11-01-fait.md";
pub(super) const DEVIS_NAME: &str = "2026-11-10-demande-de-devis";
pub(super) const APPEL_NAME: &str = "2026-11-12-appel";
pub(super) const FAIT_NAME: &str = "2026-11-01-fait";

pub(super) fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

pub(super) fn crm() -> NotePath {
    path(CRM)
}

pub(super) fn reference(text: &str) -> Reference {
    Reference::to(text).unwrap()
}

/// Un CRM « Clients » : deux entreprises, deux personnes (Jean chez Acme, Marie dans NODATA), un
/// projet et trois actions.
pub(super) fn workspace() -> InMemoryNoteStore {
    InMemoryNoteStore::with_notes(&[
        (CRM, "---\ntype: crm\n---\n# Clients\n"),
        ("clients/entreprises/acme.md", ACME),
        ("clients/entreprises/globex.md", GLOBEX),
        ("clients/personnes/jean-dupont.md", JEAN),
        ("clients/personnes/marie-durand.md", MARIE),
        ("clients/projets/refonte.md", REFONTE),
        (DEVIS_PATH, DEVIS),
        (APPEL_PATH, APPEL),
        (FAIT_PATH, FAIT),
    ])
}

/// Le texte de la note `name`.
pub(super) fn text(store: &InMemoryNoteStore, name: &str) -> String {
    store.read(&path(name)).unwrap().content
}
