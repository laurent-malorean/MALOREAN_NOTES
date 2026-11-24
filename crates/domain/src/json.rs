//! Un petit lecteur et écrivain de JSON qui garde l'ordre des champs et le texte exact des nombres :
//! ce qu'il faut au canvas (fiche 0052) pour réécrire sans changement ce qu'il n'a pas modifié, y compris
//! les propriétés qu'il ne connaît pas.

use std::fmt;

/// Une valeur JSON.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Json {
    /// `null`.
    Null,
    /// `true` ou `false`.
    Bool(bool),
    /// Un nombre, tel qu'il est écrit.
    Number(String),
    /// Une chaîne, décodée.
    String(String),
    /// Un tableau.
    Array(Vec<Json>),
    /// Un objet : ses champs, dans l'ordre du texte.
    Object(Vec<(String, Json)>),
}

/// Le texte n'est pas du JSON : ce qui est faux et la position (en caractères) où cela manque.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonError {
    /// Ce qui a été trouvé de faux.
    pub reason: &'static str,
    /// Le rang du caractère fautif.
    pub position: usize,
}

impl fmt::Display for JsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} (caractère {})", self.reason, self.position)
    }
}

impl std::error::Error for JsonError {}

const MAX_DEPTH: usize = 128;

impl Json {
    /// Le JSON du texte `text` (un BOM au début est ignoré).
    ///
    /// # Errors
    ///
    /// [`JsonError`] si le texte n'est pas un document JSON bien formé.
    pub fn parse(text: &str) -> Result<Self, JsonError> {
        let text = text.strip_prefix('\u{feff}').unwrap_or(text);
        let mut reader = Reader {
            chars: text.chars().collect(),
            at: 0,
        };
        let value = reader.value(0)?;
        reader.skip_space();
        if reader.at < reader.chars.len() {
            return Err(reader.error("texte après la valeur"));
        }
        Ok(value)
    }

    /// Le champ `key` d'un objet ; rien si ce n'est pas un objet ou si le champ manque.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Self::Object(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Le texte si c'est une chaîne.
    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(text) => Some(text),
            _ => None,
        }
    }

    /// L'écriture compacte (sans espace) de la valeur.
    #[must_use]
    pub fn to_compact(&self) -> String {
        let mut out = String::new();
        self.write_compact(&mut out);
        out
    }

    /// Ajoute l'écriture compacte de la valeur à `out`.
    pub fn write_compact(&self, out: &mut String) {
        match self {
            Self::Null => out.push_str("null"),
            Self::Bool(true) => out.push_str("true"),
            Self::Bool(false) => out.push_str("false"),
            Self::Number(text) => out.push_str(text),
            Self::String(text) => write_string(text, out),
            Self::Array(items) => {
                out.push('[');
                for (rank, item) in items.iter().enumerate() {
                    if rank > 0 {
                        out.push(',');
                    }
                    item.write_compact(out);
                }
                out.push(']');
            }
            Self::Object(fields) => {
                out.push('{');
                for (rank, (key, value)) in fields.iter().enumerate() {
                    if rank > 0 {
                        out.push(',');
                    }
                    write_string(key, out);
                    out.push(':');
                    value.write_compact(out);
                }
                out.push('}');
            }
        }
    }
}

/// Écrit `text` comme `JSON.stringify` : seuls les guillemets, l'antislash et les caractères de
/// contrôle sont échappés ; les accents restent tels quels.
pub fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

struct Reader {
    chars: Vec<char>,
    at: usize,
}

impl Reader {
    fn error(&self, reason: &'static str) -> JsonError {
        JsonError {
            reason,
            position: self.at,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.at).copied()
    }

    fn skip_space(&mut self) {
        while matches!(self.peek(), Some(' ' | '\t' | '\n' | '\r')) {
            self.at += 1;
        }
    }

    fn expect(&mut self, wanted: char, reason: &'static str) -> Result<(), JsonError> {
        if self.peek() == Some(wanted) {
            self.at += 1;
            Ok(())
        } else {
            Err(self.error(reason))
        }
    }

    fn word(&mut self, word: &str, value: Json) -> Result<Json, JsonError> {
        for expected in word.chars() {
            self.expect(expected, "mot inconnu")?;
        }
        Ok(value)
    }

