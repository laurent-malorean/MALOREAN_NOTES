//! Ce qu'une action est le jour d'aujourd'hui (spécification § 7.1) : ouverte ou terminée, en
//! retard, à faire aujourd'hui, et les entreprises de ses personnes.

use super::action::Action;
use super::day::Day;
use super::reference::Reference;

/// L'urgence d'une action ouverte datée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Urgency {
    /// En retard à partir du jour qui suit sa date, de ce nombre de jours (1 le lendemain).
    Late(i64),
    /// À faire aujourd'hui : datée d'aujourd'hui.
    Today,
}

impl Action {
    /// Une action ouverte est « TODO » ou dans une étape.
    #[must_use]
    pub fn is_open(&self) -> bool {
        self.status.is_open()
    }

    /// Une action terminée est « Done » ou « Cancel ».
    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.status.is_closed()
    }

    /// L'urgence de l'action le jour `today` : en retard si elle est ouverte et datée d'avant
    /// aujourd'hui, à faire aujourd'hui si elle est ouverte et datée d'aujourd'hui ; rien sinon. Une
    /// action terminée, ou sans date, n'est jamais en retard.
    #[must_use]
    pub fn urgency(&self, today: Day) -> Option<Urgency> {
        let date = self.date.filter(|_| self.is_open())?;
        match date.days_until(today) {
            0 => Some(Urgency::Today),
            late @ 1.. => Some(Urgency::Late(late)),
            ..0 => None,
        }
    }

    /// Les entreprises de l'action : celles de ses personnes au moment où elles ont été données,
    /// sans doublon, dans l'ordre ; `None` est NODATA (une personne sans entreprise). Une action sans
    /// personne est dans NODATA.
    #[must_use]
    pub fn companies(&self) -> Vec<Option<Reference>> {
        let mut companies: Vec<Option<Reference>> = Vec::new();
        for person in &self.people {
            if !companies.contains(&person.company) {
                companies.push(person.company.clone());
            }
        }
        if companies.is_empty() {
            companies.push(None);
        }
        companies
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crm::Stages;

    fn day(text: &str) -> Day {
        Day::parse(text).unwrap()
    }

    fn action(yaml: &str) -> Action {
        let content = format!("---\ntype: crm-action\n{yaml}---\n# A\n");
        Action::parse(Reference::to("a").unwrap(), &content, &Stages::default()).unwrap()
    }

    #[test]
    fn an_action_is_late_from_the_day_after_its_date() {
        let today = day("2026-11-24");
        assert_eq!(
            action("date: '2026-11-24'\n").urgency(today),
            Some(Urgency::Today)
        );
        assert_eq!(
            action("date: '2026-11-23'\n").urgency(today),
            Some(Urgency::Late(1))
        );
        assert_eq!(
            action("date: '2026-11-14'\n").urgency(today),
            Some(Urgency::Late(10))
        );
        assert_eq!(
            action("date: '2025-11-24'\n").urgency(today),
            Some(Urgency::Late(365))
        );
        assert_eq!(action("date: '2026-11-25'\n").urgency(today), None);
    }

    #[test]
    fn an_action_in_a_stage_is_late_like_one_in_todo() {
        let late = action("statut: Progress\ndate: '2026-11-20'\n");
        assert_eq!(late.urgency(day("2026-11-24")), Some(Urgency::Late(4)));
    }

    #[test]
    fn a_finished_action_or_one_without_date_is_never_late_nor_for_today() {
        let today = day("2026-11-24");
        for status in ["Done", "Cancel"] {
            for date in ["2026-11-20", "2026-11-24"] {
                let finished = action(&format!("statut: {status}\ndate: '{date}'\n"));
                assert_eq!(finished.urgency(today), None, "{status} {date}");
            }
        }
        assert_eq!(action("").urgency(today), None);
    }

    #[test]
    fn an_action_is_open_in_todo_or_a_stage_and_finished_in_done_or_cancel() {
        let states = |status: &str| {
            let a = action(&format!("statut: {status}\n"));
            (a.is_open(), a.is_closed())
        };
        assert_eq!(states("TODO"), (true, false));
        assert_eq!(states("Progress"), (true, false));
        assert_eq!(states("Done"), (false, true));
        assert_eq!(states("Cancel"), (false, true));
    }

    #[test]
    fn the_companies_of_an_action_are_those_of_its_people_of_the_moment() {
        let reference = |t: &str| Some(Reference::to(t).unwrap());
        let a = action(
            "personnes: ['[[a]] · [[acme]]', '[[b]]', '[[c]] · [[acme]]', '[[d]] · [[globex]]', '[[e]]']\n",
        );
        assert_eq!(
            a.companies(),
            vec![reference("acme"), None, reference("globex")]
        );
    }

    #[test]
    fn an_action_without_person_is_in_nodata() {
        assert_eq!(action("").companies(), vec![None]);
    }
}
