//! La saisie vocale (fiche 0103) : démarrer et arrêter l'écoute du micro (une seule à la fois),
//! ranger les événements du moteur dans l'ordre où l'interface les reçoit, arrêter après un
//! silence, choisir la langue.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use domain::voice_input::{Dictation, SILENCE_TIMEOUT, VoiceEvent, VoiceFailure};

use crate::{
    AppError, Listening, Preferences, Transcriber, Uptime, VoiceCatalog, VoiceEvents, VoiceSink,
};

/// Le temps entre deux regards sur le silence.
const SILENCE_TICK: Duration = Duration::from_millis(500);

/// Ce que l'interface affiche de la saisie vocale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoiceStatus {
    /// Ce que le moteur sait de ce Mac, ou pourquoi il ne peut pas servir.
    pub engine: Result<VoiceCatalog, VoiceFailure>,
    /// La langue choisie dans les réglages ; rien : la langue du Mac.
    pub chosen: Option<String>,
    /// Une saisie vocale est en cours (ou se termine).
    pub listening: bool,
}

/// Une écoute lancée : sa dictée, et de quoi l'arrêter.
#[derive(Debug)]
struct Running {
    dictation: Mutex<Dictation>,
    listening: Mutex<Option<Box<dyn Listening>>>,
}

#[derive(Debug)]
struct Inner {
    transcriber: Arc<dyn Transcriber>,
    preferences: Arc<dyn Preferences>,
    events: Arc<dyn VoiceEvents>,
    uptime: Arc<dyn Uptime>,
    silence: Duration,
    tick: Duration,
    current: Mutex<Option<Arc<Running>>>,
}

