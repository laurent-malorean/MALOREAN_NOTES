// Assistant Swift de l'aide à l'écriture (fiche 0031) : seul Swift a accès au modèle d'IA
// intégré au Mac (Apple Intelligence, framework FoundationModels). Rust le lance pour chaque
// demande et lui parle en JSON.
//
//   malorean-writing availability
//     → {"available": true} | {"unavailable": "<raison>"}
//   malorean-writing answer   (entrée : {"instructions": "...", "prompts": ["...", ...]})
//     → {"answers": ["...", ...]} | {"unavailable": "<raison>"} | {"refused": true} | {"failed": "..."}
//
// Raisons : deviceNotEligible, appleIntelligenceNotEnabled, modelNotReady, systemTooOld.
// Chaque passage est lu par une session neuve : le modèle ne se souvient pas du précédent.
// Ce programme ne décide de rien : consignes, découpage et nettoyage des réponses sont en Rust.

import Foundation
import FoundationModels

struct Request: Decodable {
    let instructions: String
    let prompts: [String]
}

struct Reply: Encodable {
    var available: Bool?
    var unavailable: String?
    var answers: [String]?
    var refused: Bool?
    var failed: String?
}

func send(_ reply: Reply) {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(reply) else { return }
    FileHandle.standardOutput.write(data)
}

@available(macOS 26.0, *)
func unavailability(_ model: SystemLanguageModel) -> String? {
    switch model.availability {
    case .available:
        return nil
    case .unavailable(.deviceNotEligible):
        return "deviceNotEligible"
    case .unavailable(.appleIntelligenceNotEnabled):
        return "appleIntelligenceNotEnabled"
    case .unavailable(.modelNotReady):
        return "modelNotReady"
    case .unavailable:
        return "deviceNotEligible"
    }
}

@available(macOS 26.0, *)
func answer(_ request: Request) async -> Reply {
    var answers: [String] = []
    for prompt in request.prompts {
        let session = LanguageModelSession(instructions: request.instructions)
        do {
            answers.append(try await session.respond(to: prompt).content)
        } catch let error as LanguageModelSession.GenerationError {
            switch error {
            case .guardrailViolation:
                return Reply(refused: true)
            case .assetsUnavailable:
                return Reply(unavailable: "modelNotReady")
            case .exceededContextWindowSize:
                return Reply(failed: "le passage est trop long pour le modèle")
            case .unsupportedLanguageOrLocale:
                return Reply(failed: "le modèle ne prend pas en charge cette langue")
            default:
                return Reply(failed: error.localizedDescription)
            }
        } catch {
            return Reply(failed: error.localizedDescription)
        }
    }
    return Reply(answers: answers)
}

@main
struct WritingHelper {
    static func main() async {
        guard #available(macOS 26.0, *) else {
            send(Reply(unavailable: "systemTooOld"))
            return
        }
        let model = SystemLanguageModel.default
        if let reason = unavailability(model) {
            send(Reply(unavailable: reason))
            return
        }
        if CommandLine.arguments.dropFirst().first == "availability" {
            send(Reply(available: true))
            return
        }
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let request = try? JSONDecoder().decode(Request.self, from: input) else {
            send(Reply(failed: "demande illisible"))
            return
        }
        send(await answer(request))
    }
}
