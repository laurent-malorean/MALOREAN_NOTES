//! Le raccourci de la saisie vocale (fiche 0109) : la combinaison de touches qui démarre et arrête
//! la dictée, choisie par l'utilisateur dans les réglages. Elle se compose de modificateurs (Ctrl,
//! Option, Cmd, Maj), dont Ctrl ou Cmd (Maj et Option seules servent à taper des majuscules et des
//! accents : le raccourci les volerait à la frappe), et d'une touche (une lettre, un chiffre ou F1
//! à F12). Écrite comme dans les menus du Mac et la palette : `Ctrl+Maj+D`, modificateurs dans
//! l'ordre Ctrl, Alt (Option), Cmd, Maj.

use std::collections::BTreeSet;
use std::fmt;
use std::str::FromStr;

/// Le raccourci de départ, tant que l'utilisateur n'en a pas choisi un autre.
pub const DEFAULT_SHORTCUT: &str = "Ctrl+Maj+D";

/// La plus grande touche de fonction acceptée (F12).
const LAST_FUNCTION_KEY: u8 = 12;

/// Une touche de modificateur ; l'ordre des variantes est l'ordre d'écriture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum Modifier {
    Ctrl,
    Alt,
    Cmd,
    Shift,
}

impl Modifier {
    const ALL: [Self; 4] = [Self::Ctrl, Self::Alt, Self::Cmd, Self::Shift];

    /// Son nom écrit dans le raccourci.
    fn name(self) -> &'static str {
        match self {
            Self::Ctrl => "Ctrl",
            Self::Alt => "Alt",
            Self::Cmd => "Cmd",
            Self::Shift => "Maj",
        }
    }

    /// Le modificateur que désigne ce mot (en minuscules ; Option et Shift sont reconnus aussi).
    fn named(word: &str) -> Option<Self> {
        match word {
            "ctrl" | "control" => Some(Self::Ctrl),
            "alt" | "option" => Some(Self::Alt),
            "cmd" | "command" => Some(Self::Cmd),
            "maj" | "shift" => Some(Self::Shift),
            _ => None,
        }
    }
}

/// La touche d'une combinaison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Key {
    /// Une lettre, en majuscule.
    Letter(char),
    /// Un chiffre.
    Digit(char),
    /// Une touche de fonction, de 1 à 12.
    Function(u8),
}

impl Key {
    fn named(word: &str) -> Option<Self> {
        let mut chars = word.chars();
        match (chars.next(), chars.next()) {
            (Some(only), None) if only.is_ascii_alphabetic() => {
                Some(Self::Letter(only.to_ascii_uppercase()))
            }
            (Some(only), None) if only.is_ascii_digit() => Some(Self::Digit(only)),
            (Some('f'), Some(_)) => word[1..]
                .parse::<u8>()
                .ok()
                .filter(|number| (1..=LAST_FUNCTION_KEY).contains(number))
                .map(Self::Function),
            _ => None,
        }
    }
}

impl fmt::Display for Key {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Letter(letter) => write!(formatter, "{letter}"),
            Self::Digit(digit) => write!(formatter, "{digit}"),
            Self::Function(number) => write!(formatter, "F{number}"),
        }
    }
}

/// Pourquoi un raccourci n'est pas valide ; le message est en français, prêt à afficher.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ShortcutError {
    /// Ni Ctrl ni Cmd : la combinaison se taperait dans la note.
    NoControlOrCommand,
    /// Que des modificateurs, aucune touche.
    NoKey,
    /// Une touche que les raccourcis ne savent pas porter.
    UnknownKey,
    /// Plusieurs touches (hors modificateurs) dans la même combinaison.
    TooManyKeys,
}

impl fmt::Display for ShortcutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::NoControlOrCommand => {
                "Un raccourci demande la touche Ctrl ou Cmd (avec Option ou Maj si vous voulez) : Maj et Option seules servent à taper."
            }
            Self::NoKey => {
                "Un raccourci demande une touche en plus des modificateurs : une lettre, un chiffre ou F1 à F12."
            }
            Self::UnknownKey => {
                "Cette touche ne peut pas servir de raccourci : choisissez une lettre, un chiffre ou F1 à F12."
            }
            Self::TooManyKeys => "Un raccourci ne porte qu'une touche en plus des modificateurs.",
        })
    }
}

impl std::error::Error for ShortcutError {}

/// Le raccourci de la saisie vocale : des modificateurs (au moins un) et une touche.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VoiceShortcut {
    modifiers: BTreeSet<Modifier>,
    key: Key,
}

impl Default for VoiceShortcut {
    /// Ctrl+Maj+D.
    fn default() -> Self {
        Self {
            modifiers: BTreeSet::from([Modifier::Ctrl, Modifier::Shift]),
            key: Key::Letter('D'),
        }
    }
}

impl VoiceShortcut {
    /// Est-ce le raccourci de départ ?
    #[must_use]
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

impl FromStr for VoiceShortcut {
    type Err = ShortcutError;

