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
//   malorean-voice listen <langue>   (arrêt : une ligne "stop" sur l'entrée, ou sa fermeture)
//     → une ligne par événement : {"event": "preparing"} {"event": "listening"}
//       {"event": "provisional", "text": "..."} {"event": "fixed", "text": "..."}
//       {"event": "level", "value": 0.3} {"event": "failed", "reason": "<raison>"}
//       {"event": "ended"} (toujours la dernière, même après un échec)
//
// Raisons : systemTooOld, accessDenied, noMicrophone, languageUnsupported, languageDownload,
// stopped. Ce programme ne décide de rien d'autre : le texte provisoire en cours à l'arrêt, le
// silence de trente secondes et les messages sont en Rust. Le premier clic fait demander l'accès au
// micro par macOS (texte de `voice-Info.plist`, lié au programme).

import AVFoundation
import Foundation
import Speech

let output = NSLock()

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

@available(macOS 26.0, *)
func language(_ name: String) async -> Locale? {
    await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: name))
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
    var system: Any = NSNull()
    for preferred in Locale.preferredLanguages {
        if let locale = await language(preferred) {
            system = identifier(locale)
            break
        }
    }
    send([
        "system": system,
        "access": accessName(AVCaptureDevice.authorizationStatus(for: .audio)),
        "languages": languages,
    ])
}

/// Télécharge le modèle de la langue s'il manque ; rend la raison de l'échec sinon.
@available(macOS 26.0, *)
func prepare(_ transcriber: SpeechTranscriber, announcing: Bool) async -> String? {
    do {
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            if announcing { event("preparing") }
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
    if let reason = await prepare(transcriber, announcing: false) {
        send(["failed": reason])
    } else {
        send(["ready": true])
    }
}

/// Une écoute : le micro vers l'analyseur, les résultats vers la sortie.
@available(macOS 26.0, *)
final class Listener: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let stopped = AsyncStream<Void>.makeStream()
    private var lastLevel = Date.distantPast

    /// Demande l'arrêt, d'où que ce soit (entrée fermée, échec du moteur).
    func stop() { stopped.continuation.yield() }

    /// Échoue pour cette raison : dit pourquoi, puis arrête.
    func fail(_ reason: String) {
        event("failed", ["reason": reason])
        stop()
    }

    private func microphone() async -> String? {
        var status = AVCaptureDevice.authorizationStatus(for: .audio)
        if status == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            status = AVCaptureDevice.authorizationStatus(for: .audio)
        }
        guard status == .authorized else { return "accessDenied" }
        return AVCaptureDevice.default(for: .audio) == nil ? "noMicrophone" : nil
    }

    /// Le niveau sonore du tampon, de 0 à 1 (échelle en décibels), au plus dix fois par seconde.
    private func level(of buffer: AVAudioPCMBuffer) {
        guard Date().timeIntervalSince(lastLevel) > 0.1, let channel = buffer.floatChannelData?[0]
        else { return }
        lastLevel = Date()
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += channel[index] * channel[index] }
        let rms = count > 0 ? (sum / Float(count)).squareRoot() : 0
        let decibels = 20 * log10(max(rms, 0.00001))
        let value = min(1, max(0, (decibels + 50) / 50))
        event("level", ["value": (Double(value) * 100).rounded() / 100])
    }

    private func convert(
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

    func run(_ name: String) async {
        defer { event("ended") }
        if let reason = await microphone() { return event("failed", ["reason": reason]) }
        guard let locale = await language(name) else {
            return event("failed", ["reason": "languageUnsupported"])
        }
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        if let reason = await prepare(transcriber, announcing: true) {
            return event("failed", ["reason": reason])
        }
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard
            let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        else { return event("failed", ["reason": "stopped"]) }
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        do { try await analyzer.start(inputSequence: stream) } catch {
            return event("failed", ["reason": "stopped"])
        }

        let input = engine.inputNode
        let micFormat = input.outputFormat(forBus: 0)
        guard micFormat.sampleRate > 0, let converter = AVAudioConverter(from: micFormat, to: format)
        else { return event("failed", ["reason": "noMicrophone"]) }
        input.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [self] buffer, _ in
            level(of: buffer)
            if let converted = convert(buffer, with: converter, to: format) {
                continuation.yield(AnalyzerInput(buffer: converted))
            }
        }
        // Le micro débranché ou changé pendant l'écoute.
        let observer = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
        ) { [self] _ in fail("noMicrophone") }
        engine.prepare()
        do { try engine.start() } catch {
            input.removeTap(onBus: 0)
            return event("failed", ["reason": "noMicrophone"])
        }
        event("listening")

        let reading = Task { [self] in
            do {
                for try await result in transcriber.results {
                    let kind = result.isFinal ? "fixed" : "provisional"
                    event(kind, ["text": String(result.text.characters)])
                }
            } catch { fail("stopped") }
            stop()
        }
        for await _ in stopped.stream { break }
        NotificationCenter.default.removeObserver(observer)
        engine.stop()
        input.removeTap(onBus: 0)
        continuation.finish()
        try? await analyzer.finalizeAndFinishThroughEndOfInput()
        await reading.value
    }
}

@main
struct Voice {
    static func main() async {
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
            await listener.run(name)
        default:
            send(["unavailable": "unknownCommand"])
        }
    }
}
