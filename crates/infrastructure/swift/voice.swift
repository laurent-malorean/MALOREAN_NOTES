// Assistant Swift de la saisie vocale (fiche 0103) : SpeechAnalyzer d'Apple (macOS 26) écoute le
// micro et transcrit sur le Mac. Le son n'est ni envoyé ni écrit sur le disque : seul le texte
// reconnu sort. Rust le lance et lui parle en lignes JSON.
//
//   malorean-voice status
//     → {"unavailable": "systemTooOld"}
//     | {"system": "fr-FR" | null, "access": "allowed" | "denied" | "undecided",
//        "languages": [{"id": "fr-FR", "name": "français (France)", "ready": true}, ...]}
//   malorean-voice prepare <langue>
//     → {"ready": true} | {"failed": "<raison>"}
//   malorean-voice listen [langue]   (arrêt : une ligne "stop" sur l'entrée, ou sa fermeture ;
//     sans langue, c'est celle du Mac : la première des langues préférées que macOS sait transcrire)
//     → une ligne par événement : {"event": "preparing"} {"event": "listening"}
//       {"event": "provisional", "text": "..."} {"event": "fixed", "text": "..."}
//       {"event": "level", "value": 0.3} {"event": "failed", "reason": "<raison>"}
//       {"event": "ended"} (toujours la dernière, même après un échec)
//     « preparing » : seulement si le modèle de la langue n'est pas sur le Mac (téléchargement) ;
//     « listening » : le micro a capté un son et le modèle est prêt à servir. Le micro s'ouvre
//     pendant que le modèle se prépare, le son dit entre-temps n'est pas perdu (fiche 0108).
//     Avec MALOREAN_VOICE_TRACE=1, chaque étape écrit son temps sur la sortie d'erreur.
//
// Raisons : systemTooOld, accessDenied, noMicrophone, languageUnsupported, languageDownload,
// stopped. Ce programme ne décide de rien d'autre : le texte provisoire en cours à l'arrêt, le
// silence de trente secondes et les messages sont en Rust. Le premier clic fait demander l'accès au
// micro par macOS (texte de `voice-Info.plist`, lié au programme).

import AVFoundation
import Foundation
import Speech

let output = NSLock()

/// Mesure du démarrage (fiche 0107) : avec `MALOREAN_VOICE_TRACE=1`, chaque étape écrit sur la
/// sortie d'erreur le temps passé depuis le lancement du programme. Sans cette variable, rien.
let traceEnabled = ProcessInfo.processInfo.environment["MALOREAN_VOICE_TRACE"] != nil
let traceStart = DispatchTime.now().uptimeNanoseconds

func trace(_ stage: String) {
    guard traceEnabled else { return }
    let start = traceStart
    let milliseconds = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    FileHandle.standardError.write(Data("[trace] \(String(format: "%7.1f", milliseconds)) ms  \(stage)\n".utf8))
}

/// Écrit une ligne JSON sur la sortie, d'un seul tenant (plusieurs fils écrivent).
func send(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    else { return }
    output.lock()
    FileHandle.standardOutput.write(data + Data([0x0A]))
    output.unlock()
}

func event(_ name: String, _ fields: [String: Any] = [:]) {
    send(fields.merging(["event": name]) { _, new in new })
}

/// L'identifiant d'une langue, tel que Rust le garde (`fr-FR`).
@available(macOS 26.0, *)
func identifier(_ locale: Locale) -> String {
    locale.identifier(.bcp47)
}

func accessName(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "allowed"
    case .notDetermined: return "undecided"
    default: return "denied"
    }
}

/// La langue demandée, ou, sans nom, la langue du Mac : la première des langues préférées que
/// macOS sait transcrire.
@available(macOS 26.0, *)
func language(_ name: String?) async -> Locale? {
    if let name {
        return await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: name))
    }
    for preferred in Locale.preferredLanguages {
        if let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: preferred)) {
            return locale
        }
    }
    return nil
}

