//! Journal : la note du jour, son nom de fichier daté et son texte.

use crate::template::note_from_template;
use crate::title::retitled;
use crate::{FileName, Moment, Title};

/// Le nom de fichier de la note du jour `at` : sa date, `2026-11-18.md`, pour ranger le journal par date.
#[must_use]
pub fn daily_note_name(at: &Moment) -> FileName {
    FileName::parse(&format!("{}.md", at.iso_date()))
        .unwrap_or_else(|_| unreachable!("une date est un nom de fichier valable"))
}

/// Le texte de la note du jour `at` : pour titre la date en toutes lettres, comme l'insertion
/// de la date du jour. Depuis `template`, le titre du modèle est remplacé par ce titre, puis les
/// variables comme pour tout modèle ; sans modèle, la note n'a que son titre.
#[must_use]
pub fn daily_note(template: Option<&str>, at: &Moment) -> String {
    let title = at.long_date();
    match template {
        Some(template) => note_from_template(&retitled(template, &title), at),
        None => format!("# {title}\n"),
    }
}

/// Vrai si la note nommée `current` est une note du jour dont le titre est encore sa date :
/// son nom de fichier garde alors la date au lieu de suivre le titre.
pub(crate) fn keeps_date_name(current: &FileName, content: &str) -> bool {
    Moment::of_iso_date(current.stem()).is_some_and(|day| {
        Title::of(content).is_some_and(|title| title.as_str() == day.long_date())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment(month: u32, day: u32) -> Moment {
        Moment::new(2026, month, day, 18, 30).unwrap()
    }

    fn name(text: &str) -> FileName {
        FileName::parse(text).unwrap()
    }

    #[test]
    fn the_daily_note_is_named_after_its_iso_date() {
        assert_eq!(daily_note_name(&moment(11, 18)).as_str(), "2026-11-18.md");
        assert_eq!(daily_note_name(&moment(3, 1)).as_str(), "2026-03-01.md");
    }

    #[test]
    fn without_template_the_daily_note_holds_only_its_title() {
        assert_eq!(daily_note(None, &moment(11, 18)), "# 18 novembre 2026\n");
        assert_eq!(daily_note(None, &moment(3, 1)), "# 1er mars 2026\n");
    }

    #[test]
    fn from_a_template_the_title_becomes_the_date_and_variables_are_replaced() {
        let template = "---\ntags: [journal]\npinned: true\n---\n# Journal\n« {{title}} » à {{time}}, le {{date}}\n";
        assert_eq!(
            daily_note(Some(template), &moment(11, 18)),
            "---\ntags: [journal]\n---\n# 18 novembre 2026\n« 18 novembre 2026 » à 18:30, le 18 novembre 2026\n"
        );
    }

    #[test]
    fn a_template_without_title_gets_the_date_as_title() {
        assert_eq!(
            daily_note(Some("## Humeur\n"), &moment(11, 18)),
            "# 18 novembre 2026\n## Humeur\n"
        );
    }

    #[test]
    fn a_daily_note_keeps_its_date_name_while_its_title_is_its_date() {
        let current = name("2026-11-18.md");
        assert!(keeps_date_name(&current, "# 18 novembre 2026\ntexte"));
        assert!(keeps_date_name(&name("2026-03-01.md"), "# 1er mars 2026"));
        assert!(!keeps_date_name(&current, "# Voyage à Lyon"));
        assert!(!keeps_date_name(&current, "# 19 novembre 2026"));
        assert!(!keeps_date_name(&current, "pas de titre"));
        assert!(!keeps_date_name(&name("courses.md"), "# 18 novembre 2026"));
    }

    #[test]
    fn a_date_name_has_exactly_four_two_and_two_digits() {
        assert!(!keeps_date_name(
            &name("2026-011-18.md"),
            "# 18 novembre 2026"
        ));
        assert!(!keeps_date_name(
            &name("2026-11-+1.md"),
            "# 1er novembre 2026"
        ));
        assert!(!keeps_date_name(
            &name("+2026-11-18.md"),
            "# 18 novembre 2026"
        ));
    }

    #[test]
    fn only_a_real_iso_date_counts_as_a_date_name() {
        for stem in [
            "2026-13-01",
            "2026-11-32",
            "2026-1-18",
            "26-11-18",
            "2026-11-18-2",
            "2026_11_18",
            "2026-11-1a",
            "abcd-11-18",
            "2026-00-18",
        ] {
            let file = name(&format!("{stem}.md"));
            assert!(
                !keeps_date_name(&file, "# 18 novembre 2026"),
                "{stem} n'est pas une date"
            );
        }
    }
}
