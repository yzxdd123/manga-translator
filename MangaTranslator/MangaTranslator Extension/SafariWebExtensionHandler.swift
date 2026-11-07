import SafariServices
import ImageIO
import Translation
import os

private let log = Logger(subsystem: "local.MangaTranslator", category: "native")

/// 原生消息入口。支持三种 action：
/// - "ocr"：识别图片中的日文并按气泡分组，返回 blocks（只含原文）。
/// - "translate"：用苹果系统翻译把 texts 译成简体中文（离线兜底）。
/// - "http"：代发 AI 接口请求（在原生端发出，不受浏览器 CORS 限制）。
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]
        let action = message["action"] as? String ?? "ocr"
        log.notice("received action=\(action, privacy: .public)")
        Task {
            let result: [String: Any]
            let started = Date()
            do {
                result = try await handle(message)
                log.notice("done action=\(action, privacy: .public) in \(Date().timeIntervalSince(started), privacy: .public)s")
            } catch {
                log.error("failed action=\(action, privacy: .public): \(error.localizedDescription, privacy: .public)")
                result = ["error": error.localizedDescription]
            }
            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: result]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        }
    }

    private func handle(_ message: [String: Any]) async throws -> [String: Any] {
        guard #available(macOS 26.0, iOS 26.0, *) else { throw HandlerError.unsupported }
        switch message["action"] as? String ?? "ocr" {
        case "ocr":
            guard let url = message["image"] as? String, let image = decodeImage(url) else { throw HandlerError.invalidImage }
            let blocks = try await MangaOCR.recognize(image)
            return ["blocks": blocks.map(\.dictionary), "imageWidth": image.width, "imageHeight": image.height]
        case "translate":
            let texts = message["texts"] as? [String] ?? []
            return ["texts": try await appleTranslate(texts)]
        case "http":
            return try await proxy(message)
        case "ping":
            return ["pong": true]
        default:
            throw HandlerError.unknownAction
        }
    }

    private func decodeImage(_ dataURL: String) -> CGImage? {
        guard let encoded = dataURL.split(separator: ",", maxSplits: 1).last,
              let data = Data(base64Encoded: String(encoded)),
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    @available(macOS 26.0, iOS 26.0, *)
    private func appleTranslate(_ texts: [String]) async throws -> [String] {
        guard !texts.isEmpty else { return [] }
        let session = TranslationSession(installedSource: Locale.Language(identifier: "ja"), target: Locale.Language(identifier: "zh-Hans"))
        let requests = texts.enumerated().map { TranslationSession.Request(sourceText: $0.element, clientIdentifier: String($0.offset)) }
        var output = texts
        for response in try await session.translations(from: requests) {
            if let id = response.clientIdentifier, let index = Int(id) { output[index] = response.targetText }
        }
        return output
    }

    private func proxy(_ message: [String: Any]) async throws -> [String: Any] {
        guard let urlString = message["url"] as? String, let url = URL(string: urlString),
              url.scheme == "https" || url.host == "localhost" || url.host == "127.0.0.1" else { throw HandlerError.badURL }
        let stream = message["stream"] as? Bool ?? false
        log.notice("http \(url.host ?? "", privacy: .public)\(url.path, privacy: .public) stream=\(stream, privacy: .public)")
        let response = try await HTTPProxy.send(url: url, method: message["method"] as? String ?? "POST",
                                                headers: message["headers"] as? [String: String] ?? [:],
                                                body: message["body"] as? String, stream: stream,
                                                idleTimeout: (message["timeout"] as? Double) ?? 60)
        log.notice("http status \(response.status, privacy: .public), \(response.body.count, privacy: .public) chars")
        return ["status": response.status, "body": response.body]
    }
}

private enum HandlerError: LocalizedError {
    case invalidImage, unsupported, unknownAction, badURL
    var errorDescription: String? {
        switch self {
        case .invalidImage: return "无法读取当前页面图片。"
        case .unsupported: return "需要 macOS 26 / iPadOS 26 / iOS 26 或更新版本。"
        case .unknownAction: return "未知的请求类型。"
        case .badURL: return "AI 接口地址无效（需要 https，或本机 localhost）。"
        }
    }
}
