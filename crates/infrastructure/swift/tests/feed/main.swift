// Vérifie `Feed` (swift/voice.swift), le tampon entre le micro et l'analyseur (fiche 0107) :
// le son capté pendant que le modèle se prépare n'est pas perdu, et « listening » sort une seule
// fois, au bon moment. Joué par `crates/infrastructure/tests/swift_feed.rs` ; écrit « ok » si tout
// passe, sinon une ligne par échec et un code de sortie non nul.

import AVFoundation
import Foundation

var failures = 0

func check(_ condition: Bool, _ message: String) {
    if !condition {
        failures += 1
        print("ÉCHEC : \(message)")
    }
}

let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 1, interleaved: false)!

/// Un tampon de 100 trames dont toutes les valeurs sont `marker` (pour le reconnaître plus loin).
func buffer(_ marker: Float) -> AVAudioPCMBuffer {
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 100)!
    buffer.frameLength = 100
    for index in 0..<100 { buffer.floatChannelData![0][index] = marker }
    return buffer
}

/// Ce que le feed a annoncé et envoyé.
final class Log: @unchecked Sendable {
    var announced = 0
    var measured: [Float] = []
    var delivered: [Float] = []
    var order: [String] = []
}

func makeFeed(_ log: Log) -> Feed {
    Feed(
        announce: {
            log.announced += 1
            log.order.append("listening")
        },
        measure: { log.measured.append($0.floatChannelData![0][0]) }
    )
}

func deliver(_ log: Log) -> (AVAudioPCMBuffer) -> Void {
    { buffer in
        log.delivered.append(buffer.floatChannelData![0][0])
        log.order.append("analyseur")
    }
}

// 1. Le son capté avant que l'analyseur soit prêt lui est envoyé, dans l'ordre, sans rien perdre.
do {
    let log = Log()
    let feed = makeFeed(log)
    feed.clearToAnnounce()
    for marker in [1, 2, 3] as [Float] { feed.receive(buffer(marker)) }
    check(log.delivered.isEmpty, "rien n'est envoyé avant l'ouverture")
    let waiting = feed.open(deliver: deliver(log))
    check(waiting == 3, "trois tampons attendaient, \(waiting) trouvés")
    check(log.delivered == [1, 2, 3], "ordre et contenu gardés : \(log.delivered)")
    feed.receive(buffer(4))
    check(log.delivered == [1, 2, 3, 4], "le son suivant passe directement : \(log.delivered)")
}

// 2. « listening » sort au premier son, une seule fois, avant le niveau sonore.
do {
    let log = Log()
    let feed = makeFeed(log)
    feed.clearToAnnounce()
    check(log.announced == 0, "pas d'annonce sans son capté")
    feed.receive(buffer(1))
    feed.receive(buffer(2))
    check(log.announced == 1, "une seule annonce : \(log.announced)")
    check(log.measured == [1, 2], "le niveau est mesuré une fois l'écoute annoncée")
}

// 3. Tant que le modèle n'est pas prêt, ni annonce ni niveau ; l'annonce vient dès qu'il l'est.
do {
    let log = Log()
    let feed = makeFeed(log)
    feed.receive(buffer(1))
    check(log.announced == 0 && log.measured.isEmpty, "rien n'est annoncé avant que le modèle soit prêt")
    feed.clearToAnnounce()
    check(log.announced == 1, "annoncé dès que le modèle est prêt, le son étant déjà capté")
    feed.clearToAnnounce()
    check(log.announced == 1, "annoncé une seule fois")
}

// 4. Pendant le téléchargement du modèle, le son n'est pas gardé ; ensuite il l'est.
do {
    let log = Log()
    let feed = makeFeed(log)
    feed.receive(buffer(1))
    feed.pauseKeeping()
    feed.receive(buffer(2))
    feed.receive(buffer(3))
    feed.resumeKeeping()
    feed.receive(buffer(4))
    feed.clearToAnnounce()
    let waiting = feed.open(deliver: deliver(log))
    check(waiting == 1, "seul le son d'après le téléchargement attend : \(waiting)")
    check(log.delivered == [4], "contenu : \(log.delivered)")
}

// 5. Le tampon gardé est une copie : le micro peut réutiliser le sien.
do {
    let log = Log()
    let feed = makeFeed(log)
    let reused = buffer(7)
    feed.receive(reused)
    reused.floatChannelData![0][0] = 99
    feed.open(deliver: deliver(log))
    check(log.delivered == [7], "le tampon gardé n'est pas celui du micro : \(log.delivered)")
}

// 6. À l'ouverture, ce qui attendait part avant tout nouveau tampon (l'ordre ne s'inverse pas).
do {
    let log = Log()
    let feed = makeFeed(log)
    feed.clearToAnnounce()
    feed.receive(buffer(1))
    feed.open(deliver: deliver(log))
    feed.receive(buffer(2))
    check(log.order == ["listening", "analyseur", "analyseur"], "ordre des effets : \(log.order)")
    check(log.delivered == [1, 2], "ordre des tampons : \(log.delivered)")
}

// 7. Le format du micro est gardé pour la conversion.
do {
    let feed = makeFeed(Log())
    check(feed.format == nil, "pas de format avant le micro")
    feed.setFormat(format)
    check(feed.format == format, "le format du micro est gardé")
}

if failures == 0 {
    print("ok")
} else {
    exit(1)
}
