//! Historique des versions d'une note : le nom d'une version, quand en garder une, et
//! lesquelles conserver avec le temps.

use std::fmt;

use crate::Moment;

/// Toutes les versions des dernières 24 heures sont conservées.
pub const KEEP_ALL_MINUTES: i64 = 24 * 60;

/// Au-delà de 24 heures et jusqu'à ce nombre de jours, une version par jour est conservée ;
/// plus loin, une par semaine.
pub const ONE_PER_DAY_DAYS: i64 = 30;

/// Une version d'une note : une copie de son texte, désignée par le moment où elle a été
/// gardée et, si plusieurs l'ont été dans la même minute, par son rang dans cette minute.
/// Les versions se rangent de la plus ancienne à la plus récente.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Version {
    at: Moment,
    rank: u32,
}

/// Identifiant reçu qui ne désigne aucune version.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidVersion(pub String);

impl fmt::Display for InvalidVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "version invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidVersion {}

impl Version {
    /// La première version gardée au moment `at`.
    #[must_use]
    pub fn at(at: Moment) -> Self {
        Self { at, rank: 1 }
    }

    /// Le moment où la version a été gardée.
    #[must_use]
    pub fn moment(&self) -> Moment {
        self.at
    }

    /// Son identifiant, qui est aussi le nom de son fichier sans `.md` : `2026-11-18 14h30`,
    /// et `2026-11-18 14h30 (2)` pour la deuxième de la même minute.
    #[must_use]
    pub fn id(&self) -> String {
        if self.rank == 1 {
            self.at.label()
        } else {
            format!("{} ({})", self.at.label(), self.rank)
        }
    }

    /// La version que désigne cet identifiant.
    ///
    /// # Errors
    ///
    /// [`InvalidVersion`] si ce n'est pas un identifiant de version.
    pub fn parse(id: &str) -> Result<Self, InvalidVersion> {
        let invalid = || InvalidVersion(id.to_owned());
        let (moment, rank) = match id.strip_suffix(')').and_then(|t| t.rsplit_once(" (")) {
            Some((moment, digits)) => {
                // Écrit comme on l'écrit : des chiffres seulement, sans zéro devant.
                let written =
                    digits.bytes().all(|b| b.is_ascii_digit()) && !digits.starts_with('0');
                let rank = digits
                    .parse::<u32>()
                    .ok()
                    .filter(|rank| written && *rank >= 2)
                    .ok_or_else(invalid)?;
                (moment, rank)
            }
            None => (id, 1),
        };
        let at = Moment::of_label(moment).ok_or_else(invalid)?;
        Ok(Self { at, rank })
    }

    /// Ce que l'historique en montre : `18 novembre 2026 à 14:30`, suivi du rang s'il y en a
    /// plusieurs dans la même minute.
    #[must_use]
    pub fn label(&self) -> String {
        let label = format!("{} à {}", self.at.long_date(), self.at.time());
        if self.rank == 1 {
            label
        } else {
            format!("{label} ({})", self.rank)
        }
    }
}

/// La version à garder au moment `at` pour le texte `content`, parmi les versions `existing`
/// de la note, dont la plus récente a le texte `latest` : aucune si ce texte est déjà celui de
/// la plus récente.
#[must_use]
pub fn next_version(
    existing: &[Version],
    latest: Option<&str>,
    content: &str,
    at: Moment,
) -> Option<Version> {
    if latest == Some(content) {
        return None;
    }
    let rank = existing
        .iter()
        .filter(|version| version.at == at)
        .map(|version| version.rank + 1)
        .max()
        .unwrap_or(1);
    Some(Version { at, rank })
}

/// Les versions conservées à `now` : toutes celles des dernières 24 heures ; puis, jusqu'à
/// 30 jours, la plus récente de chaque jour ; plus loin, la plus récente de chaque semaine.
/// Rangées de la plus récente à la plus ancienne.
#[must_use]
pub fn retained(versions: &[Version], now: Moment) -> Vec<Version> {
    let mut newest_first = versions.to_vec();
    newest_first.sort_unstable_by(|a, b| b.cmp(a));
    newest_first.dedup();
    let mut seen = std::collections::HashSet::new();
    newest_first
        .into_iter()
        .filter(|version| match period(version.at, now) {
            Period::Recent => true,
            period => seen.insert(period),
        })
        .collect()
}

