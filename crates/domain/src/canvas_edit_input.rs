//! Ce que les gestes d'un canvas prennent et rendent (fiche 0079) : constantes de l'interface, choix
//! d'une couleur, sens d'une flèche, description de ce qu'on ajoute ou change, et les contrôles
//! communs. Les gestes eux-mêmes sont dans `canvas_edit.rs`.

use std::fmt;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::canvas::{ArrowEnd, CanvasArrow, CardKind, Side};
use crate::canvas_color::file_color;
use crate::mind_map::PALETTE;
use crate::web_address::WebAddress;

/// La taille d'une carte texte neuve : celle d'Obsidian (`canvas.md`, § 4.1).
pub const TEXT_SIZE: Size = Size {
    width: 250,
    height: 60,
};
/// La taille d'une carte de fichier ou de page web neuve.
pub const FILE_SIZE: Size = Size {
    width: 400,
    height: 300,
};
/// La taille d'un groupe neuf.
pub const GROUP_SIZE: Size = Size {
    width: 400,
    height: 300,
};
/// La marge entre un groupe créé autour de cartes et ces cartes.
pub const GROUP_MARGIN: i64 = 20;
/// La valeur la plus grande, en plus ou en moins, d'une position ou d'une taille : de quoi ne jamais
/// déborder d'un entier.
pub const LIMIT: i64 = 1_000_000_000;
/// Ce que dit l'IA pour retirer la couleur.
pub const NO_COLOR: &str = "aucune";

/// Une largeur et une hauteur.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Size {
    /// La largeur.
    pub width: i64,
    /// La hauteur.
    pub height: i64,
}

/// Un changement refusé ; ce qui est faux et ce qu'il faut faire, dits en clair.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasEditError(pub String);

impl fmt::Display for CanvasEditError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CanvasEditError {}

pub(super) fn refuse<T>(message: impl Into<String>) -> Result<T, CanvasEditError> {
    Err(CanvasEditError(message.into()))
}

/// Le choix d'une couleur : une de la palette de l'application, ou aucune.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorChoice {
    /// Cette couleur de la palette.
    Palette(&'static str),
    /// Aucune couleur.
    Without,
}

impl ColorChoice {
    /// Le choix que nomme `name` : un nom de la palette, ou [`NO_COLOR`].
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] qui cite les noms permis si `name` n'en est pas un.
    pub fn parse(name: &str) -> Result<Self, CanvasEditError> {
        if name == NO_COLOR {
            return Ok(Self::Without);
        }
        match PALETTE.into_iter().find(|known| *known == name) {
            Some(known) => Ok(Self::Palette(known)),
            None => refuse(format!(
                "« {name} » n'est pas une couleur de la palette : {}, ou « {NO_COLOR} » pour \
                 retirer la couleur",
                PALETTE.join(", ")
            )),
        }
    }

    /// Ce que le fichier écrit : rien sans couleur.
    #[must_use]
    pub fn written(self) -> Option<String> {
        match self {
            Self::Palette(name) => file_color(name).map(str::to_owned),
            Self::Without => None,
        }
    }
}

/// Le sens d'une flèche, comme le menu de l'interface le propose.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArrowSense {
    /// Un trait, sans pointe.
    None,
    /// Une pointe vers la seconde carte (le défaut).
    Single,
    /// Une pointe à chaque bout.
    Both,
}

impl ArrowSense {
    const ALL: [Self; 3] = [Self::None, Self::Single, Self::Both];

    /// Le nom que donnent les outils.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Single => "single",
            Self::Both => "both",
        }
    }

    /// Les extrémités de départ et d'arrivée de ce sens.
    #[must_use]
    pub const fn ends(self) -> (ArrowEnd, ArrowEnd) {
        match self {
            Self::None => (ArrowEnd::None, ArrowEnd::None),
            Self::Single => (ArrowEnd::None, ArrowEnd::Arrow),
            Self::Both => (ArrowEnd::Arrow, ArrowEnd::Arrow),
        }
    }

    /// Le sens que nomme `name`.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] qui cite les trois noms si `name` n'en est pas un.
    pub fn parse(name: &str) -> Result<Self, CanvasEditError> {
        Self::ALL
            .into_iter()
            .find(|sense| sense.name() == name)
            .map_or_else(
                || {
                    refuse(format!(
                        "« {name} » n'est pas un sens de flèche : « none » (un trait), « single » \
                         (une pointe vers la seconde carte) ou « both » (une pointe à chaque bout)"
                    ))
                },
                Ok,
            )
    }

    /// Le sens de cette flèche ; rien pour une pointe au seul départ, que le format permet mais pas
    /// le menu.
    #[must_use]
    pub fn of(arrow: &CanvasArrow) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|sense| sense.ends() == (arrow.from_end, arrow.to_end))
    }
}

/// Une carte à ajouter : un texte, un fichier ou une page web.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewCard {
    /// Ce qu'elle montre (jamais un groupe : voir [`NewGroup`]).
    pub kind: CardKind,
    /// La position horizontale du coin haut gauche.
    pub x: i64,
    /// La position verticale du coin haut gauche.
    pub y: i64,
    /// Sa largeur ; celle d'une carte neuve de son type sans elle.
    pub width: Option<i64>,
    /// Sa hauteur ; celle d'une carte neuve de son type sans elle.
    pub height: Option<i64>,
    /// Sa couleur.
    pub color: Option<ColorChoice>,
}

