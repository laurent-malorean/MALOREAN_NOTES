//! Adresse web : la cible d'un lien Markdown qui s'ouvre dans le navigateur du Mac.

/// Débuts d'une adresse web, en minuscules ; les majuscules de la cible sont ignorées.
const SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];

/// Une adresse `http://`, `https://` ou `mailto:`, sans espace ni caractère de contrôle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebAddress(String);

impl WebAddress {
    /// L'adresse web que vise la cible d'un lien, `<…>` autour retirés ; rien si la cible n'en
    /// est pas une (chemin relatif, autre protocole, adresse vide après le protocole).
    #[must_use]
    pub fn in_link(target: &str) -> Option<Self> {
        let target = target
            .strip_prefix('<')
            .and_then(|t| t.strip_suffix('>'))
            .unwrap_or(target);
        let lower = target.to_ascii_lowercase();
        let scheme = SCHEMES.iter().find(|scheme| lower.starts_with(*scheme))?;
        let rest = &target[scheme.len()..];
        let clean =
            !rest.is_empty() && !target.chars().any(|c| c.is_whitespace() || c.is_control());
        clean.then(|| Self(target.to_owned()))
    }

    /// L'adresse, telle qu'écrite dans la note.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address(target: &str) -> Option<String> {
        WebAddress::in_link(target).map(|a| a.as_str().to_owned())
    }

    #[test]
    fn web_and_mail_addresses_are_recognised() {
        for target in [
            "https://example.com/a?b=1#c",
            "http://example.com",
            "HTTPS://EXAMPLE.COM",
            "mailto:moi@example.com",
        ] {
            assert_eq!(address(target).as_deref(), Some(target), "{target}");
        }
    }

    #[test]
    fn angle_brackets_around_the_address_are_removed() {
        assert_eq!(
            address("<https://example.com/a>").as_deref(),
            Some("https://example.com/a")
        );
    }

    #[test]
    fn other_targets_are_not_web_addresses() {
        for target in [
            "achats.assets/a.pdf",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://",
            "mailto:",
            "https://exa mple.com",
            "https://example.com/\n",
            "https://example.com/\u{7}",
            "ftp://example.com",
            "",
            "<https://example.com",
        ] {
            assert_eq!(address(target), None, "{target:?}");
        }
    }
}
