//! Le raccourci de la saisie vocale (fiches 0109 et 0110) : ce qui démarre et arrête la dictée,
//! choisi par l'utilisateur dans les réglages. Trois formes :
//!
//! - une **combinaison** : des modificateurs (Ctrl, Option, Cmd, Maj), dont Ctrl ou Cmd (Maj et
//!   Option seules servent à taper des majuscules et des accents : le raccourci les volerait à la
//!   frappe), et une touche (une lettre, un chiffre ou F1 à F12) ;
//! - une **touche de fonction seule** (F1 à F12) : elle ne tape pas de texte ;
//! - une **touche seule** : un modificateur pris seul, côté gauche ou droit (`Cmd droite`), que
//!   l'interface déclenche au tapotement.
//!
//! Écrite comme dans les menus du Mac et la palette : `Ctrl+Maj+D`, `F5`, modificateurs dans
//! l'ordre Ctrl, Alt (Option), Cmd, Maj ; une touche seule s'écrit avec son côté : `Cmd droite`.

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

/// Le côté d'une touche de modificateur seule : le clavier a deux touches de chaque.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Side {
    Left,
    Right,
}

impl Side {
    fn name(self) -> &'static str {
        match self {
            Self::Left => "gauche",
            Self::Right => "droite",
        }
    }

    /// Le côté que désigne ce mot (en minuscules ; l'anglais est reconnu aussi).
    fn named(word: &str) -> Option<Self> {
        match word {
            "gauche" | "left" => Some(Self::Left),
            "droite" | "droit" | "right" => Some(Self::Right),
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

    /// Une touche de fonction ne tape aucun texte : elle sert sans Ctrl ni Cmd.
    fn types_nothing(self) -> bool {
        matches!(self, Self::Function(_))
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
    /// Une lettre ou un chiffre sans Ctrl ni Cmd : la touche se taperait dans la note.
    NoControlOrCommand,
    /// Que des modificateurs sans côté, ou plusieurs modificateurs sans touche.
    NoKey,
    /// Une touche que les raccourcis ne savent pas porter.
    UnknownKey,
    /// Plusieurs touches (hors modificateurs) dans la même combinaison.
    TooManyKeys,
    /// La touche Fn, que le contenu web ne voit pas.
    FnKey,
}

impl fmt::Display for ShortcutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::NoControlOrCommand => {
                "Cette touche tape du texte : ajoutez Ctrl ou Cmd (avec Option ou Maj si vous voulez). Seules une touche de modificateur (Cmd, Option, Ctrl, Maj) et F1 à F12 servent seules."
            }
            Self::NoKey => {
                "Un raccourci demande une touche en plus des modificateurs : une lettre, un chiffre ou F1 à F12. Une touche de modificateur se prend seule, avec son côté (gauche ou droite)."
            }
            Self::UnknownKey => {
                "Cette touche ne peut pas servir de raccourci : choisissez une touche de modificateur seule, F1 à F12, ou Ctrl ou Cmd avec une lettre, un chiffre ou F1 à F12."
            }
            Self::TooManyKeys => "Un raccourci ne porte qu'une touche en plus des modificateurs.",
            Self::FnKey => {
                "La touche Fn ne peut pas servir de raccourci : l'application ne la voit pas. Choisissez une autre touche."
            }
        })
    }
}

impl std::error::Error for ShortcutError {}

/// Ce que déclenche le raccourci.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Form {
    /// Des modificateurs (aucun seulement pour une touche de fonction) et une touche.
    Combination {
        modifiers: BTreeSet<Modifier>,
        key: Key,
    },
    /// Un modificateur seul, d'un côté du clavier.
    Tap { modifier: Modifier, side: Side },
}

/// Le raccourci de la saisie vocale.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VoiceShortcut {
    form: Form,
}

impl Default for VoiceShortcut {
    /// Ctrl+Maj+D.
    fn default() -> Self {
        Self {
            form: Form::Combination {
                modifiers: BTreeSet::from([Modifier::Ctrl, Modifier::Shift]),
                key: Key::Letter('D'),
            },
        }
    }
}

