//! Impression de la page par WebKit : en PDF sans fenêtre d'impression, ou dans la fenêtre
//! d'impression du Mac. Seule frontière avec macOS hors d'`infrastructure` : elle agit sur la
//! fenêtre que tient Tauri (fiches 0025 et 0026).

#![expect(
    unsafe_code,
    reason = "appel de WebKit et d'AppKit (Objective-C) : l'impression de la page, fiches 0025 et 0026"
)]

use std::ffi::c_void;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSWindow};
use objc2_foundation::NSURL;
use objc2_web_kit::WKWebView;

/// Marge de chaque côté de la page, en points (2 cm).
const PAGE_MARGIN: f64 = 56.7;

/// Lance l'impression de la page affichée par `webview` (dans `window`) dans le fichier PDF
/// `location`, au format de papier du Mac. WebKit applique la feuille de style d'impression
/// et écrit le fichier peu après, sans rien montrer. À appeler sur le fil principal.
pub(crate) fn print_to_pdf(
    webview: *mut c_void,
    window: *mut c_void,
    location: &str,
) -> Result<(), String> {
    let url = NSURL::from_file_path(location)
        .ok_or_else(|| format!("emplacement illisible : « {location} »"))?;
    let info = page_setup();
    // SAFETY: constantes d'AppKit, définies pendant toute la vie de l'application.
    let (save_job, saving_url) = unsafe { (NSPrintSaveJob, NSPrintJobSavingURL) };
    info.setJobDisposition(save_job);
    let url: &AnyObject = url.as_ref();
    // SAFETY: le dictionnaire de NSPrintInfo associe ses clés à des objets quelconques ;
    // NSPrintJobSavingURL attend une NSURL de fichier.
    unsafe { info.dictionary() }.insert(saving_url, url);
    run(webview, window, &info, false)
}

/// Ouvre la fenêtre d'impression du Mac, attachée à `window`, sur la page affichée par
/// `webview`, avec les marges de l'export PDF. Rend la main dès la fenêtre ouverte ; on y
/// imprime, ou on y garde un PDF. À appeler sur le fil principal.
pub(crate) fn print_with_panel(webview: *mut c_void, window: *mut c_void) -> Result<(), String> {
    run(webview, window, &page_setup(), true)
}

/// Le format de papier du Mac, avec les marges de 2 cm.
fn page_setup() -> Retained<NSPrintInfo> {
    let info = NSPrintInfo::new();
    info.setTopMargin(PAGE_MARGIN);
    info.setBottomMargin(PAGE_MARGIN);
    info.setLeftMargin(PAGE_MARGIN);
    info.setRightMargin(PAGE_MARGIN);
    info
}

/// Imprime la page selon `info`, la fenêtre d'impression et la barre de progression montrées
/// ou non selon `panels`.
fn run(
    webview: *mut c_void,
    window: *mut c_void,
    info: &NSPrintInfo,
    panels: bool,
) -> Result<(), String> {
    // SAFETY: Tauri passe le WKWebView et la NSWindow de sa fenêtre, vivants pendant l'appel
    // (`with_webview` l'exécute sur le fil principal) ; un pointeur nul donne `None`.
    let (Some(webview), Some(window)) = (unsafe { webview.cast::<WKWebView>().as_ref() }, unsafe {
        window.cast::<NSWindow>().as_ref()
    }) else {
        return Err("la fenêtre n'est pas prête".to_owned());
    };
    // SAFETY: le WKWebView est vivant et l'appel a lieu sur le fil principal.
    let operation = unsafe { webview.printOperationWithPrintInfo(info) };
    operation.setShowsPrintPanel(panels);
    operation.setShowsProgressPanel(panels);
    // SAFETY: ni délégué ni sélecteur, contexte nul : AppKit ne rappelle rien. WebKit dessine
    // la page dans un autre processus : seule l'impression modale (asynchrone) l'attend, une
    // impression synchrone (`runOperation`) donnerait des pages blanches.
    unsafe {
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            window,
            None,
            None,
            std::ptr::null_mut(),
        );
    }
    Ok(())
}