/// Ce qui change dans une carte (aucun champ donné : rien à changer).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CardChange {
    /// Le nouveau texte d'une carte texte.
    pub text: Option<String>,
    /// La nouvelle adresse d'une carte de page web.
    pub url: Option<String>,
    /// Le nouveau fichier d'une carte de fichier.
    pub file: Option<String>,
    /// La nouvelle couleur.
    pub color: Option<ColorChoice>,
}

/// Une flèche à ajouter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewArrow {
    /// La carte de départ.
    pub from: String,
    /// La carte d'arrivée.
    pub to: String,
    /// Le côté de départ ; déduit des positions sans lui.
    pub from_side: Option<Side>,
    /// Le côté d'arrivée ; déduit des positions sans lui.
    pub to_side: Option<Side>,
    /// Le sens ; une pointe à l'arrivée sans lui.
    pub sense: Option<ArrowSense>,
    /// L'étiquette ; vide : aucune.
    pub label: Option<String>,
    /// La couleur.
    pub color: Option<ColorChoice>,
}

/// Ce qui change dans une flèche (aucun champ donné : rien à changer).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ArrowChange {
    /// La nouvelle carte de départ.
    pub from: Option<String>,
    /// Le nouveau côté de départ.
    pub from_side: Option<Side>,
    /// La nouvelle carte d'arrivée.
    pub to: Option<String>,
    /// Le nouveau côté d'arrivée.
    pub to_side: Option<Side>,
    /// Le nouveau sens.
    pub sense: Option<ArrowSense>,
    /// La nouvelle étiquette ; vide : la retire.
    pub label: Option<String>,
    /// La nouvelle couleur.
    pub color: Option<ColorChoice>,
}

/// Où poser un groupe neuf.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GroupPlace {
    /// Autour de ces cartes, avec la marge de [`GROUP_MARGIN`].
    Around(Vec<String>),
    /// Vide, à cet endroit ; [`GROUP_SIZE`] pour la taille qui manque.
    At {
        /// La position horizontale du coin haut gauche.
        x: i64,
        /// La position verticale du coin haut gauche.
        y: i64,
        /// Sa largeur.
        width: Option<i64>,
        /// Sa hauteur.
        height: Option<i64>,
    },
}

/// Un groupe à ajouter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewGroup {
    /// Où le poser.
    pub place: GroupPlace,
    /// Son nom ; vide : aucun.
    pub label: Option<String>,
    /// Sa couleur.
    pub color: Option<ColorChoice>,
}

pub(super) fn counter() -> u64 {
    static DRAWN: AtomicU64 = AtomicU64::new(0);
    DRAWN.fetch_add(1, Ordering::Relaxed)
}

/// Un nombre que personne ne peut deviner, tiré des clés de hachage choisies au hasard par le
/// système.
pub(super) fn random() -> u64 {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u64(counter());
    hasher.finish()
}

fn in_limits(what: &str, value: i64, lowest: i64) -> Result<i64, CanvasEditError> {
    if (lowest..=LIMIT).contains(&value) {
        Ok(value)
    } else {
        refuse(format!(
            "{what} vaut {value} : elle doit être un entier entre {lowest} et {LIMIT}"
        ))
    }
}

pub(super) fn position(x: i64, y: i64) -> Result<(), CanvasEditError> {
    in_limits("la position x", x, -LIMIT)?;
    in_limits("la position y", y, -LIMIT)?;
    Ok(())
}

pub(super) fn size_of(
    width: Option<i64>,
    height: Option<i64>,
    default: Size,
) -> Result<Size, CanvasEditError> {
    Ok(Size {
        width: in_limits("la largeur", width.unwrap_or(default.width), 1)?,
        height: in_limits("la hauteur", height.unwrap_or(default.height), 1)?,
    })
}

pub(super) fn address(url: &str) -> Result<String, CanvasEditError> {
    let url = url.trim();
    WebAddress::in_link(url).map_or_else(
        || {
            refuse(format!(
                "« {url} » n'est pas une adresse web : elle commence par http://, https:// ou \
                 mailto: et ne contient ni espace ni retour à la ligne"
            ))
        },
        |address| Ok(address.as_str().to_owned()),
    )
}

pub(super) fn file_path(file: &str) -> Result<String, CanvasEditError> {
    let file = file.trim();
    if file.is_empty() {
        return refuse("le chemin du fichier est vide : donnez un fichier de l'espace de travail");
    }
    Ok(file.to_owned())
}

/// Les premiers identifiants d'une liste, pour dire ce qui existe sans tout citer.
pub(super) fn listed(ids: impl Iterator<Item = String>) -> String {
    const SHOWN: usize = 10;
    let all: Vec<String> = ids.collect();
    let shown: Vec<&str> = all.iter().take(SHOWN).map(String::as_str).collect();
    let more = if all.len() > SHOWN {
        format!(", … ({} au total)", all.len())
    } else {
        String::new()
    };
    format!("{}{more}", shown.join(", "))
}

#[cfg(test)]
mod tests {
    use super::counter;

    #[test]
    fn the_counter_never_gives_the_same_number_twice() {
        let first = counter();
        let second = counter();
        let third = counter();
        assert!(first < second && second < third);
    }
}