impl VoiceShortcut {
    /// Est-ce le raccourci de départ ?
    #[must_use]
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }

    /// Est-ce une touche seule, à déclencher au tapotement ?
    #[must_use]
    pub fn is_tap(&self) -> bool {
        matches!(self.form, Form::Tap { .. })
    }
}

/// La touche seule que désignent ces mots (`cmd droite`), s'ils la désignent.
fn tap_named(words: &[&str]) -> Option<Form> {
    match words {
        [modifier, side] => Some(Form::Tap {
            modifier: Modifier::named(modifier)?,
            side: Side::named(side)?,
        }),
        _ => None,
    }
}

impl FromStr for VoiceShortcut {
    type Err = ShortcutError;

    /// Lit `Ctrl+Maj+D`, `F5` ou `Cmd droite` (casse et ordre libres ; Option et Shift sont reconnus).
    ///
    /// # Errors
    ///
    /// [`ShortcutError::NoControlOrCommand`] pour une lettre ou un chiffre sans Ctrl ni Cmd,
    /// [`ShortcutError::NoKey`] sans touche, [`ShortcutError::UnknownKey`] pour une touche que le
    /// raccourci ne porte pas, [`ShortcutError::TooManyKeys`] pour plusieurs touches,
    /// [`ShortcutError::FnKey`] pour la touche Fn.
    fn from_str(written: &str) -> Result<Self, Self::Err> {
        let lowered = written.to_lowercase();
        let words: Vec<&str> = lowered.split_whitespace().collect();
        if let Some(form) = tap_named(&words) {
            return Ok(Self { form });
        }
        let mut modifiers = BTreeSet::new();
        let mut key = None;
        for part in lowered.split('+') {
            let word = part.trim();
            if word.is_empty() {
                continue;
            }
            if word == "fn" {
                return Err(ShortcutError::FnKey);
            }
            if let Some(modifier) = Modifier::named(word) {
                modifiers.insert(modifier);
            } else if key.is_some() {
                return Err(ShortcutError::TooManyKeys);
            } else {
                key = Some(Key::named(word).ok_or(ShortcutError::UnknownKey)?);
            }
        }
        let key = key.ok_or(ShortcutError::NoKey)?;
        let controls = modifiers.contains(&Modifier::Ctrl) || modifiers.contains(&Modifier::Cmd);
        if !controls && !key.types_nothing() {
            return Err(ShortcutError::NoControlOrCommand);
        }
        Ok(Self {
            form: Form::Combination { modifiers, key },
        })
    }
}