@available(macOS 26.0, *)
func status() async {
    let installed = Set(await SpeechTranscriber.installedLocales.map(identifier))
    let languages = await SpeechTranscriber.supportedLocales
        .map { locale -> [String: Any] in
            let id = identifier(locale)
            let name = Locale.current.localizedString(forIdentifier: id) ?? id
            return ["id": id, "name": name, "ready": installed.contains(id)]
        }
        .sorted { ($0["name"] as? String ?? "").localizedCompare($1["name"] as? String ?? "") == .orderedAscending }
    let system: Any = await language(nil).map(identifier) ?? NSNull()
    send([
        "system": system,
        "access": accessName(AVCaptureDevice.authorizationStatus(for: .audio)),
        "languages": languages,
    ])
}

/// Télécharge le modèle de la langue s'il manque ; rend la raison de l'échec sinon.
@available(macOS 26.0, *)
func prepare(_ transcriber: SpeechTranscriber) async -> String? {
    do {
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
        return nil
    } catch {
        return "languageDownload"
    }
}

@available(macOS 26.0, *)
func prepareCommand(_ name: String) async {
    guard let locale = await language(name) else {
        send(["failed": "languageUnsupported"])
        return
    }
    let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
    if let reason = await prepare(transcriber) {
        send(["failed": reason])
    } else {
        send(["ready": true])
    }
}

/// Le son du micro sur son chemin vers l'analyseur. Le micro s'ouvre tout de suite, pendant que le
/// modèle se prépare : ce qui est dit entre-temps attend ici, puis part à l'analyseur dès qu'il
/// est prêt (fiche 0107), dans l'ordre et sans rien perdre. C'est aussi lui qui annonce
/// « listening », au premier son réellement capté et une fois le modèle prêt à servir. Il ne
/// connaît ni l'analyseur ni la sortie : tout lui est donné, ce qui le rend vérifiable seul
/// (`swift/tests/feed/main.swift`, joué par `tests/swift_feed.rs`).
final class Feed: @unchecked Sendable {
    private let lock = NSLock()
    private let announce: () -> Void
    private let measure: (AVAudioPCMBuffer) -> Void
    private var backlog: [AVAudioPCMBuffer] = []
    private var deliver: ((AVAudioPCMBuffer) -> Void)?
    private var keeping = true
    private var captured = false
    private var cleared = false
    private var announced = false
    private var microphoneFormat: AVAudioFormat?

    /// `announce` : dire « listening » ; `measure` : le niveau sonore d'un tampon, appelé une fois
    /// l'écoute annoncée seulement.
    init(announce: @escaping () -> Void, measure: @escaping (AVAudioPCMBuffer) -> Void) {
        self.announce = announce
        self.measure = measure
    }

    var format: AVAudioFormat? {
        lock.lock()
        defer { lock.unlock() }
        return microphoneFormat
    }

    func setFormat(_ format: AVAudioFormat) {
        lock.lock()
        microphoneFormat = format
        lock.unlock()
    }

    /// Un tampon sorti du micro : il est annoncé, mesuré, puis gardé ou envoyé.
    func receive(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        defer { lock.unlock() }
        captured = true
        announceIfReady()
        if announced { measure(buffer) }
        if let deliver {
            deliver(buffer)
        } else if keeping, let copy = Feed.copy(of: buffer) {
            backlog.append(copy)
        }
    }

    /// Le modèle se télécharge : ce qui est dit pendant ce temps n'est pas gardé.
    func pauseKeeping() {
        lock.lock()
        keeping = false
        backlog.removeAll()
        lock.unlock()
    }

    func resumeKeeping() {
        lock.lock()
        keeping = true
        lock.unlock()
    }

    /// Le modèle est prêt à servir : « listening » peut sortir (tout de suite s'il y a du son).
    func clearToAnnounce() {
        lock.lock()
        cleared = true
        announceIfReady()
        lock.unlock()
    }

    /// L'analyseur est prêt : ce qui attendait lui est envoyé dans l'ordre, puis le son passe
    /// directement. Rend combien de tampons attendaient.
    @discardableResult
    func open(deliver target: @escaping (AVAudioPCMBuffer) -> Void) -> Int {
        lock.lock()
        defer { lock.unlock() }
        let waiting = backlog.count
        for buffer in backlog { target(buffer) }
        backlog.removeAll()
        deliver = target
        return waiting
    }

