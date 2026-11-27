//! La ligne d'un événement (spécification `doc/specs/agenda-12.md` § 5.3) :
//! `date – drapeau (ville) – titre`, chaque partie absente disparaissant avec son séparateur.

use super::country::Country;
use super::date::EventDate;
use super::event::Agenda12Event;

/// Ce qui sépare les parties d'une ligne.
const SEPARATOR: &str = " – ";
/// Le tiret qui joint les jours d'un intervalle dans un même mois (`10–13/02`).
const SPAN_DASH: char = '–';
/// La flèche qui joint les deux dates d'un intervalle sur deux mois (`30/01 → 02/02`).
const SPAN_ARROW: &str = " → ";

/// La couleur de la pastille de l'année : d'après l'année du jour du Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum YearTone {
    /// L'année en cours (vert).
    Current,
    /// L'année suivante (orange).
    Next,
    /// Une année plus lointaine (marron).
    Later,
    /// Une année passée (neutre).
    Past,
}

impl YearTone {
    /// Le ton de la pastille de l'année `year`, l'année du jour étant `today`.
    #[must_use]
    pub fn of(year: i32, today: i32) -> Self {
        match year.cmp(&today) {
            std::cmp::Ordering::Less => Self::Past,
            std::cmp::Ordering::Equal => Self::Current,
            std::cmp::Ordering::Greater if year == today + 1 => Self::Next,
            std::cmp::Ordering::Greater => Self::Later,
        }
    }

    /// Son nom, tel que l'interface le reçoit.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::Next => "next",
            Self::Later => "later",
            Self::Past => "past",
        }
    }
}

/// Une ligne d'événement, en parties : l'écran les met en forme.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Agenda12Line {
    /// Le jour et le mois (`12/02`), ou l'intervalle (`10–13/02`, `30/01 → 02/02`) ; rien sans jour.
    pub date: Option<String>,
    /// L'année, montrée en pastille.
    pub year: Option<i32>,
    /// Le ton de la pastille de l'année ; rien sans année.
    pub tone: Option<YearTone>,
    /// Le pays, montré par son drapeau.
    pub country: Option<Country>,
    /// La ville, montrée entre parenthèses.
    pub city: Option<String>,
    /// Le titre.
    pub title: String,
}

impl Agenda12Line {
    /// La ligne de cet événement, l'année du jour étant `today_year`.
    #[must_use]
    pub fn of(event: &Agenda12Event, today_year: i32) -> Self {
        Self {
            date: day_text(&event.date),
            year: event.date.year(),
            tone: event.date.year().map(|year| YearTone::of(year, today_year)),
            country: event.country,
            city: event.city.clone(),
            title: event.title.clone(),
        }
    }

