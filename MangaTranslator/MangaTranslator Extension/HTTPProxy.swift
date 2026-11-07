import Foundation

/// 代发 AI 接口请求。在原生端发出，不受浏览器 CORS 限制。
/// 流式（SSE）模式下边收边拼接 choices[0].delta.content，只要服务端持续有数据就不会超时，
/// 适合会先“思考”很久的模型；最后仍返回与非流式相同结构的 JSON，前端无需区分。
enum HTTPProxy {
    struct Response { var status: Int; var body: String }

    static func send(url: URL, method: String, headers: [String: String], body: String?,
                     stream: Bool, idleTimeout: TimeInterval) async throws -> Response {
        var request = URLRequest(url: url, timeoutInterval: idleTimeout)
        request.httpMethod = method
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let body { request.httpBody = Data(body.utf8) }

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = idleTimeout      // 两次收到数据之间的最长间隔
        config.timeoutIntervalForResource = 600
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }

        guard stream else {
            let (data, response) = try await session.data(for: request)
            return Response(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: String(decoding: data, as: UTF8.self))
        }

        let (bytes, response) = try await session.bytes(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            return Response(status: status, body: String(decoding: data, as: UTF8.self))
        }

        var content = "", raw = ""
        var sawEvent = false
        var usage: Any?   // 开启 stream_options.include_usage 后，最后一个数据块带 token 用量
        for try await line in bytes.lines {
            raw += line + "\n"
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if payload == "[DONE]" { break }
            guard let json = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any] else { continue }
            sawEvent = true
            if let error = json["error"] {
                return Response(status: 500, body: (try? String(data: JSONSerialization.data(withJSONObject: ["error": error]), encoding: .utf8)) ?? payload)
            }
            if let u = json["usage"], !(u is NSNull) { usage = u }
            let choice = (json["choices"] as? [[String: Any]])?.first
            if let delta = choice?["delta"] as? [String: Any], let piece = delta["content"] as? String { content += piece }
        }
        // 服务端没有按 SSE 返回（忽略了 stream 参数）时，原样交给前端解析。
        guard sawEvent else { return Response(status: status, body: raw) }
        var wrapped: [String: Any] = ["choices": [["message": ["content": content]]]]
        if let usage { wrapped["usage"] = usage }
        let data = try JSONSerialization.data(withJSONObject: wrapped)
        return Response(status: status, body: String(decoding: data, as: UTF8.self))
    }
}
