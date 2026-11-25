//! La palette du CRM : celle de l'application (une seule définition, `doc/specs/crm.md` § 3),
//! reprise de la carte mentale ; le CRM n'y ajoute que les règles qui choisissent une couleur.

use crate::mind_map::PALETTE;

/// Combien de couleurs a la palette.
const COLORS: usize = PALETTE.len();

/// L'une des 10 couleurs de la palette, désignée par son nom (`rouge`, `bleu`…).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Color(usize);

impl Color {
    /// La première couleur de la palette, celle d'un projet dont la couleur n'est pas écrite.
    pub const FIRST: Self = Self(0);

    /// La couleur de ce nom, espaces et majuscules ignorés ; rien si ce n'est pas un nom de la
    /// palette.
    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        let wanted = name.trim().to_lowercase();
        PALETTE.iter().position(|known| *known == wanted).map(Self)
    }

    /// Les dix couleurs, dans l'ordre des menus.
    #[must_use]
    pub fn all() -> [Self; COLORS] {
        std::array::from_fn(Self)
    }

    /// Le nom de la couleur, tel qu'il s'écrit dans le fichier et à l'écran.
    #[must_use]
    pub fn name(self) -> &'static str {
        PALETTE[self.0]
    }

    /// La couleur d'une étiquette, choisie d'après son nom et la même partout : la somme des codes
    /// Unicode de son nom en minuscules, modulo 10, donne le rang dans la palette (0 = rouge).
    #[must_use]
    pub fn of_tag(tag: &str) -> Self {
        let sum: usize = tag
            .chars()
            .flat_map(char::to_lowercase)
            .map(|c| c as usize)
            .sum();
        Self(sum % COLORS)
    }

    /// La couleur la moins utilisée parmi `used` (une couleur par projet du CRM) : la première de la
    /// palette en cas d'égalité.
    #[must_use]
    pub fn least_used(used: impl IntoIterator<Item = Self>) -> Self {
        let mut counts = [0_usize; COLORS];
        for color in used {
            counts[color.0] += 1;
        }
        Self::all()
            .into_iter()
            .min_by_key(|color| counts[color.0])
            .unwrap_or(Self::FIRST)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(name: &str) -> Color {
        Color::parse(name).unwrap()
    }

    #[test]
    fn the_palette_is_the_one_of_the_application_in_the_order_of_the_menus() {
        let names: Vec<_> = Color::all().iter().map(|c| c.name()).collect();
        assert_eq!(
            names,
            [
                "rouge",
                "orange",
                "jaune",
                "vert",
                "turquoise",
                "bleu",
                "violet",
                "rose",
                "marron",
                "ardoise"
            ]
        );
        assert_eq!(Color::FIRST.name(), "rouge");
        assert_eq!(color("ardoise").name(), "ardoise");
    }

    #[test]
    fn a_color_is_found_by_its_name_whatever_its_case_and_spaces() {
        assert_eq!(color(" Bleu ").name(), "bleu");
        assert_eq!(color("VIOLET").name(), "violet");
        assert_eq!(Color::parse("fuchsia"), None);
        assert_eq!(Color::parse(""), None);
        assert_eq!(Color::parse("#2563eb"), None);
    }

    #[test]
    fn a_tag_has_the_color_of_its_name_the_same_everywhere() {
        // « a » = 97, modulo 10 = 7 : rose.
        assert_eq!(Color::of_tag("a").name(), "rose");
        // « urgent » : 117 + 114 + 103 + 101 + 110 + 116 = 661, modulo 10 = 1 : orange.
        assert_eq!(Color::of_tag("urgent").name(), "orange");
        assert_eq!(Color::of_tag("Urgent"), Color::of_tag("urgent"));
        assert_eq!(Color::of_tag("URGENT"), Color::of_tag("urgent"));
        // « é » = 233, modulo 10 = 3 : vert ; majuscule « É » = 201 sans passage en minuscules.
        assert_eq!(Color::of_tag("é").name(), "vert");
        assert_eq!(Color::of_tag("É"), Color::of_tag("é"));
        // « salon » : 115 + 97 + 108 + 111 + 110 = 541, modulo 10 = 1 : orange.
        assert_eq!(Color::of_tag("salon").name(), "orange");
        // Le rang 0 est le rouge : « d » = 100.
        assert_eq!(Color::of_tag("d").name(), "rouge");
        assert_eq!(Color::of_tag("").name(), "rouge");
    }

    #[test]
    fn a_new_project_takes_the_least_used_color_and_the_first_one_on_a_tie() {
        assert_eq!(Color::least_used([]), Color::FIRST);
        assert_eq!(Color::least_used([color("rouge")]).name(), "orange");
        assert_eq!(
            Color::least_used([color("rouge"), color("orange"), color("rouge")]).name(),
            "jaune"
        );
        let all_but_marron: Vec<_> = Color::all()
            .into_iter()
            .filter(|c| c.name() != "marron")
            .collect();
        assert_eq!(Color::least_used(all_but_marron).name(), "marron");
        assert_eq!(Color::least_used(Color::all()), Color::FIRST);
        let twice = Color::all().into_iter().chain([color("vert")]);
        assert_eq!(Color::least_used(twice).name(), "rouge");
    }
}