    private func announceIfReady() {
        guard captured, cleared, !announced else { return }
        announced = true
        announce()
    }

    /// Une copie du tampon : le micro peut réutiliser le sien pendant qu'il attend ici.
    private static func copy(of buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength),
            let source = buffer.floatChannelData, let target = copy.floatChannelData
        else { return nil }
        copy.frameLength = buffer.frameLength
        for channel in 0..<Int(buffer.format.channelCount) {
            target[channel].update(from: source[channel], count: Int(buffer.frameLength))
        }
        return copy
    }
}

/// Le tampon converti au format de l'analyseur ; rien si la conversion échoue.
func convert(
    _ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter, to format: AVAudioFormat
) -> AVAudioPCMBuffer? {
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
    guard let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
        return nil
    }
    var delivered = false
    var error: NSError?
    converter.convert(to: converted, error: &error) { _, status in
        if delivered {
            status.pointee = .noDataNow
            return nil
        }
        delivered = true
        status.pointee = .haveData
        return buffer
    }
    return error == nil && converted.frameLength > 0 ? converted : nil
}

/// Dit le niveau sonore du tampon, de 0 à 1 (échelle en décibels), au plus dix fois par seconde.
final class Gauge: @unchecked Sendable {
    let lock = NSLock()
    var last = Date.distantPast
}

let gauge = Gauge()

func levelEvent(_ buffer: AVAudioPCMBuffer) {
    gauge.lock.lock()
    defer { gauge.lock.unlock() }
    guard Date().timeIntervalSince(gauge.last) > 0.1, let channel = buffer.floatChannelData?[0]
    else { return }
    gauge.last = Date()
    let count = Int(buffer.frameLength)
    var sum: Float = 0
    for index in 0..<count { sum += channel[index] * channel[index] }
    let rms = count > 0 ? (sum / Float(count)).squareRoot() : 0
    let decibels = 20 * log10(max(rms, 0.00001))
    let value = min(1, max(0, (decibels + 50) / 50))
    event("level", ["value": (Double(value) * 100).rounded() / 100])
}

/// Ce que la préparation du modèle rend : de quoi analyser, ou la raison de l'échec.
@available(macOS 26.0, *)
struct Recognition {
    let transcriber: SpeechTranscriber
    let analyzer: SpeechAnalyzer
    let format: AVAudioFormat
    let input: AsyncStream<AnalyzerInput>.Continuation
}

