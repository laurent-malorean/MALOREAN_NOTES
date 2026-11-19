//! Propriétés de l'historique, vérifiées sur des versions et des textes générés au hasard :
//! la conservation des versions et les différences entre deux textes, par ligne et par mot.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::collections::{HashMap, HashSet};

use domain::Moment;
use domain::diff::{Difference, differences, word_differences};
use domain::history::{KEEP_ALL_MINUTES, ONE_PER_DAY_DAYS, Version, retained};
use proptest::prelude::*;

/// Un moment sur un peu plus de deux ans, à toute heure.
fn moment() -> impl Strategy<Value = Moment> {
    (2025i32..=2027, 1u32..=12, 1u32..=28, 0u32..24, 0u32..60)
        .prop_map(|(y, mo, d, h, mi)| Moment::new(y, mo, d, h, mi).unwrap())
}

/// Une version, parfois la deuxième ou la troisième de sa minute.
fn version() -> impl Strategy<Value = Version> {
    (moment(), 1u32..=3).prop_map(|(at, rank)| {
        let id = Version::at(at).id();
        if rank == 1 {
            Version::at(at)
        } else {
            Version::parse(&format!("{id} ({rank})")).unwrap()
        }
    })
}

/// L'âge d'une version à `now`, en minutes.
fn age(version: &Version, now: Moment) -> i64 {
    now.minutes_since_epoch() - version.moment().minutes_since_epoch()
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
enum Zone {
    Day(i64),
    Week(i64),
}

/// La période d'une version de plus de 24 heures : son jour jusqu'à 30 jours, sa semaine au-delà.
fn zone(version: &Version, now: Moment) -> Option<Zone> {
    let age = age(version, now);
    if age < KEEP_ALL_MINUTES {
        None
    } else if age < ONE_PER_DAY_DAYS * KEEP_ALL_MINUTES {
        Some(Zone::Day(version.moment().days_since_epoch()))
    } else {
        Some(Zone::Week(version.moment().weeks_since_epoch()))
    }
}

/// Une ligne courte, tirée d'un petit choix pour que deux textes aient des lignes en commun.
fn lines() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec(prop::sample::select(vec!["a", "b", "c", "# T", ""]), 0..12)
        .prop_map(|lines| lines.into_iter().map(str::to_owned).collect())
}

/// La plus longue suite de lignes commune aux deux textes, calculée sans astuce.
fn longest_common(a: &[String], b: &[String]) -> usize {
    let mut table = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            table[i][j] = if a[i] == b[j] {
                table[i + 1][j + 1] + 1
            } else {
                table[i + 1][j].max(table[i][j + 1])
            };
        }
    }
    table[0][0]
}

proptest! {
    #[test]
    fn retained_versions_are_among_those_given_and_the_newest_is_always_one(
        versions in prop::collection::vec(version(), 1..40), now in moment(),
    ) {
        let kept = retained(&versions, now);
        prop_assert!(kept.iter().all(|v| versions.contains(v)));
        prop_assert_eq!(kept.iter().collect::<HashSet<_>>().len(), kept.len());
        prop_assert_eq!(kept.first(), versions.iter().max());
        prop_assert!(kept.windows(2).all(|pair| pair[0] > pair[1]));
    }

    #[test]
    fn every_version_of_the_last_24_hours_is_retained(
        versions in prop::collection::vec(version(), 0..40), now in moment(),
    ) {
        let kept = retained(&versions, now);
        for version in versions.iter().filter(|v| age(v, now) < KEEP_ALL_MINUTES) {
            prop_assert!(kept.contains(version));
        }
    }

    #[test]
    fn exactly_one_version_is_retained_per_day_then_per_week(
        versions in prop::collection::vec(version(), 0..40), now in moment(),
    ) {
        let kept = retained(&versions, now);
        let mut per_zone: HashMap<Zone, usize> = HashMap::new();
        for version in &kept {
            if let Some(zone) = zone(version, now) {
                *per_zone.entry(zone).or_default() += 1;
            }
        }
        let zones: HashSet<Zone> = versions.iter().filter_map(|v| zone(v, now)).collect();
        prop_assert_eq!(per_zone.keys().copied().collect::<HashSet<_>>(), zones);
        prop_assert!(per_zone.values().all(|count| *count == 1));
    }

    #[test]
    fn the_newest_version_of_each_period_is_the_one_retained(
        versions in prop::collection::vec(version(), 0..40), now in moment(),
    ) {
        let kept = retained(&versions, now);
        for version in &kept {
            if let Some(period) = zone(version, now) {
                let newer = versions.iter().any(|v| v > version && zone(v, now) == Some(period));
                prop_assert!(!newer);
            }
        }
    }

    #[test]
    fn retaining_twice_removes_nothing_more(
        versions in prop::collection::vec(version(), 0..40), now in moment(),
    ) {
        let kept = retained(&versions, now);
        prop_assert_eq!(retained(&kept, now), kept);
    }

    #[test]
    fn differences_give_back_both_texts_with_the_fewest_changes(
        old in lines(), new in lines(),
    ) {
        let found = differences(&old.join("\n"), &new.join("\n"));
        let from: Vec<String> = found.iter().filter_map(|d| match d {
            Difference::Same(l) | Difference::Removed(l) => Some(l.clone()),
            Difference::Added(_) => None,
        }).collect();
        let to: Vec<String> = found.iter().filter_map(|d| match d {
            Difference::Same(l) | Difference::Added(l) => Some(l.clone()),
            Difference::Removed(_) => None,
        }).collect();
        let joined = |lines: &[String]| lines.join("\n").lines().map(str::to_owned).collect::<Vec<_>>();
        prop_assert_eq!(&from, &joined(&old));
        prop_assert_eq!(&to, &joined(&new));
        let same = found.iter().filter(|d| matches!(d, Difference::Same(_))).count();
        prop_assert_eq!(same, longest_common(&joined(&old), &joined(&new)));
    }

    #[test]
    fn word_differences_give_back_both_texts_without_two_pieces_alike_in_a_row(
        old in "[ab \n]{0,30}", new in "[ab \n]{0,30}",
    ) {
        let found = word_differences(&old, &new);
        let from: String = found.iter().filter_map(|d| match d {
            Difference::Same(t) | Difference::Removed(t) => Some(t.as_str()),
            Difference::Added(_) => None,
        }).collect();
        let to: String = found.iter().filter_map(|d| match d {
            Difference::Same(t) | Difference::Added(t) => Some(t.as_str()),
            Difference::Removed(_) => None,
        }).collect();
        prop_assert_eq!(from, old);
        prop_assert_eq!(to, new);
        let kind = |d: &Difference| std::mem::discriminant(d);
        prop_assert!(found.windows(2).all(|pair| kind(&pair[0]) != kind(&pair[1])));
    }
}
