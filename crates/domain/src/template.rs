//! Modèles de note : la note qu'un modèle donne, ses variables remplacées.

use crate::Moment;
use crate::front_matter::unpinned;
use crate::title::{displayed_title, retitled};

/// Le texte d'une note créée depuis `template` au moment `at`.
///
/// L'en-tête est gardé, sauf l'épinglage. `{{title}}` prend le titre du modèle, puis
/// `{{date}}` la date en toutes lettres et `{{time}}` l'heure `HH:MM` ; une autre variable
/// reste telle quelle.
#[must_use]
pub fn note_from_template(template: &str, at: &Moment) -> String {
    filled(template, &displayed_title(template), at)
}

/// Le texte d'une note titrée `title`, créée depuis `template` au moment `at` : comme
/// [`note_from_template`], mais `{{title}}` prend `title`, et le titre `#` de la note est `title`
/// (celui du modèle remplacé, ou ajouté s'il n'en a pas).
#[must_use]
pub fn titled_note_from_template(template: &str, at: &Moment, title: &str) -> String {
    retitled(&filled(template, title, at), title)
}

/// Le modèle sans épinglage, ses variables remplacées.
fn filled(template: &str, title: &str, at: &Moment) -> String {
    unpinned(template)
        .replace("{{title}}", title)
        .replace("{{date}}", &at.long_date())
        .replace("{{time}}", &at.time())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment(month: u32, day: u32, hour: u32, minute: u32) -> Moment {
        Moment::new(2026, month, day, hour, minute).unwrap()
    }

    #[test]
    fn date_is_written_in_full_like_the_inserted_date() {
        assert_eq!(
            note_from_template("{{date}}", &moment(11, 18, 9, 5)),
            "18 novembre 2026"
        );
        assert_eq!(
            note_from_template("{{date}}", &moment(3, 1, 9, 5)),
            "1er mars 2026"
        );
        assert_eq!(
            note_from_template("{{date}}", &moment(1, 2, 9, 5)),
            "2 janvier 2026"
        );
        assert_eq!(
            note_from_template("{{date}}", &moment(12, 31, 9, 5)),
            "31 décembre 2026"
        );
    }

    #[test]
    fn every_month_has_its_french_name() {
        let months: Vec<String> = (1..=12)
            .map(|month| note_from_template("{{date}}", &moment(month, 2, 0, 0)))
            .collect();
        assert_eq!(
            months,
            [
                "2 janvier 2026",
                "2 février 2026",
                "2 mars 2026",
                "2 avril 2026",
                "2 mai 2026",
                "2 juin 2026",
                "2 juillet 2026",
                "2 août 2026",
                "2 septembre 2026",
                "2 octobre 2026",
                "2 novembre 2026",
                "2 décembre 2026",
            ]
        );
    }

    #[test]
    fn time_is_hours_and_minutes() {
        assert_eq!(note_from_template("{{time}}", &moment(1, 1, 9, 5)), "09:05");
        assert_eq!(
            note_from_template("{{time}}", &moment(1, 1, 18, 30)),
            "18:30"
        );
    }

    #[test]
    fn title_is_the_template_title_with_its_own_variables_replaced() {
        let note = note_from_template(
            "# Réunion du {{date}}\nNotes de « {{title}} » à {{time}}, {{time}}",
            &moment(11, 18, 18, 30),
        );
        assert_eq!(
            note,
            "# Réunion du 18 novembre 2026\nNotes de « Réunion du 18 novembre 2026 » à 18:30, 18:30"
        );
    }

    #[test]
    fn a_template_without_title_gives_untitled() {
        assert_eq!(
            note_from_template("{{title}}", &moment(1, 1, 0, 0)),
            "Sans titre"
        );
    }

    #[test]
    fn header_is_kept_except_pinning() {
        let note = note_from_template(
            "---\ntags: [réunion]\npinned: true\n---\n# Réunion\n",
            &moment(1, 1, 0, 0),
        );
        assert_eq!(note, "---\ntags: [réunion]\n---\n# Réunion\n");
    }

    #[test]
    fn unknown_variables_stay_as_written() {
        assert_eq!(
            note_from_template("{{auteur}} {date}", &moment(1, 1, 0, 0)),
            "{{auteur}} {date}"
        );
    }

    #[test]
    fn a_titled_note_takes_the_title_given_in_its_variable_and_its_heading() {
        let at = moment(11, 18, 9, 5);
        assert_eq!(
            titled_note_from_template(
                "---\npinned: true\n---\n# {{title}}\n{{date}}",
                &at,
                "Bilan"
            ),
            "# Bilan\n18 novembre 2026"
        );
        assert_eq!(
            titled_note_from_template(
                "# Réunion du {{date}}\n## Ordre du jour",
                &at,
                "Point équipe"
            ),
            "# Point équipe\n## Ordre du jour"
        );
        assert_eq!(
            titled_note_from_template("- [ ] à faire à {{time}}", &at, "Liste"),
            "# Liste\n- [ ] à faire à 09:05"
        );
    }
}
