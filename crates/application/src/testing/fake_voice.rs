//! Faux transcripteur : rejoue des événements écrits d'avance, sans micro (spécification de la
//! saisie vocale, § 10).

use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use domain::voice_input::{VoiceEvent, VoiceFailure};

use crate::{
    Listening, Transcriber, VoiceAccess, VoiceCatalog, VoiceEvents, VoiceLanguage, VoiceSink,
};

/// Ce que le faux a reçu.
#[derive(Debug, Default)]
struct Received {
    listened: Vec<Option<String>>,
    catalogs: usize,
    prepared: Vec<String>,
    stops: usize,
}

/// Transcripteur qui joue ses événements, puis attend l'arrêt, joue ceux de l'arrêt et finit.
#[derive(Debug)]
pub struct FakeTranscriber {
    catalog: Result<VoiceCatalog, VoiceFailure>,
    script: Vec<VoiceEvent>,
    at_stop: Vec<VoiceEvent>,
    ends_by_itself: bool,
    listen_failure: Option<VoiceFailure>,
    prepare_failure: Option<VoiceFailure>,
    received: Arc<Mutex<Received>>,
}

impl FakeTranscriber {
    /// Un Mac en français, qui sait aussi l'anglais (modèle pas encore sur le Mac), micro autorisé.
    #[must_use]
    pub fn new() -> Self {
        Self {
            catalog: Ok(VoiceCatalog {
                system: Some("fr-FR".to_owned()),
                access: VoiceAccess::Allowed,
                languages: vec![
                    VoiceLanguage {
                        id: "en-US".to_owned(),
                        name: "anglais (États-Unis)".to_owned(),
                        ready: false,
                    },
                    VoiceLanguage {
                        id: "fr-FR".to_owned(),
                        name: "français (France)".to_owned(),
                        ready: true,
                    },
                ],
            }),
            script: Vec::new(),
            at_stop: Vec::new(),
            ends_by_itself: false,
            listen_failure: None,
            prepare_failure: None,
            received: Arc::default(),
        }
    }

    /// Un Mac qui ne sait rien faire, pour cette raison.
    #[must_use]
    pub fn unavailable(reason: VoiceFailure) -> Self {
        Self {
            catalog: Err(reason),
            listen_failure: Some(reason),
            prepare_failure: Some(reason),
            ..Self::new()
        }
    }

    /// Un Mac dont le catalogue est `catalog`.
    #[must_use]
    pub fn with_catalog(mut self, catalog: VoiceCatalog) -> Self {
        self.catalog = Ok(catalog);
        self
    }

    /// Les événements joués dès que l'écoute commence.
    #[must_use]
    pub fn saying(mut self, events: Vec<VoiceEvent>) -> Self {
        self.script = events;
        self
    }

    /// Les événements joués quand l'écoute est arrêtée, avant la fin.
    #[must_use]
    pub fn saying_at_stop(mut self, events: Vec<VoiceEvent>) -> Self {
        self.at_stop = events;
        self
    }

    /// Finit de lui-même après ses événements, sans attendre l'arrêt (le moteur qui s'arrête).
    #[must_use]
    pub fn ending_by_itself(mut self) -> Self {
        self.ends_by_itself = true;
        self
    }

    /// L'écoute ne démarre pas, pour cette raison.
    #[must_use]
    pub fn failing_to_listen(mut self, reason: VoiceFailure) -> Self {
        self.listen_failure = Some(reason);
        self
    }

    /// La préparation d'une langue échoue pour cette raison.
    #[must_use]
    pub fn failing_to_prepare(mut self, reason: VoiceFailure) -> Self {
        self.prepare_failure = Some(reason);
        self
    }

    /// Les langues demandées à l'écoute, dans l'ordre (`None` : la langue du Mac).
    pub fn listened(&self) -> Vec<Option<String>> {
        self.received().listened.clone()
    }

    /// Combien de fois le catalogue a été demandé.
    pub fn catalogs(&self) -> usize {
        self.received().catalogs
    }

    /// Les langues préparées, dans l'ordre.
    pub fn prepared(&self) -> Vec<String> {
        self.received().prepared.clone()
    }

