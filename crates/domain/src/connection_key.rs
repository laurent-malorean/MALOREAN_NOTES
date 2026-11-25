//! La clé de branchement (fiche 0056) : le secret stable qu'une IA extérieure à l'application
//! présente pour être écoutée. Elle ne change que si l'utilisateur la révoque ; à ne pas confondre
//! avec la clé du tour (`AppToolsKey`), propre à la colonne Claude Code.

use std::fmt;

use crate::Moment;

/// Une clé de branchement : son secret, jamais vide, et le moment où elle a été créée. Le secret
/// n'apparaît jamais dans une forme de débogage, donc jamais dans un journal.
#[derive(Clone, PartialEq, Eq)]
pub struct ConnectionKey {
    secret: String,
    created: Moment,
}

impl ConnectionKey {
    /// La clé de secret `secret`, créée à `created` ; rien si le secret est vide.
    #[must_use]
    pub fn new(secret: impl Into<String>, created: Moment) -> Option<Self> {
        let secret = secret.into();
        (!secret.is_empty()).then_some(Self { secret, created })
    }

    /// La clé lue dans un fichier : son secret et son moment de création écrit par
    /// [`Self::created_label`] ; rien si le secret est vide ou le moment illisible.
    #[must_use]
    pub fn from_stored(secret: impl Into<String>, created_label: &str) -> Option<Self> {
        Self::new(secret, Moment::of_label(created_label)?)
    }

    /// Le secret, tel que l'IA le présente.
    #[must_use]
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// Le moment de création, tel qu'on le garde dans un fichier : `2026-11-25 14h30`.
    #[must_use]
    pub fn created_label(&self) -> String {
        self.created.label()
    }

    /// Le jour de création, en toutes lettres : `25 novembre 2026`.
    #[must_use]
    pub fn created_on(&self) -> String {
        self.created.long_date()
    }
}

impl fmt::Debug for ConnectionKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("ConnectionKey(..)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment() -> Moment {
        Moment::new(2026, 11, 25, 14, 30).unwrap()
    }

    #[test]
    fn a_key_without_secret_does_not_exist() {
        assert_eq!(ConnectionKey::new("", moment()), None);
    }

    #[test]
    fn a_key_gives_its_secret_and_is_never_shown_in_debug() {
        let key = ConnectionKey::new("secret", moment()).unwrap();
        assert_eq!(key.secret(), "secret");
        assert_eq!(format!("{key:?}"), "ConnectionKey(..)");
    }

    #[test]
    fn a_key_says_when_it_was_created() {
        let key = ConnectionKey::new("secret", moment()).unwrap();
        assert_eq!(key.created_label(), "2026-11-25 14h30");
        assert_eq!(key.created_on(), "25 novembre 2026");
    }

    #[test]
    fn a_stored_key_is_read_back_from_its_label() {
        let key = ConnectionKey::from_stored("secret", "2026-11-25 14h30").unwrap();
        assert_eq!(key, ConnectionKey::new("secret", moment()).unwrap());
    }

    #[test]
    fn a_stored_key_with_an_empty_secret_or_an_unreadable_moment_is_refused() {
        assert_eq!(ConnectionKey::from_stored("", "2026-11-25 14h30"), None);
        assert_eq!(ConnectionKey::from_stored("secret", "hier"), None);
    }
}
