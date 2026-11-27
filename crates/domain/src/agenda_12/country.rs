//! Le pays d'un événement : un code ISO 3166-1 sur deux lettres, d'où l'on tire le nom en français et
//! le drapeau (format `doc/format/agenda-12.md` § 6.1).

use super::country_names::COUNTRIES;
use crate::crm::folded;

/// Un pays de la norme ISO 3166-1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Country {
    code: &'static str,
    name: &'static str,
}

/// Le point de code du drapeau pour la lettre `A` : les lettres A à Z deviennent les « lettres
/// indicateurs régionaux », que les polices dessinent en drapeau quand elles se suivent deux à deux.
const REGIONAL_INDICATOR_A: u32 = 0x1F1E6;

impl Country {
    /// Le pays dont le code, sans compter les majuscules ni les espaces autour, est `code` ; rien
    /// si la norme ne connaît pas ce code.
    #[must_use]
    pub fn from_code(code: &str) -> Option<Self> {
        let wanted = code.trim().to_ascii_uppercase();
        COUNTRIES
            .iter()
            .find(|(known, _)| *known == wanted)
            .map(|&(code, name)| Self { code, name })
    }

    /// Tous les pays, rangés par nom, sans compter les majuscules ni les accents : la liste où
    /// l'on choisit.
    #[must_use]
    pub fn all() -> Vec<Self> {
        let mut all: Vec<Self> = COUNTRIES
            .iter()
            .map(|&(code, name)| Self { code, name })
            .collect();
        all.sort_by_key(|country| (folded(country.name), country.code));
        all
    }

    /// Son code sur deux lettres, en majuscules (`DE`).
    #[must_use]
    pub fn code(self) -> &'static str {
        self.code
    }

    /// Son nom en français (`Allemagne`).
    #[must_use]
    pub fn name(self) -> &'static str {
        self.name
    }

    /// Son drapeau : les deux lettres de son code en indicateurs régionaux (`🇩🇪`).
    #[must_use]
    pub fn flag(self) -> String {
        self.code
            .bytes()
            .filter_map(|letter| char::from_u32(REGIONAL_INDICATOR_A + u32::from(letter - b'A')))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_country_is_found_by_its_code_whatever_the_case_and_the_spaces() {
        for written in ["DE", "de", " De ", "dE"] {
            let country = Country::from_code(written).unwrap();
            assert_eq!(country.code(), "DE");
            assert_eq!(country.name(), "Allemagne");
        }
    }

    #[test]
    fn a_code_the_standard_does_not_know_is_not_a_country() {
        for written in ["", "D", "DEU", "XX", "1A", "Allemagne"] {
            assert_eq!(Country::from_code(written), None, "{written}");
        }
    }

    #[test]
    fn the_flag_is_made_of_the_two_letters_of_the_code() {
        assert_eq!(Country::from_code("DE").unwrap().flag(), "🇩🇪");
        assert_eq!(Country::from_code("FR").unwrap().flag(), "🇫🇷");
        assert_eq!(Country::from_code("US").unwrap().flag(), "🇺🇸");
        assert_eq!(Country::from_code("AD").unwrap().flag(), "🇦🇩");
        assert_eq!(Country::from_code("ZW").unwrap().flag(), "🇿🇼");
    }

    #[test]
    fn the_standard_has_249_countries_with_a_name_and_a_distinct_code() {
        let all = Country::all();
        assert_eq!(all.len(), 249);
        let mut codes: Vec<&str> = all.iter().map(|country| country.code()).collect();
        codes.sort_unstable();
        codes.dedup();
        assert_eq!(codes.len(), 249);
        assert!(all.iter().all(|country| !country.name().is_empty()));
        assert!(all.iter().all(|country| country.code().len() == 2));
    }

    #[test]
    fn the_countries_are_listed_by_name_without_counting_accents() {
        let names: Vec<&str> = Country::all().iter().map(|c| c.name()).collect();
        let at = |name: &str| names.iter().position(|n| *n == name).unwrap();
        assert!(at("Afghanistan") < at("Allemagne"));
        assert!(at("Allemagne") < at("Émirats arabes unis"));
        assert!(at("Égypte") < at("Espagne"));
        assert!(at("Espagne") < at("États-Unis"));
        assert_eq!(names[0], "Afghanistan");
    }

    #[test]
    fn some_countries_have_their_french_name() {
        for (code, name) in [
            ("FR", "France"),
            ("GB", "Royaume-Uni"),
            ("US", "États-Unis"),
            ("CH", "Suisse"),
            ("NO", "Norvège"),
        ] {
            assert_eq!(Country::from_code(code).unwrap().name(), name);
        }
    }
}