    fn value(&mut self, depth: usize) -> Result<Json, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.error("imbrication trop profonde"));
        }
        self.skip_space();
        match self.peek() {
            Some('{') => self.object(depth),
            Some('[') => self.array(depth),
            Some('"') => self.string().map(Json::String),
            Some('t') => self.word("true", Json::Bool(true)),
            Some('f') => self.word("false", Json::Bool(false)),
            Some('n') => self.word("null", Json::Null),
            Some('-' | '0'..='9') => self.number(),
            _ => Err(self.error("valeur attendue")),
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.at += 1;
        let mut fields = Vec::new();
        self.skip_space();
        if self.peek() == Some('}') {
            self.at += 1;
            return Ok(Json::Object(fields));
        }
        loop {
            self.skip_space();
            let key = self.string()?;
            self.skip_space();
            self.expect(':', "deux-points attendu")?;
            let value = self.value(depth + 1)?;
            fields.push((key, value));
            self.skip_space();
            match self.peek() {
                Some(',') => self.at += 1,
                Some('}') => {
                    self.at += 1;
                    return Ok(Json::Object(fields));
                }
                _ => return Err(self.error("virgule ou accolade attendue")),
            }
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.at += 1;
        let mut items = Vec::new();
        self.skip_space();
        if self.peek() == Some(']') {
            self.at += 1;
            return Ok(Json::Array(items));
        }
        loop {
            items.push(self.value(depth + 1)?);
            self.skip_space();
            match self.peek() {
                Some(',') => self.at += 1,
                Some(']') => {
                    self.at += 1;
                    return Ok(Json::Array(items));
                }
                _ => return Err(self.error("virgule ou crochet attendu")),
            }
        }
    }

    fn number(&mut self) -> Result<Json, JsonError> {
        let start = self.at;
        if self.peek() == Some('-') {
            self.at += 1;
        }
        match self.peek() {
            Some('0') => self.at += 1,
            Some('1'..='9') => self.digits(),
            _ => return Err(self.error("chiffre attendu")),
        }
        if self.peek() == Some('.') {
            self.at += 1;
            self.some_digits()?;
        }
        if matches!(self.peek(), Some('e' | 'E')) {
            self.at += 1;
            if matches!(self.peek(), Some('+' | '-')) {
                self.at += 1;
            }
            self.some_digits()?;
        }
        Ok(Json::Number(self.chars[start..self.at].iter().collect()))
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some('0'..='9')) {
            self.at += 1;
        }
    }

    fn some_digits(&mut self) -> Result<(), JsonError> {
        if !matches!(self.peek(), Some('0'..='9')) {
            return Err(self.error("chiffre attendu"));
        }
        self.digits();
        Ok(())
    }

    fn string(&mut self) -> Result<String, JsonError> {
        self.expect('"', "chaîne attendue")?;
        let mut text = String::new();
        loop {
            let c = self.peek().ok_or_else(|| self.error("chaîne non fermée"))?;
            if (c as u32) < 0x20 {
                return Err(self.error("caractère de contrôle dans une chaîne"));
            }
            self.at += 1;
            match c {
                '"' => return Ok(text),
                '\\' => text.push(self.escape()?),
                c => text.push(c),
            }
        }
    }

    fn escape(&mut self) -> Result<char, JsonError> {
        let c = self.peek().ok_or_else(|| self.error("échappement coupé"))?;
        self.at += 1;
        Ok(match c {
            '"' => '"',
            '\\' => '\\',
            '/' => '/',
            'b' => '\u{8}',
            'f' => '\u{c}',
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            'u' => self.unicode()?,
            _ => return Err(self.error("échappement inconnu")),
        })
    }

    fn hex4(&mut self) -> Result<u32, JsonError> {
        let mut code = 0;
        for _ in 0..4 {
            let digit = self
                .peek()
                .and_then(|c| c.to_digit(16))
                .ok_or_else(|| self.error("code Unicode attendu"))?;
            code = code * 16 + digit;
            self.at += 1;
        }
        Ok(code)
    }

    fn unicode(&mut self) -> Result<char, JsonError> {
        let first = self.hex4()?;
        if !(0xD800..0xDC00).contains(&first) {
            return char::from_u32(first).ok_or_else(|| self.error("code Unicode seul"));
        }
        self.expect('\\', "seconde moitié de paire attendue")?;
        self.expect('u', "seconde moitié de paire attendue")?;
        let second = self.hex4()?;
        if !(0xDC00..0xE000).contains(&second) {
            return Err(self.error("seconde moitié de paire fausse"));
        }
        char::from_u32(0x10000 + ((first - 0xD800) << 10) + (second - 0xDC00))
            .ok_or_else(|| self.error("code Unicode faux"))
    }
}

#[cfg(test)]
#[path = "json_tests.rs"]
mod tests;
