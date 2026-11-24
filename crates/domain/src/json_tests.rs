use super::*;

fn parsed(text: &str) -> Json {
    Json::parse(text).unwrap()
}

#[test]
fn a_document_is_read_with_its_fields_in_order_and_numbers_as_written() {
    let json = parsed(r#" {"b": 1.50, "a": [true, false, null, -0, 2e+3], "c": {}} "#);
    assert_eq!(
        json,
        Json::Object(vec![
            ("b".into(), Json::Number("1.50".into())),
            (
                "a".into(),
                Json::Array(vec![
                    Json::Bool(true),
                    Json::Bool(false),
                    Json::Null,
                    Json::Number("-0".into()),
                    Json::Number("2e+3".into()),
                ])
            ),
            ("c".into(), Json::Object(vec![])),
        ])
    );
    assert_eq!(
        json.to_compact(),
        r#"{"b":1.50,"a":[true,false,null,-0,2e+3],"c":{}}"#
    );
}

#[test]
fn strings_are_decoded_and_written_like_json_stringify() {
    let json = parsed(r#""é\n\t\"\\\/\u00e9\ud83d\ude00\u0001""#);
    assert_eq!(json.as_str(), Some("é\n\t\"\\/é😀\u{1}"));
    assert_eq!(json.to_compact(), "\"é\\n\\t\\\"\\\\/é😀\\u0001\"");
    let all = Json::String("\r\u{8}\u{c}".into());
    assert_eq!(all.to_compact(), "\"\\r\\b\\f\"");
}

#[test]
fn a_leading_bom_is_ignored() {
    assert_eq!(parsed("\u{feff}{}"), Json::Object(vec![]));
}

#[test]
fn a_field_is_found_by_its_name_in_an_object_only() {
    let json = parsed(r#"{"a":"x"}"#);
    assert_eq!(json.get("a").and_then(Json::as_str), Some("x"));
    assert_eq!(json.get("b"), None);
    assert_eq!(Json::Null.get("a"), None);
    assert_eq!(Json::Null.as_str(), None);
}

#[test]
fn malformed_texts_are_refused_with_their_reason() {
    let deep = "[".repeat(200);
    let cases: [(&str, &str); 21] = [
        ("{} x", "texte après la valeur"),
        ("{\"a\" 1}", "deux-points attendu"),
        ("{\"a\":1,}", "chaîne attendue"),
        ("[1,]", "valeur attendue"),
        ("[1 2]", "virgule ou crochet attendu"),
        ("{\"a\":1 \"b\"", "virgule ou accolade attendue"),
        ("\"abc", "chaîne non fermée"),
        ("\"a\nb\"", "caractère de contrôle dans une chaîne"),
        ("\"\\x\"", "échappement inconnu"),
        ("\"\\", "échappement coupé"),
        ("\"\\u12\"", "code Unicode attendu"),
        ("\"\\ud83d\"", "seconde moitié de paire attendue"),
        ("\"\\ud83d\\u0041\"", "seconde moitié de paire fausse"),
        ("\"\\udc00\"", "code Unicode seul"),
        ("tru", "mot inconnu"),
        ("-", "chiffre attendu"),
        ("1.", "chiffre attendu"),
        ("1e", "chiffre attendu"),
        ("01x", "texte après la valeur"),
        (&deep, "imbrication trop profonde"),
        ("", "valeur attendue"),
    ];
    for (text, reason) in cases {
        assert_eq!(Json::parse(text).unwrap_err().reason, reason, "{text}");
    }
}

#[test]
fn an_error_says_where_it_is() {
    assert_eq!(Json::parse("").unwrap_err().position, 0);
    assert_eq!(
        Json::parse("[").unwrap_err().to_string(),
        "valeur attendue (caractère 1)"
    );
}

#[test]
fn nesting_is_limited_for_arrays_and_for_objects() {
    let arrays = |n: usize| format!("{}{}", "[".repeat(n), "]".repeat(n));
    let objects = |n: usize| format!("{}1{}", "{\"a\":".repeat(n), "}".repeat(n));
    assert!(Json::parse(&arrays(129)).is_ok());
    assert!(Json::parse(&arrays(130)).is_err());
    assert!(Json::parse(&objects(128)).is_ok());
    assert!(Json::parse(&objects(129)).is_err());
}

#[test]
fn every_short_escape_is_decoded() {
    assert_eq!(parsed(r#""\b\f\n\r\t""#).as_str(), Some("\u{8}\u{c}\n\r\t"));
}

#[test]
fn spaces_and_commas_between_items_are_skipped() {
    let json = parsed(" [ 1 ,\n2\t, \r\n 3 ] ");
    assert_eq!(json.to_compact(), "[1,2,3]");
    let object = parsed(" { \"a\" : [ 1 , 2 ] , \"b\" : \"x\" } ");
    assert_eq!(object.to_compact(), r#"{"a":[1,2],"b":"x"}"#);
}