    /// Lit `Ctrl+Maj+D` (casse et ordre libres ; Option et Shift sont reconnus).
    ///
    /// # Errors
    ///
    /// [`ShortcutError::NoControlOrCommand`] sans Ctrl ni Cmd, [`ShortcutError::NoKey`] sans
    /// touche, [`ShortcutError::UnknownKey`] pour une touche que le raccourci ne porte pas,
    /// [`ShortcutError::TooManyKeys`] pour plusieurs touches.
    fn from_str(written: &str) -> Result<Self, Self::Err> {
        let mut modifiers = BTreeSet::new();
        let mut key = None;
        for part in written.split('+') {
            let word = part.trim().to_lowercase();
            if word.is_empty() {
                continue;
            }
            if let Some(modifier) = Modifier::named(&word) {
                modifiers.insert(modifier);
            } else if key.is_some() {
                return Err(ShortcutError::TooManyKeys);
            } else {
                key = Some(Key::named(&word).ok_or(ShortcutError::UnknownKey)?);
            }
        }
        let key = key.ok_or(ShortcutError::NoKey)?;
        if !modifiers.contains(&Modifier::Ctrl) && !modifiers.contains(&Modifier::Cmd) {
            return Err(ShortcutError::NoControlOrCommand);
        }
        Ok(Self { modifiers, key })
    }
}

impl fmt::Display for VoiceShortcut {
    /// L'écriture des menus du Mac : `Ctrl+Maj+D`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for modifier in Modifier::ALL {
            if self.modifiers.contains(&modifier) {
                write!(formatter, "{}+", modifier.name())?;
            }
        }
        write!(formatter, "{}", self.key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(written: &str) -> Result<VoiceShortcut, ShortcutError> {
        written.parse()
    }

    fn written(shortcut: &str) -> String {
        parsed(shortcut).unwrap().to_string()
    }

    #[test]
    fn the_default_shortcut_is_ctrl_shift_d() {
        assert_eq!(DEFAULT_SHORTCUT, "Ctrl+Maj+D");
        assert_eq!(VoiceShortcut::default().to_string(), DEFAULT_SHORTCUT);
        assert!(VoiceShortcut::default().is_default());
        assert!(parsed("Ctrl+Maj+D").unwrap().is_default());
        assert!(!parsed("Ctrl+Maj+E").unwrap().is_default());
        assert!(!parsed("Cmd+Maj+D").unwrap().is_default());
    }

    #[test]
    fn a_shortcut_is_written_with_its_modifiers_in_the_order_of_the_menus() {
        assert_eq!(written("Maj+Cmd+Alt+Ctrl+k"), "Ctrl+Alt+Cmd+Maj+K");
        assert_eq!(written("cmd+maj+n"), "Cmd+Maj+N");
        assert_eq!(written("Alt+Cmd+F"), "Alt+Cmd+F");
        assert_eq!(written("Ctrl+Cmd+K"), "Ctrl+Cmd+K");
    }

    #[test]
    fn option_and_shift_are_understood_under_their_english_and_mac_names() {
        assert_eq!(
            written("Control+Option+Command+Shift+7"),
            "Ctrl+Alt+Cmd+Maj+7"
        );
        assert_eq!(written(" ctrl + maj + d "), "Ctrl+Maj+D");
    }

    #[test]
    fn a_key_is_a_letter_a_digit_or_a_function_key() {
        assert_eq!(written("Ctrl+a"), "Ctrl+A");
        assert_eq!(written("Ctrl+0"), "Ctrl+0");
        assert_eq!(written("Ctrl+9"), "Ctrl+9");
        assert_eq!(written("Ctrl+f1"), "Ctrl+F1");
        assert_eq!(written("Ctrl+F12"), "Ctrl+F12");
    }

    #[test]
    fn a_shortcut_without_control_or_command_is_refused() {
        for shortcut in ["D", "Maj+D", "Alt+D", "Alt+Maj+D", "F5"] {
            assert_eq!(
                parsed(shortcut),
                Err(ShortcutError::NoControlOrCommand),
                "{shortcut}"
            );
        }
    }

    #[test]
    fn a_shortcut_without_a_key_is_refused() {
        for shortcut in ["Ctrl", "Ctrl+Maj", "Cmd+", "Ctrl+Alt+Cmd+Maj"] {
            assert_eq!(parsed(shortcut), Err(ShortcutError::NoKey), "{shortcut}");
        }
    }

    #[test]
    fn a_key_that_cannot_be_a_shortcut_is_refused() {
        for shortcut in [
            "Ctrl+Tab",
            "Ctrl+,",
            "Ctrl+é",
            "Ctrl+F0",
            "Ctrl+F13",
            "Ctrl+Fx",
            "Ctrl+10",
            "Ctrl+Echap",
        ] {
            assert_eq!(
                parsed(shortcut),
                Err(ShortcutError::UnknownKey),
                "{shortcut}"
            );
        }
    }

    #[test]
    fn two_keys_are_refused() {
        assert_eq!(parsed("Ctrl+D+E"), Err(ShortcutError::TooManyKeys));
        assert_eq!(parsed("Ctrl+1+2"), Err(ShortcutError::TooManyKeys));
    }

    #[test]
    fn an_empty_text_is_refused_for_want_of_a_key() {
        assert_eq!(parsed(""), Err(ShortcutError::NoKey));
    }

    #[test]
    fn each_refusal_has_a_message_in_french() {
        let messages = [
            (
                ShortcutError::NoControlOrCommand,
                "Un raccourci demande la touche Ctrl ou Cmd (avec Option ou Maj si vous voulez) : Maj et Option seules servent à taper.",
            ),
            (
                ShortcutError::NoKey,
                "Un raccourci demande une touche en plus des modificateurs : une lettre, un chiffre ou F1 à F12.",
            ),
            (
                ShortcutError::UnknownKey,
                "Cette touche ne peut pas servir de raccourci : choisissez une lettre, un chiffre ou F1 à F12.",
            ),
            (
                ShortcutError::TooManyKeys,
                "Un raccourci ne porte qu'une touche en plus des modificateurs.",
            ),
        ];
        for (error, message) in messages {
            assert_eq!(error.to_string(), message);
        }
    }
}
