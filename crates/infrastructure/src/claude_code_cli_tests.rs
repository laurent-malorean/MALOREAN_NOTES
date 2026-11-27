//! Les tests du programme de Claude Code : adresse de connexion.

use super::*;

#[test]
fn the_sign_in_address_is_read_from_the_line_that_holds_it() {
    assert_eq!(
        sign_in_address("If the browser didn't open, visit: https://claude.ai/oauth?a=1 "),
        Some("https://claude.ai/oauth?a=1")
    );
    assert_eq!(
        sign_in_address("Sign in at: https://claude.ai/x"),
        Some("https://claude.ai/x")
    );
    assert_eq!(sign_in_address("Opening browser to sign in…"), None);
}