    /// Combien d'arrêts ont été demandés.
    pub fn stops(&self) -> usize {
        self.received().stops
    }

    fn received(&self) -> std::sync::MutexGuard<'_, Received> {
        self.received.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Default for FakeTranscriber {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
struct FakeListening {
    stop: Sender<()>,
    received: Arc<Mutex<Received>>,
}

impl Listening for FakeListening {
    fn stop(&self) {
        self.received
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .stops += 1;
        self.stop.send(()).ok();
    }
}

impl Transcriber for FakeTranscriber {
    fn catalog(&self) -> Result<VoiceCatalog, VoiceFailure> {
        self.received().catalogs += 1;
        self.catalog.clone()
    }

    fn prepare(&self, language: &str) -> Result<(), VoiceFailure> {
        self.received().prepared.push(language.to_owned());
        self.prepare_failure.map_or(Ok(()), Err)
    }

    fn listen(
        &self,
        language: Option<&str>,
        mut sink: VoiceSink,
    ) -> Result<Box<dyn Listening>, VoiceFailure> {
        self.received().listened.push(language.map(str::to_owned));
        if let Some(reason) = self.listen_failure {
            return Err(reason);
        }
        // Comme le vrai moteur, qui cherche lui-même la langue du Mac : sans langue à proposer,
        // l'échec arrive par un événement.
        let without_language = language.is_none()
            && self
                .catalog
                .as_ref()
                .is_ok_and(|catalog| catalog.system.is_none());
        let (stop, stopped) = mpsc::channel();
        let (script, at_stop, ends_by_itself) = (
            self.script.clone(),
            self.at_stop.clone(),
            self.ends_by_itself || without_language,
        );
        thread::spawn(move || {
            if without_language {
                sink(VoiceEvent::Failed(VoiceFailure::LanguageUnsupported));
            }
            script.into_iter().for_each(&mut sink);
            if !ends_by_itself {
                // Un arrêt demandé, ou une écoute abandonnée : dans les deux cas, on finit.
                stopped.recv().ok();
                at_stop.into_iter().for_each(&mut sink);
            }
            sink(VoiceEvent::Ended);
        });
        Ok(Box::new(FakeListening {
            stop,
            received: Arc::clone(&self.received),
        }))
    }
}

/// Interface qui garde les événements reçus, et laisse un test attendre l'un d'eux.
#[derive(Debug, Default)]
pub struct RecordingVoiceEvents {
    events: Mutex<Vec<VoiceEvent>>,
    arrived: Condvar,
}

impl RecordingVoiceEvents {
    /// Les événements reçus, dans l'ordre.
    pub fn events(&self) -> Vec<VoiceEvent> {
        self.events
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Attend (cinq secondes au plus) que `condition` soit vraie des événements reçus ; rend les
    /// événements reçus.
    pub fn wait_until(&self, condition: impl Fn(&[VoiceEvent]) -> bool) -> Vec<VoiceEvent> {
        let events = self.events.lock().unwrap_or_else(PoisonError::into_inner);
        self.arrived
            .wait_timeout_while(events, Duration::from_secs(5), |events| !condition(events))
            .unwrap_or_else(PoisonError::into_inner)
            .0
            .clone()
    }

    /// Attend la fin de la saisie vocale.
    pub fn wait_for_the_end(&self) -> Vec<VoiceEvent> {
        self.wait_until(|events| events.last() == Some(&VoiceEvent::Ended))
    }
}

impl VoiceEvents for RecordingVoiceEvents {
    fn voice_event(&self, event: &VoiceEvent) {
        self.events
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(event.clone());
        self.arrived.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sink_into(events: &Arc<Mutex<Vec<VoiceEvent>>>) -> VoiceSink {
        let events = Arc::clone(events);
        Box::new(move |event| events.lock().unwrap().push(event))
    }

    fn wait_for_end(events: &Arc<Mutex<Vec<VoiceEvent>>>) -> Vec<VoiceEvent> {
        for _ in 0..500 {
            let seen = events.lock().unwrap().clone();
            if seen.last() == Some(&VoiceEvent::Ended) {
                return seen;
            }
            thread::sleep(Duration::from_millis(10));
        }
        events.lock().unwrap().clone()
    }

    #[test]
    fn it_plays_its_events_then_waits_for_the_stop_then_ends() {
        let transcriber = FakeTranscriber::new()
            .saying(vec![
                VoiceEvent::Listening,
                VoiceEvent::Provisional("bon".to_owned()),
            ])
            .saying_at_stop(vec![VoiceEvent::Fixed("Bonjour.".to_owned())]);
        let seen = Arc::default();
        let listening = transcriber.listen(Some("fr-FR"), sink_into(&seen)).unwrap();
        thread::sleep(Duration::from_millis(100));
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                VoiceEvent::Listening,
                VoiceEvent::Provisional("bon".to_owned())
            ]
        );
        listening.stop();
        assert_eq!(
            wait_for_end(&seen),
            vec![
                VoiceEvent::Listening,
                VoiceEvent::Provisional("bon".to_owned()),
                VoiceEvent::Fixed("Bonjour.".to_owned()),
                VoiceEvent::Ended
            ]
        );
        assert_eq!(transcriber.listened(), vec![Some("fr-FR".to_owned())]);
        assert_eq!(transcriber.stops(), 1);
    }

    #[test]
    fn it_can_end_by_itself() {
        let transcriber = FakeTranscriber::new()
            .saying(vec![VoiceEvent::Failed(VoiceFailure::Stopped)])
            .ending_by_itself();
        let seen = Arc::default();
        let _listening = transcriber.listen(Some("fr-FR"), sink_into(&seen)).unwrap();
        assert_eq!(
            wait_for_end(&seen),
            vec![VoiceEvent::Failed(VoiceFailure::Stopped), VoiceEvent::Ended]
        );
    }

    #[test]
    fn an_abandoned_listening_ends() {
        let transcriber = FakeTranscriber::new();
        let seen = Arc::default();
        drop(transcriber.listen(Some("fr-FR"), sink_into(&seen)).unwrap());
        assert_eq!(wait_for_end(&seen), vec![VoiceEvent::Ended]);
    }

    #[test]
    fn it_fails_to_listen_or_prepare_when_told_to() {
        let transcriber = FakeTranscriber::new()
            .failing_to_listen(VoiceFailure::EngineMissing)
            .failing_to_prepare(VoiceFailure::LanguageDownload);
        assert_eq!(
            transcriber
                .listen(Some("fr-FR"), Box::new(|_| ()))
                .unwrap_err(),
            VoiceFailure::EngineMissing
        );
        assert_eq!(
            transcriber.prepare("en-US"),
            Err(VoiceFailure::LanguageDownload)
        );
        assert_eq!(transcriber.prepared(), vec!["en-US".to_owned()]);
    }

    #[test]
    fn it_prepares_without_failure_by_default() {
        assert_eq!(FakeTranscriber::new().prepare("en-US"), Ok(()));
    }

    #[test]
    fn an_unavailable_mac_says_why_everywhere() {
        let transcriber = FakeTranscriber::unavailable(VoiceFailure::SystemTooOld);
        assert_eq!(transcriber.catalog(), Err(VoiceFailure::SystemTooOld));
        assert_eq!(
            transcriber.prepare("fr-FR"),
            Err(VoiceFailure::SystemTooOld)
        );
        assert!(transcriber.listen(Some("fr-FR"), Box::new(|_| ())).is_err());
    }

    #[test]
    fn the_default_mac_speaks_french_and_knows_english_too() {
        let catalog = FakeTranscriber::default().catalog().unwrap();
        assert_eq!(catalog.system.as_deref(), Some("fr-FR"));
        assert_eq!(catalog.access, VoiceAccess::Allowed);
        assert_eq!(catalog.languages.len(), 2);
    }

    #[test]
    fn the_recording_interface_waits_for_what_it_needs() {
        let events = Arc::new(RecordingVoiceEvents::default());
        let sender = Arc::clone(&events);
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(30));
            sender.voice_event(&VoiceEvent::Listening);
            sender.voice_event(&VoiceEvent::Ended);
        });
        assert_eq!(
            events.wait_for_the_end(),
            vec![VoiceEvent::Listening, VoiceEvent::Ended]
        );
        assert_eq!(events.events().len(), 2);
    }
}
