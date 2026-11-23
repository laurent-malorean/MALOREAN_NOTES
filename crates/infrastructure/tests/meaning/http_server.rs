//! Un serveur HTTP minimal, local, pour jouer le téléchargement sans jamais joindre le vrai
//! réseau : il répond à chaque requête selon le bout d'adresse (le nom du fichier) demandé.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

/// Ce que répond le serveur.
#[derive(Debug, Clone)]
pub(crate) enum Reply {
    /// 200 avec ce contenu entier.
    Body(Vec<u8>),
    /// 200 qui annonce `declared` octets, en envoie `sent` puis coupe la connexion.
    Cut { declared: usize, sent: Vec<u8> },
    /// 200 sans taille annoncée : le contenu s'arrête quand la connexion se ferme.
    Unsized(Vec<u8>),
    /// Ce code d'erreur, sans contenu.
    Status(u16),
}

type Routes = Arc<Mutex<Vec<(String, Reply)>>>;

/// Le serveur, arrêté quand on le lâche.
pub(crate) struct Server {
    address: String,
    routes: Routes,
    hits: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

fn answer(stream: &mut TcpStream, routes: &Routes, hits: &Mutex<Vec<String>>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request = String::new();
    reader.read_line(&mut request).unwrap();
    let path = request.split_whitespace().nth(1).unwrap_or("").to_owned();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
            break;
        }
    }
    hits.lock().unwrap().push(path.clone());
    let reply = routes
        .lock()
        .unwrap()
        .iter()
        .find(|(suffix, _)| path.ends_with(suffix.as_str()))
        .map(|(_, reply)| reply.clone());
    // Une écriture qui échoue : le client a raccroché (il interrompt) ; ce n'est pas une erreur.
    match reply.unwrap_or(Reply::Status(404)) {
        Reply::Body(body) => {
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(head.as_bytes()).ok();
            stream.write_all(&body).ok();
        }
        Reply::Cut { declared, sent } => {
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {declared}\r\nConnection: close\r\n\r\n"
            );
            stream.write_all(head.as_bytes()).ok();
            stream.write_all(&sent).ok();
        }
        Reply::Unsized(body) => {
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                .ok();
            stream.write_all(&body).ok();
        }
        Reply::Status(code) => {
            let head =
                format!("HTTP/1.1 {code} Erreur\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            stream.write_all(head.as_bytes()).ok();
        }
    }
    stream.flush().ok();
}

impl Server {
    /// Démarre un serveur : une requête dont l'adresse finit par un des bouts reçoit sa réponse,
    /// les autres un 404.
    pub(crate) fn start(routes: Vec<(String, Reply)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let routes: Routes = Arc::new(Mutex::new(routes));
        let hits = Arc::new(Mutex::new(vec![]));
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let (routes, hits, stop) = (Arc::clone(&routes), Arc::clone(&hits), Arc::clone(&stop));
            thread::spawn(move || {
                for stream in listener.incoming() {
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    answer(&mut stream.unwrap(), &routes, &hits);
                }
            })
        };
        Self {
            address,
            routes,
            hits,
            stop,
            thread: Some(thread),
        }
    }

    /// L'adresse de base, à la place de `https://huggingface.co`.
    pub(crate) fn base(&self) -> String {
        self.address.clone()
    }

    /// Change la réponse d'un bout d'adresse.
    pub(crate) fn reply(&self, suffix: &str, reply: Reply) {
        let mut routes = self.routes.lock().unwrap();
        routes.retain(|(known, _)| known != suffix);
        routes.push((suffix.to_owned(), reply));
    }

    /// Les adresses demandées jusqu'ici, dans l'ordre.
    pub(crate) fn hits(&self) -> Vec<String> {
        self.hits.lock().unwrap().clone()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Une connexion pour sortir le serveur de son attente.
        TcpStream::connect(self.address.trim_start_matches("http://")).ok();
        if let Some(thread) = self.thread.take() {
            thread.join().ok();
        }
    }
}
