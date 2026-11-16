//! L'horloge réelle : le seul endroit qui lit l'heure du Mac.

use application::Clock;
use chrono::{Datelike, Timelike};
use domain::Moment;

/// L'heure locale du Mac.
#[derive(Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    #[expect(
        clippy::disallowed_methods,
        reason = "l'horloge réelle est le seul endroit qui lit l'heure"
    )]
    fn now(&self) -> Moment {
        let now = chrono::Local::now();
        Moment::new(now.year(), now.month(), now.day(), now.hour(), now.minute())
            .unwrap_or_else(|_| unreachable!("chrono donne toujours une date valide"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_real_clock_gives_a_plausible_moment() {
        let moment = format!("{:?}", SystemClock.now());
        assert!(moment.contains("year: 20"), "{moment}");
    }
}
