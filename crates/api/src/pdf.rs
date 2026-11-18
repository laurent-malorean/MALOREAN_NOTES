//! Impression de la page en PDF par WebKit, sans fenêtre d'impression. Seule frontière avec
//! macOS hors d'`infrastructure` : elle agit sur la fenêtre que tient Tauri (fiche 0025).

#![expect(
    unsafe_code,
    reason = "appel de WebKit et d'AppKit (Objective-C) : l'impression de la page en PDF, fiche 0025"
)]

use std::ffi::c_void;

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
    // SAFETY: Tauri passe le WKWebView et la NSWindow de sa fenêtre, vivants pendant l'appel
    // (`with_webview` l'exécute sur le fil principal) ; un pointeur nul donne `None`.
    let (Some(webview), Some(window)) = (unsafe { webview.cast::<WKWebView>().as_ref() }, unsafe {
        window.cast::<NSWindow>().as_ref()
    }) else {
        return Err("la fenêtre n'est pas prête".to_owned());
    };
    let url = NSURL::from_file_path(location)
        .ok_or_else(|| format!("emplacement illisible : « {location} »"))?;
    let info = NSPrintInfo::new();
    // SAFETY: constantes d'AppKit, définies pendant toute la vie de l'application.
    let (save_job, saving_url) = unsafe { (NSPrintSaveJob, NSPrintJobSavingURL) };
    info.setJobDisposition(save_job);
    let url: &AnyObject = url.as_ref();
    // SAFETY: le dictionnaire de NSPrintInfo associe ses clés à des objets quelconques ;
    // NSPrintJobSavingURL attend une NSURL de fichier.
    unsafe { info.dictionary() }.insert(saving_url, url);
    info.setTopMargin(PAGE_MARGIN);
    info.setBottomMargin(PAGE_MARGIN);
    info.setLeftMargin(PAGE_MARGIN);
    info.setRightMargin(PAGE_MARGIN);
    // SAFETY: le WKWebView est vivant et l'appel a lieu sur le fil principal.
    let operation = unsafe { webview.printOperationWithPrintInfo(&info) };
    operation.setShowsPrintPanel(false);
    operation.setShowsProgressPanel(false);
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