    /// La ligne écrite en texte : `10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`.
    #[must_use]
    pub fn text(&self) -> String {
        let when = [self.date.clone(), self.year.map(|year| format!("[{year}]"))]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" ");
        let place = [
            self.country.map(Country::flag),
            self.city.as_ref().map(|city| format!("({city})")),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
        [when, place, self.title.clone()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(SEPARATOR)
    }
}

/// Le jour et le mois, ou l'intervalle ; rien sans jour.
fn day_text(date: &EventDate) -> Option<String> {
    let (day, month) = (date.day()?, date.month().number());
    Some(match date.end() {
        None => format!("{day:02}/{month:02}"),
        Some(end) if end.month == date.month() => {
            format!("{day:02}{SPAN_DASH}{:02}/{month:02}", end.day)
        }
        Some(end) => format!(
            "{day:02}/{month:02}{SPAN_ARROW}{:02}/{:02}",
            end.day,
            end.month.number()
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(header: &str, title: &str, today: i32) -> Agenda12Line {
        let content = format!("---\ntype: agenda-12-evenement\n{header}---\n# {title}\n");
        Agenda12Line::of(&Agenda12Event::parse(&content).unwrap(), today)
    }

    #[test]
    fn the_year_pill_is_green_orange_brown_or_neutral() {
        assert_eq!(YearTone::of(2026, 2026), YearTone::Current);
        assert_eq!(YearTone::of(2027, 2026), YearTone::Next);
        assert_eq!(YearTone::of(2028, 2026), YearTone::Later);
        assert_eq!(YearTone::of(2099, 2026), YearTone::Later);
        assert_eq!(YearTone::of(2025, 2026), YearTone::Past);
        assert_eq!(YearTone::of(1, 2026), YearTone::Past);
    }

    #[test]
    fn a_tone_has_the_name_the_screen_receives() {
        let names: Vec<&str> = [
            YearTone::Current,
            YearTone::Next,
            YearTone::Later,
            YearTone::Past,
        ]
        .iter()
        .map(|tone| tone.name())
        .collect();
        assert_eq!(names, ["current", "next", "later", "past"]);
    }

    #[test]
    fn the_line_of_a_full_event_reads_date_flag_city_title() {
        let full = line(
            "mois: 2\njour: 10\nannee: 2027\njour-fin: 13\npays: DE\nville: Nuremberg\n",
            "Salon Embedded World",
            2026,
        );
        assert_eq!(
            full.text(),
            "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World"
        );
        assert_eq!(full.date.as_deref(), Some("10–13/02"));
        assert_eq!(full.year, Some(2027));
        assert_eq!(full.tone, Some(YearTone::Next));
        assert_eq!(full.city.as_deref(), Some("Nuremberg"));
        assert_eq!(full.country.map(Country::code), Some("DE"));
        assert_eq!(full.title, "Salon Embedded World");
    }

    #[test]
    fn a_year_alone_makes_a_pill_without_a_date() {
        let year = line("mois: 2\nannee: 2029\n", "Renouveler malorean.fr", 2026);
        assert_eq!(year.text(), "[2029] – Renouveler malorean.fr");
        assert_eq!(year.date, None);
        assert_eq!(year.tone, Some(YearTone::Later));
    }

    #[test]
    fn a_day_without_a_year_is_only_the_day_and_the_month() {
        let day = line("mois: 1\njour: 15\n", "Audit ISO", 2026);
        assert_eq!(day.text(), "15/01 – Audit ISO");
        assert_eq!(day.tone, None);
    }

    #[test]
    fn an_event_with_only_a_title_is_its_title() {
        assert_eq!(line("mois: 1\n", "Audit ISO", 2026).text(), "Audit ISO");
    }

    #[test]
    fn a_city_alone_or_a_country_alone_is_shown_without_the_other() {
        assert_eq!(
            line("mois: 1\nville: Lyon\n", "Salon", 2026).text(),
            "(Lyon) – Salon"
        );
        assert_eq!(
            line("mois: 1\npays: FR\n", "Salon", 2026).text(),
            "🇫🇷 – Salon"
        );
        assert_eq!(
            line("mois: 1\npays: FR\nville: Lyon\n", "Salon", 2026).text(),
            "🇫🇷 (Lyon) – Salon"
        );
    }

    #[test]
    fn an_interval_over_two_months_is_written_with_an_arrow() {
        let across = line(
            "mois: 1\njour: 30\njour-fin: 2\nmois-fin: 2\n",
            "Congrès",
            2026,
        );
        assert_eq!(across.date.as_deref(), Some("30/01 → 02/02"));
        assert_eq!(across.text(), "30/01 → 02/02 – Congrès");
    }

    #[test]
    fn the_day_and_the_month_have_two_digits() {
        assert_eq!(
            line("mois: 2\njour: 3\n", "A", 2026).date.as_deref(),
            Some("03/02")
        );
        assert_eq!(
            line("mois: 11\njour: 12\n", "A", 2026).date.as_deref(),
            Some("12/11")
        );
        assert_eq!(
            line("mois: 2\njour: 3\njour-fin: 4\n", "A", 2026)
                .date
                .as_deref(),
            Some("03–04/02")
        );
    }

    #[test]
    fn a_past_year_is_neutral_and_the_current_year_is_green() {
        assert_eq!(
            line("mois: 2\nannee: 2019\n", "A", 2026).tone,
            Some(YearTone::Past)
        );
        assert_eq!(
            line("mois: 2\nannee: 2026\n", "A", 2026).tone,
            Some(YearTone::Current)
        );
    }
}