/// La saisie vocale : une seule écoute à la fois.
#[derive(Debug, Clone)]
pub struct VoiceInput {
    inner: Arc<Inner>,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl VoiceInput {
    /// La saisie vocale du moteur `transcriber`, qui garde la langue dans `preferences`, envoie
    /// ses événements à `events` et mesure le silence avec `uptime`.
    #[must_use]
    pub fn new(
        transcriber: Arc<dyn Transcriber>,
        preferences: Arc<dyn Preferences>,
        events: Arc<dyn VoiceEvents>,
        uptime: Arc<dyn Uptime>,
    ) -> Self {
        Self::with_silence(transcriber, preferences, events, uptime, SILENCE_TIMEOUT)
    }

    /// Comme [`VoiceInput::new`], avec un autre silence d'arrêt (les tests n'attendent pas trente
    /// secondes) ; le regard sur le silence est alors plus fréquent.
    #[must_use]
    pub fn with_silence(
        transcriber: Arc<dyn Transcriber>,
        preferences: Arc<dyn Preferences>,
        events: Arc<dyn VoiceEvents>,
        uptime: Arc<dyn Uptime>,
        silence: Duration,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                transcriber,
                preferences,
                events,
                uptime,
                silence,
                tick: SILENCE_TICK.min(silence / 4),
                current: Mutex::new(None),
            }),
        }
    }

    /// Ce que l'interface affiche : le moteur, la langue choisie, si une écoute est en cours.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent pas.
    pub fn status(&self) -> Result<VoiceStatus, AppError> {
        Ok(VoiceStatus {
            engine: self.inner.transcriber.catalog(),
            chosen: self.inner.preferences.voice_language()?,
            listening: locked(&self.inner.current).is_some(),
        })
    }

    /// Garde `language` comme langue de la saisie vocale, ou, avec `None`, revient à celle du Mac.
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::LanguageLocked`] pendant une écoute, [`VoiceFailure::LanguageUnsupported`]
    /// si macOS ne sait pas la transcrire, l'erreur du moteur s'il ne répond pas ;
    /// [`AppError::StorageUnavailable`] si les préférences ne s'écrivent pas.
    pub fn choose_language(&self, language: Option<&str>) -> Result<(), AppError> {
        if locked(&self.inner.current).is_some() {
            return Err(VoiceFailure::LanguageLocked.into());
        }
        if let Some(language) = language {
            self.supported(language)?;
        }
        Ok(self.inner.preferences.save_voice_language(language)?)
    }

    /// Prépare le modèle de `language` (le télécharge s'il manque) ; rend la main quand il est
    /// prêt.
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::LanguageUnsupported`] si macOS ne sait pas la transcrire,
    /// [`VoiceFailure::LanguageDownload`] si le téléchargement échoue, l'erreur du moteur s'il ne
    /// répond pas.
    pub fn prepare_language(&self, language: &str) -> Result<(), AppError> {
        self.supported(language)?;
        Ok(self.inner.transcriber.prepare(language)?)
    }

    /// Démarre l'écoute, dans la langue choisie (celle du Mac sinon), et rend la main aussitôt : la
    /// suite arrive par les événements, jusqu'à [`VoiceEvent::Ended`].
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::AlreadyListening`] si une saisie vocale est en cours (ou se termine),
    /// [`VoiceFailure::LanguageUnsupported`] si le Mac n'a aucune langue à proposer, l'erreur du
    /// moteur s'il ne peut pas être lancé ; [`AppError::StorageUnavailable`] si les préférences ne
    /// se lisent pas.
    pub fn start(&self) -> Result<(), AppError> {
        let running = Arc::new(Running {
            dictation: Mutex::new(Dictation::new(self.inner.silence)),
            listening: Mutex::new(None),
        });
        {
            let mut current = locked(&self.inner.current);
            if current.is_some() {
                return Err(VoiceFailure::AlreadyListening.into());
            }
            *current = Some(Arc::clone(&running));
        }
        match self.listen(&running) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.inner.release(&running);
                Err(error)
            }
        }
    }

    /// Arrête l'écoute en cours : le texte provisoire est fixé tel quel, puis la saisie vocale
    /// finit par [`VoiceEvent::Ended`]. Sans effet s'il n'y en a pas.
    pub fn stop(&self) {
        let current = locked(&self.inner.current).clone();
        if let Some(running) = current {
            running.stop();
        }
    }

    /// Regarde si le silence dure assez pour arrêter l'écoute en cours (le fil de l'écoute le
    /// fait de lui-même).
    pub fn check_silence(&self) {
        let current = locked(&self.inner.current).clone();
        if let Some(running) = current {
            self.inner.check_silence(&running);
        }
    }

    fn listen(&self, running: &Arc<Running>) -> Result<(), AppError> {
        let language = match self.inner.preferences.voice_language()? {
            Some(language) => language,
            None => self
                .inner
                .transcriber
                .catalog()?
                .system
                .ok_or(VoiceFailure::LanguageUnsupported)?,
        };
        let sink: VoiceSink = {
            let (inner, running) = (Arc::clone(&self.inner), Arc::clone(running));
            Box::new(move |event| inner.receive(&running, event))
        };
        let listening = self.inner.transcriber.listen(&language, sink)?;
        *locked(&running.listening) = Some(listening);
        let (inner, running) = (Arc::clone(&self.inner), Arc::clone(running));
        thread::spawn(move || inner.watch_silence(&running));
        Ok(())
    }

    /// Le catalogue du moteur, si `language` y est.
    fn supported(&self, language: &str) -> Result<(), AppError> {
        let catalog = self.inner.transcriber.catalog()?;
        if catalog.languages.iter().any(|known| known.id == language) {
            Ok(())
        } else {
            Err(VoiceFailure::LanguageUnsupported.into())
        }
    }
}

impl Running {
    fn stop(&self) {
        if let Some(listening) = locked(&self.listening).as_ref() {
            listening.stop();
        }
    }
}

impl Inner {
    /// Range un événement du moteur et transmet ce qui en sort à l'interface. À la fin, la place
    /// est libérée **avant** d'annoncer la fin : l'interface peut relancer dès qu'elle la lit.
    fn receive(&self, running: &Arc<Running>, event: VoiceEvent) {
        let mut dictation = locked(&running.dictation);
        let events = dictation.receive(event, self.uptime.elapsed());
        if dictation.is_finished() {
            self.release(running);
        }
        for event in events {
            self.events.voice_event(&event);
        }
    }

    fn check_silence(&self, running: &Arc<Running>) {
        let silent = {
            let mut dictation = locked(&running.dictation);
            let silence = dictation.check_silence(self.uptime.elapsed());
            silence.inspect(|event| self.events.voice_event(event))
        };
        if silent.is_some() {
            running.stop();
        }
    }

    fn watch_silence(&self, running: &Arc<Running>) {
        while !locked(&running.dictation).is_finished() {
            thread::sleep(self.tick);
            self.check_silence(running);
        }
    }

    /// Libère la place si `running` l'occupe encore.
    fn release(&self, running: &Arc<Running>) {
        let mut current = locked(&self.current);
        if current
            .as_ref()
            .is_some_and(|occupant| Arc::ptr_eq(occupant, running))
        {
            *current = None;
        }
    }
}

#[cfg(test)]
#[path = "voice_input_tests.rs"]
mod tests;
