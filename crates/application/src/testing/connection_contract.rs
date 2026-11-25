//! Test de contrat du stockage de la clé de branchement : joué à l'identique sur le faux et sur
//! le vrai fichier.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::Moment;
use domain::connection_key::ConnectionKey;

use crate::ConnectionKeys;

fn key(secret: &str) -> ConnectionKey {
    ConnectionKey::new(secret, Moment::new(2026, 11, 25, 14, 30).unwrap()).unwrap()
}

/// Joue tout le contrat ; `fresh` fabrique un stockage sans clé à chaque appel.
pub fn connection_keys_contract<K: ConnectionKeys>(fresh: impl Fn() -> K) {
    there_is_no_key_at_first(&fresh());
    a_saved_key_is_read_back_with_its_creation_moment(&fresh());
    saving_replaces_the_previous_key(&fresh());
    deleting_leaves_no_key(&fresh());
    deleting_without_a_key_is_not_an_error(&fresh());
}

fn there_is_no_key_at_first(keys: &impl ConnectionKeys) {
    assert_eq!(keys.load().unwrap(), None);
}

fn a_saved_key_is_read_back_with_its_creation_moment(keys: &impl ConnectionKeys) {
    keys.save(&key("secret")).unwrap();
    let loaded = keys.load().unwrap().unwrap();
    assert_eq!(loaded.secret(), "secret");
    assert_eq!(loaded.created_label(), "2026-11-25 14h30");
}

fn saving_replaces_the_previous_key(keys: &impl ConnectionKeys) {
    keys.save(&key("ancienne")).unwrap();
    keys.save(&key("nouvelle")).unwrap();
    assert_eq!(keys.load().unwrap().unwrap().secret(), "nouvelle");
}

fn deleting_leaves_no_key(keys: &impl ConnectionKeys) {
    keys.save(&key("secret")).unwrap();
    keys.delete().unwrap();
    assert_eq!(keys.load().unwrap(), None);
}

fn deleting_without_a_key_is_not_an_error(keys: &impl ConnectionKeys) {
    keys.delete().unwrap();
    assert_eq!(keys.load().unwrap(), None);
}
