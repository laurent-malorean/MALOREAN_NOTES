//! L'horloge réelle : le seul endroit qui lit l'heure du Mac.

use application::Clock;
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
        let now = jiff::ZonedDateTime::now();
        // Les champs d'une date jiff sont toujours positifs et dans leurs bornes.
        let field = |value: i8| u32::try_from(value).unwrap_or_default();
        Moment::new(
            i32::from(now.year()),
            field(now.month()),
            field(now.day()),
            field(now.hour()),
            field(now.minute()),
        )
        .unwrap_or_else(|_| unreachable!("jiff donne toujours une date valide"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[expect(
        clippy::disallowed_methods,
        reason = "le test de l'horloge réelle la compare à l'heure du Mac"
    )]
    fn the_real_clock_gives_the_local_date_and_time() {
        let before = jiff::ZonedDateTime::now();
        let moment = SystemClock.now();
        let after = jiff::ZonedDateTime::now();
        let expected = |now: &jiff::ZonedDateTime| {
            let field = |value: i8| u32::try_from(value).unwrap_or_default();
            Moment::new(
                i32::from(now.year()),
                field(now.month()),
                field(now.day()),
                field(now.hour()),
                field(now.minute()),
            )
            .ok()
        };
        // La minute peut changer entre deux lectures : l'une des deux doit correspondre.
        assert!(
            [expected(&before), expected(&after)].contains(&Some(moment)),
            "{moment:?}"
        );
    }
}