/// Une écoute : le micro vers l'analyseur, les résultats vers la sortie.
@available(macOS 26.0, *)
final class Listener: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let stopped = AsyncStream<Void>.makeStream()
    private let feed = Feed(
        announce: {
            trace("listening annoncé")
            event("listening")
        },
        measure: levelEvent
    )
    private var observer: NSObjectProtocol?
    private var tapInstalled = false

    /// Demande l'arrêt, d'où que ce soit (entrée fermée, échec du moteur).
    func stop() { stopped.continuation.yield() }

    /// Échoue pour cette raison : dit pourquoi, puis arrête.
    func fail(_ reason: String) {
        event("failed", ["reason": reason])
        stop()
    }

    /// Ouvre le micro : l'accès (demandé à macOS au premier clic), le moteur audio, le tampon.
    /// Rend la raison de l'échec. Le micro par défaut n'est pas cherché à part (cela coûte près de
    /// 0,2 s) : sans micro, le format de l'entrée est vide ou le moteur refuse de démarrer.
    private func openMicrophone() async -> String? {
        var status = AVCaptureDevice.authorizationStatus(for: .audio)
        if status == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            status = AVCaptureDevice.authorizationStatus(for: .audio)
        }
        guard status == .authorized else { return "accessDenied" }
        trace("micro : accès accordé")
        let input = engine.inputNode
        trace("micro : inputNode")
        let format = input.outputFormat(forBus: 0)
        trace("micro : format lu")
        guard format.sampleRate > 0, format.channelCount > 0 else { return "noMicrophone" }
        feed.setFormat(format)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [feed] buffer, _ in
            feed.receive(buffer)
        }
        tapInstalled = true
        trace("micro : tap posé")
        // Le micro débranché ou changé pendant l'écoute.
        observer = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
        ) { [self] _ in fail("noMicrophone") }
        engine.prepare()
        trace("micro : moteur préparé")
        do { try engine.start() } catch { return "noMicrophone" }
        trace("micro : moteur audio démarré")
        return nil
    }

    private func closeMicrophone() {
        guard tapInstalled else { return }
        tapInstalled = false
        if let observer { NotificationCenter.default.removeObserver(observer) }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
    }

    /// Prépare la reconnaissance, pendant que le micro s'ouvre : la langue, le modèle (téléchargé
    /// s'il manque : « preparing », sans garder le son), l'analyseur. Rend la raison de l'échec.
    private func prepareRecognition(_ name: String?) async -> (Recognition?, String?) {
        guard let locale = await language(name) else { return (nil, "languageUnsupported") }
        trace("langue trouvée")
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let installed = await SpeechTranscriber.installedLocales.map(identifier).contains(identifier(locale))
        trace("modèle : \(installed ? "installé" : "à télécharger")")
        if installed {
            // Rien à attendre : l'écoute peut être annoncée dès que le micro capte.
            feed.clearToAnnounce()
        } else {
            feed.pauseKeeping()
            event("preparing")
        }
        if let reason = await prepare(transcriber) { return (nil, reason) }
        trace("modèle prêt")
        feed.resumeKeeping()
        feed.clearToAnnounce()
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard
            let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        else { return (nil, "stopped") }
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        do { try await analyzer.start(inputSequence: stream) } catch { return (nil, "stopped") }
        trace("analyseur démarré")
        return (Recognition(transcriber: transcriber, analyzer: analyzer, format: format, input: continuation), nil)
    }

    func run(_ name: String?) async {
        defer { event("ended") }
        defer { closeMicrophone() }
        trace("écoute : début")
        // Le micro et le modèle se préparent en même temps (fiche 0107).
        async let microphone = openMicrophone()
        let (recognition, recognitionFailure) = await prepareRecognition(name)
        let microphoneFailure = await microphone
        guard let recognition, microphoneFailure == nil,
            let micFormat = feed.format,
            let converter = AVAudioConverter(from: micFormat, to: recognition.format)
        else { return event("failed", ["reason": microphoneFailure ?? recognitionFailure ?? "stopped"]) }
        let target = recognition.format
        let waiting = feed.open { buffer in
            if let converted = convert(buffer, with: converter, to: target) {
                recognition.input.yield(AnalyzerInput(buffer: converted))
            }
        }
        trace("analyseur ouvert : \(waiting) tampons en attente envoyés")

        let reading = Task { [self] in
            do {
                for try await result in recognition.transcriber.results {
                    let kind = result.isFinal ? "fixed" : "provisional"
                    event(kind, ["text": String(result.text.characters)])
                }
            } catch { fail("stopped") }
            stop()
        }
        for await _ in stopped.stream { break }
        closeMicrophone()
        recognition.input.finish()
        try? await recognition.analyzer.finalizeAndFinishThroughEndOfInput()
        await reading.value
    }
}

#if !FEED_TEST
@main
struct Voice {
    static func main() async {
        trace("lancé")
        let arguments = CommandLine.arguments
        let command = arguments.count > 1 ? arguments[1] : ""
        let name = arguments.count > 2 ? arguments[2] : ""
        guard #available(macOS 26.0, *) else {
            switch command {
            case "listen":
                event("failed", ["reason": "systemTooOld"])
                event("ended")
            case "prepare": send(["failed": "systemTooOld"])
            default: send(["unavailable": "systemTooOld"])
            }
            return
        }
        switch command {
        case "status": await status()
        case "prepare": await prepareCommand(name)
        case "listen":
            let listener = Listener()
            // L'arrêt : une ligne « stop », ou l'entrée fermée (l'application a quitté).
            Thread.detachNewThread {
                while let line = readLine() {
                    if line == "stop" { break }
                }
                listener.stop()
            }
            await listener.run(arguments.count > 2 ? name : nil)
        default:
            send(["unavailable": "unknownCommand"])
        }
    }
}
#endif
