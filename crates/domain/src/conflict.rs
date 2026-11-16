//! Conflit : une note modifiée à la fois dans l'application et hors de l'application.

use std::fmt;

use crate::{FileName, Moment};

const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0100_0000_01b3;
const FINGERPRINT_LENGTH: usize = 16;

/// Empreinte d'un contenu : deux contenus différents n'ont (en pratique) jamais la même.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Fingerprint(String);

/// Empreinte refusée : pas exactement 16 chiffres hexadécimaux.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidFingerprint(pub String);

impl fmt::Display for InvalidFingerprint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "empreinte de note invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidFingerprint {}

impl Fingerprint {
    /// L'empreinte de `content` (FNV-1a sur 64 bits, en hexadécimal).
    #[must_use]
    pub fn of(content: &str) -> Self {
        let hash = content.bytes().fold(FNV_OFFSET, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(FNV_PRIME)
        });
        Self(format!("{hash:016x}"))
    }

    /// Une empreinte reçue de la page.
    ///
    /// # Errors
    ///
    /// [`InvalidFingerprint`] si ce ne sont pas exactement 16 chiffres hexadécimaux minuscules.
    pub fn parse(text: &str) -> Result<Self, InvalidFingerprint> {
        let valid = text.len() == FINGERPRINT_LENGTH
            && text
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if valid {
            Ok(Self(text.to_owned()))
        } else {
            Err(InvalidFingerprint(text.to_owned()))
        }
    }

    /// L'empreinte, telle qu'on la transmet.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Le nom de la copie de conflit de `original`, faite à `at` :
/// `<nom> (conflit 2026-11-16 18h30).md`, ou le premier suffixe libre parmi `existing`.
#[must_use]
pub fn conflict_copy_name(original: &FileName, at: &Moment, existing: &[FileName]) -> FileName {
    let wanted = format!("{} (conflit {}).md", original.stem(), at.label());
    FileName::parse(&wanted)
        .unwrap_or_else(|_| {
            unreachable!("le nom d'une note suivi d'un suffixe reste un nom de note")
        })
        .deduplicated(|candidate| existing.contains(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(text: &str) -> FileName {
        FileName::parse(text).unwrap()
    }

    fn evening() -> Moment {
        Moment::new(2026, 11, 6, 8, 5).unwrap()
    }

    #[test]
    fn the_fingerprint_of_a_text_is_always_the_same() {
        assert_eq!(Fingerprint::of("# Courses"), Fingerprint::of("# Courses"));
        assert_eq!(Fingerprint::of("").as_str(), "cbf29ce484222325");
        assert_eq!(Fingerprint::of("a").as_str(), "af63dc4c8601ec8c");
    }

    #[test]
    fn a_changed_text_has_another_fingerprint() {
        assert_ne!(
            Fingerprint::of("# Courses"),
            Fingerprint::of("# Courses\n- pain")
        );
    }

    #[test]
    fn a_fingerprint_received_from_the_page_is_checked() {
        assert_eq!(
            Fingerprint::parse("af63dc4c8601ec8c"),
            Ok(Fingerprint::of("a"))
        );
        for bad in [
            "",
            "af63dc4c8601ec8",
            "af63dc4c8601ec8cc",
            "AF63DC4C8601EC8C",
            "zf63dc4c8601ec8c",
        ] {
            assert_eq!(
                Fingerprint::parse(bad),
                Err(InvalidFingerprint(bad.to_owned())),
                "{bad}"
            );
        }
        assert_eq!(
            InvalidFingerprint("x".into()).to_string(),
            "empreinte de note invalide : « x »"
        );
    }

    #[test]
    fn the_conflict_copy_is_named_after_the_note_and_the_moment() {
        assert_eq!(
            conflict_copy_name(&name("courses.md"), &evening(), &[]).as_str(),
            "courses (conflit 2026-11-06 08h05).md"
        );
    }

    #[test]
    fn a_second_conflict_in_the_same_minute_gets_a_suffix() {
        let taken = [name("courses (conflit 2026-11-06 08h05).md")];
        assert_eq!(
            conflict_copy_name(&name("courses.md"), &evening(), &taken).as_str(),
            "courses (conflit 2026-11-06 08h05)-2.md"
        );
    }
}
