// Essai isolé du pont de la saisie vocale (doc/specs/saisie-vocale.md § 10) : écoute le micro avec
// SpeechAnalyzer d'Apple et écrit dans le terminal ce qu'il entend. Aucun lien avec l'application.
//
// Usage : essai-saisie-vocale [langue, ex. fr-FR] [secondes d'écoute, 15 par défaut]
import AVFoundation
import Foundation
import Speech

func say(_ line: String) {
    print(line)
    fflush(stdout)
}

let arguments = CommandLine.arguments
let localeName = arguments.count > 1 ? arguments[1] : "fr-FR"
let seconds = arguments.count > 2 ? Double(arguments[2]) ?? 15 : 15

guard #available(macOS 26.0, *) else {
    say("ERREUR macOS 26 minimum")
    exit(2)
}

func run() async throws {
    // 1. Le micro.
    let granted = await AVCaptureDevice.requestAccess(for: .audio)
    say("MICRO accès \(granted ? "accordé" : "REFUSÉ")")
    guard granted else { exit(3) }

    // 2. La langue et son modèle.
    let requested = Locale(identifier: localeName)
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
        say("ERREUR langue non prise en charge : \(localeName)")
        exit(4)
    }
    say("LANGUE \(locale.identifier)")
    let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        say("MODÈLE téléchargement…")
        try await request.downloadAndInstall()
    }
    say("MODÈLE prêt")

    // 3. L'analyseur et le flux du micro.
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
    else {
        say("ERREUR aucun format audio")
        exit(5)
    }
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    try await analyzer.start(inputSequence: stream)

    let engine = AVAudioEngine()
    let input = engine.inputNode
    let micFormat = input.outputFormat(forBus: 0)
    guard let converter = AVAudioConverter(from: micFormat, to: format) else {
        say("ERREUR conversion audio impossible")
        exit(6)
    }
    var lastLevelPrint = Date.distantPast
    input.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { buffer, _ in
        // Niveau sonore (RMS), affiché au plus 4 fois par seconde.
        if let channel = buffer.floatChannelData?[0] {
            let count = Int(buffer.frameLength)
            var sum: Float = 0
            for index in 0..<count { sum += channel[index] * channel[index] }
            let rms = count > 0 ? (sum / Float(count)).squareRoot() : 0
            if Date().timeIntervalSince(lastLevelPrint) > 0.25 {
                lastLevelPrint = Date()
                say("NIVEAU \(String(format: "%.3f", rms))")
            }
        }
        let ratio = format.sampleRate / micFormat.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
        guard let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
            return
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
        if error == nil, converted.frameLength > 0 {
            continuation.yield(AnalyzerInput(buffer: converted))
        }
    }
    engine.prepare()
    try engine.start()
    say("ÉCOUTE \(Int(seconds)) secondes : parle maintenant")

    // 4. Les résultats : provisoire tant que le moteur corrige, fixé quand il est sûr.
    let reading = Task {
        for try await result in transcriber.results {
            let text = String(result.text.characters)
            say("\(result.isFinal ? "FIXÉ" : "PROVISOIRE") \(text)")
        }
    }

    try await Task.sleep(for: .seconds(seconds))
    engine.stop()
    input.removeTap(onBus: 0)
    continuation.finish()
    try await analyzer.finalizeAndFinishThroughEndOfInput()
    try await reading.value
    say("FIN")
}

Task {
    do {
        try await run()
        exit(0)
    } catch {
        say("ERREUR \(error)")
        exit(1)
    }
}
RunLoop.main.run()