/// La période dont une version garde une seule copie, d'après son âge.
#[derive(Debug, PartialEq, Eq, Hash)]
enum Period {
    /// Les dernières 24 heures : tout est gardé.
    Recent,
    /// Un jour, compté depuis le 1er janvier 1970.
    Day(i64),
    /// Une semaine, comptée depuis celle du 1er janvier 1970.
    Week(i64),
}

fn period(at: Moment, now: Moment) -> Period {
    let age = now.minutes_since_epoch() - at.minutes_since_epoch();
    if age < KEEP_ALL_MINUTES {
        Period::Recent
    } else if age < ONE_PER_DAY_DAYS * KEEP_ALL_MINUTES {
        Period::Day(at.days_since_epoch())
    } else {
        Period::Week(at.weeks_since_epoch())
    }
}

/// Le texte que l'application connaissait d'une note, à garder en version juste avant un
/// changement venu de l'extérieur : `known`, s'il diffère de ce qui est sur le disque (`None` si
/// la note a disparu) ; rien si l'application ne la connaissait pas, ou si le changement est le
/// sien.
#[must_use]
pub fn before_outside_change<'a>(known: Option<&'a str>, on_disk: Option<&str>) -> Option<&'a str> {
    known.filter(|known| Some(*known) != on_disk)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment(day: u32, hour: u32, minute: u32) -> Moment {
        Moment::new(2026, 11, day, hour, minute).unwrap()
    }

    fn version(id: &str) -> Version {
        Version::parse(id).unwrap()
    }

    fn days(year: i32, month: u32, day: u32) -> i64 {
        Moment::new(year, month, day, 0, 0)
            .unwrap()
            .days_since_epoch()
    }

    fn week(year: i32, month: u32, day: u32) -> i64 {
        Moment::new(year, month, day, 0, 0)
            .unwrap()
            .weeks_since_epoch()
    }

    #[test]
    fn moments_are_counted_in_days_since_1970() {
        assert_eq!(days(1970, 1, 1), 0);
        assert_eq!(days(1969, 12, 31), -1);
        assert_eq!(days(2000, 3, 1), 11_017);
        assert_eq!(days(2024, 2, 29), 19_782);
        assert_eq!(days(2026, 11, 18), 20_775);
    }

    #[test]
    fn moments_are_counted_in_weeks_from_monday_since_1970() {
        assert_eq!(week(1969, 12, 29), 0);
        assert_eq!(week(1970, 1, 4), 0);
        assert_eq!(week(1970, 1, 5), 1);
        assert_eq!(week(1969, 12, 28), -1);
        assert_eq!(week(2026, 11, 18), 2968);
    }

    #[test]
    fn moments_are_counted_in_minutes_since_1970() {
        let moment = Moment::new(1970, 1, 2, 3, 4).unwrap();
        assert_eq!(moment.minutes_since_epoch(), 1440 + 3 * 60 + 4);
    }

    #[test]
    fn a_version_is_named_after_its_moment() {
        let first = Version::at(moment(18, 14, 30));
        assert_eq!(first.id(), "2026-11-18 14h30");
        assert_eq!(first.label(), "18 novembre 2026 à 14:30");
        assert_eq!(first.moment(), moment(18, 14, 30));
    }

    #[test]
    fn a_second_version_in_the_same_minute_carries_its_rank() {
        let second = version("2026-11-18 14h30 (2)");
        assert_eq!(second.id(), "2026-11-18 14h30 (2)");
        assert_eq!(second.label(), "18 novembre 2026 à 14:30 (2)");
        assert!(second > version("2026-11-18 14h30"));
        assert!(second < version("2026-11-18 14h31"));
    }

    #[test]
    fn a_version_id_is_read_back() {
        assert_eq!(version("2026-11-18 09h05"), Version::at(moment(18, 9, 5)));
        assert_eq!(
            version("2026-11-18 09h05 (12)").id(),
            "2026-11-18 09h05 (12)"
        );
    }

    #[test]
    fn what_is_not_a_version_id_is_refused() {
        for id in [
            "",
            "2026-11-18",
            "2026-11-18 9h05",
            "2026-11-18 09h5",
            "2026-11-18 24h00",
            "2026-11-18 09-05",
            "2026-11-18 09h05 (1)",
            "2026-11-18 09h05 (02)",
            "2026-11-18 09h05 (x)",
            "2026-11-18 09h05 (+2)",
            "2026-11-18 09h05 ()",
            "2026-11-18 09h05 (2",
            "../2026-11-18 09h05",
        ] {
            assert_eq!(
                Version::parse(id),
                Err(InvalidVersion(id.to_owned())),
                "{id}"
            );
        }
        assert_eq!(
            InvalidVersion("x".into()).to_string(),
            "version invalide : « x »"
        );
    }

    #[test]
    fn the_first_version_of_a_note_is_kept() {
        let at = moment(18, 14, 30);
        assert_eq!(next_version(&[], None, "# A", at), Some(Version::at(at)));
    }

    #[test]
    fn a_text_identical_to_the_latest_version_is_not_kept_again() {
        let existing = [version("2026-11-18 14h00")];
        assert_eq!(
            next_version(&existing, Some("# A"), "# A", moment(18, 14, 30)),
            None
        );
    }

    #[test]
    fn a_changed_text_is_kept_at_the_moment() {
        let existing = [version("2026-11-18 14h00")];
        assert_eq!(
            next_version(&existing, Some("# A"), "# A\nsuite", moment(18, 14, 30)),
            Some(version("2026-11-18 14h30"))
        );
    }

    #[test]
    fn a_version_kept_in_the_same_minute_takes_the_next_rank() {
        let existing = [
            version("2026-11-18 14h29"),
            version("2026-11-18 14h30"),
            version("2026-11-18 14h30 (2)"),
        ];
        assert_eq!(
            next_version(&existing, Some("# A"), "# B", moment(18, 14, 30)),
            Some(version("2026-11-18 14h30 (3)"))
        );
    }

    #[test]
    fn every_version_of_the_last_24_hours_is_retained() {
        let versions = [
            version("2026-11-17 14h31"),
            version("2026-11-18 14h29"),
            version("2026-11-18 14h29 (2)"),
        ];
        assert_eq!(
            retained(&versions, moment(18, 14, 30)),
            [
                version("2026-11-18 14h29 (2)"),
                version("2026-11-18 14h29"),
                version("2026-11-17 14h31"),
            ]
        );
    }

    #[test]
    fn beyond_24_hours_the_newest_version_of_each_day_is_retained() {
        let versions = [
            version("2026-11-17 14h30"),
            version("2026-11-17 09h00"),
            version("2026-11-16 09h00"),
            version("2026-11-16 18h00"),
            version("2026-11-15 08h00"),
        ];
        assert_eq!(
            retained(&versions, moment(18, 14, 30)),
            [
                version("2026-11-17 14h30"),
                version("2026-11-16 18h00"),
                version("2026-11-15 08h00"),
            ]
        );
    }

    #[test]
    fn beyond_30_days_the_newest_version_of_each_week_is_retained() {
        // Le 18/12 à 14h30 : le 18/11 à 14h30 a 30 jours pile ; les 16 et 17/11 sont de la
        // même semaine (lundi 16), le 15/11 (dimanche) de la précédente.
        let now = Moment::new(2026, 12, 18, 14, 30).unwrap();
        let versions = [
            version("2026-11-18 14h31"),
            version("2026-11-18 14h30"),
            version("2026-11-17 10h00"),
            version("2026-11-16 10h00"),
            version("2026-11-15 10h00"),
        ];
        assert_eq!(
            retained(&versions, now),
            [
                version("2026-11-18 14h31"),
                version("2026-11-18 14h30"),
                version("2026-11-15 10h00"),
            ]
        );
    }

    #[test]
    fn a_version_listed_twice_is_retained_once() {
        let versions = [version("2026-11-18 14h00"), version("2026-11-18 14h00")];
        assert_eq!(
            retained(&versions, moment(18, 14, 30)),
            [version("2026-11-18 14h00")]
        );
    }

    #[test]
    fn the_known_text_is_kept_before_a_change_from_outside() {
        assert_eq!(before_outside_change(Some("# A"), Some("# B")), Some("# A"));
        assert_eq!(before_outside_change(Some("# A"), None), Some("# A"));
    }

    #[test]
    fn nothing_is_kept_when_the_disk_has_the_known_text_or_the_note_was_unknown() {
        assert_eq!(before_outside_change(Some("# A"), Some("# A")), None);
        assert_eq!(before_outside_change(None, Some("# B")), None);
    }
}