impl fmt::Display for VoiceShortcut {
    /// L'écriture des menus du Mac : `Ctrl+Maj+D` ; une touche seule avec son côté : `Cmd droite`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.form {
            Form::Tap { modifier, side } => {
                write!(formatter, "{} {}", modifier.name(), side.name())
            }
            Form::Combination { modifiers, key } => {
                for modifier in Modifier::ALL {
                    if modifiers.contains(&modifier) {
                        write!(formatter, "{}+", modifier.name())?;
                    }
                }
                write!(formatter, "{key}")
            }
        }
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
        for shortcut in ["D", "5", "Maj+D", "Alt+D", "Alt+Maj+D", "Alt+7"] {
            assert_eq!(
                parsed(shortcut),
                Err(ShortcutError::NoControlOrCommand),
                "{shortcut}"
            );
        }
    }

    #[test]
    fn a_function_key_alone_is_a_shortcut() {
        assert_eq!(written("F5"), "F5");
        assert_eq!(written("f1"), "F1");
        assert_eq!(written("F12"), "F12");
        assert!(!parsed("F5").unwrap().is_tap());
        assert!(!parsed("F5").unwrap().is_default());
    }

    #[test]
    fn a_function_key_needs_no_control_or_command_with_option_or_shift() {
        assert_eq!(written("Maj+F5"), "Maj+F5");
        assert_eq!(written("Alt+F5"), "Alt+F5");
        assert_eq!(written("maj+alt+f2"), "Alt+Maj+F2");
    }

    #[test]
    fn a_function_key_beyond_f12_alone_is_still_refused() {
        assert_eq!(parsed("F13"), Err(ShortcutError::UnknownKey));
        assert_eq!(parsed("F0"), Err(ShortcutError::UnknownKey));
    }

    #[test]
    fn a_modifier_key_alone_is_a_shortcut_on_one_side_of_the_keyboard() {
        assert_eq!(written("Cmd droite"), "Cmd droite");
        assert_eq!(written("Cmd gauche"), "Cmd gauche");
        assert_eq!(written("Alt droite"), "Alt droite");
        assert_eq!(written("Ctrl gauche"), "Ctrl gauche");
        assert_eq!(written("Maj droite"), "Maj droite");
        assert!(parsed("Cmd droite").unwrap().is_tap());
        assert!(!parsed("Cmd droite").unwrap().is_default());
    }

    #[test]
    fn a_modifier_key_alone_is_read_under_its_other_names_and_cases() {
        assert_eq!(written("command RIGHT"), "Cmd droite");
        assert_eq!(written("Option left"), "Alt gauche");
        assert_eq!(written("  shift   droit "), "Maj droite");
        assert_eq!(written("control gauche"), "Ctrl gauche");
    }

    #[test]
    fn the_two_sides_of_a_modifier_are_two_shortcuts() {
        assert_ne!(parsed("Cmd gauche"), parsed("Cmd droite"));
        assert_ne!(parsed("Cmd droite"), parsed("Alt droite"));
        assert_eq!(parsed("Cmd droite"), parsed("cmd right"));
    }

    #[test]
    fn a_modifier_without_its_side_is_refused() {
        assert_eq!(parsed("Cmd"), Err(ShortcutError::NoKey));
        assert_eq!(parsed("Cmd haut"), Err(ShortcutError::UnknownKey));
    }

    #[test]
    fn a_modifier_alone_with_a_side_is_not_a_combination() {
        assert!(!parsed("Ctrl+Maj+D").unwrap().is_tap());
        assert_eq!(parsed("Cmd droite+D"), Err(ShortcutError::UnknownKey));
    }

    #[test]
    fn the_fn_key_is_refused_with_its_own_message() {
        for shortcut in ["Fn", "fn", "Ctrl+Fn", "Fn+F5"] {
            assert_eq!(parsed(shortcut), Err(ShortcutError::FnKey), "{shortcut}");
        }
    }

    #[test]
    fn a_key_that_types_text_alone_is_refused() {
        for shortcut in [
            "Space",
            "Enter",
            "Backspace",
            "Tab",
            "ArrowLeft",
            "Escape",
            "Echap",
        ] {
            assert_eq!(
                parsed(shortcut),
                Err(ShortcutError::UnknownKey),
                "{shortcut}"
            );
        }
    }

    #[test]
    fn a_shortcut_written_before_the_single_keys_is_still_read() {
        assert_eq!(written("Ctrl+Maj+D"), "Ctrl+Maj+D");
        assert_eq!(written("Cmd+Alt+E"), "Alt+Cmd+E");
        assert_eq!(written("Ctrl+F5"), "Ctrl+F5");
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
                "Cette touche tape du texte : ajoutez Ctrl ou Cmd (avec Option ou Maj si vous voulez). Seules une touche de modificateur (Cmd, Option, Ctrl, Maj) et F1 à F12 servent seules.",
            ),
            (
                ShortcutError::NoKey,
                "Un raccourci demande une touche en plus des modificateurs : une lettre, un chiffre ou F1 à F12. Une touche de modificateur se prend seule, avec son côté (gauche ou droite).",
            ),
            (
                ShortcutError::UnknownKey,
                "Cette touche ne peut pas servir de raccourci : choisissez une touche de modificateur seule, F1 à F12, ou Ctrl ou Cmd avec une lettre, un chiffre ou F1 à F12.",
            ),
            (
                ShortcutError::TooManyKeys,
                "Un raccourci ne porte qu'une touche en plus des modificateurs.",
            ),
            (
                ShortcutError::FnKey,
                "La touche Fn ne peut pas servir de raccourci : l'application ne la voit pas. Choisissez une autre touche.",
            ),
        ];
        for (error, message) in messages {
            assert_eq!(error.to_string(), message);
        }
    }
}
