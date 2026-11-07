import CoreGraphics
import Foundation
import Vision

/// 一个识别出的文本块（通常对应一个对白气泡）。坐标为相对整张截图的比例，原点在左上角。
struct MangaTextBlock {
    var text: String
    var x: Double, y: Double, width: Double, height: Double
    var vertical: Bool
    /// 估算的单字尺寸（相对截图高度），用于前端决定字号。
    var charSize: Double

    var dictionary: [String: Any] {
        ["source": text, "x": x, "y": y, "width": width, "height": height, "vertical": vertical, "charSize": charSize]
    }
}

@available(macOS 26.0, iOS 26.0, *)
enum MangaOCR {
    /// 识别并按气泡分组。macOS 26 的新版 RecognizeTextRequest 支持竖排日文（旧版 VNRecognizeTextRequest 对竖排几乎完全无输出）。
    static func recognize(_ image: CGImage) async throws -> [MangaTextBlock] {
        let W = Double(image.width), H = Double(image.height)
        // 图片太小时放大一倍再识别，小字的识别率明显更高。
        var source = image, scale = 1.0
        if max(W, H) < 1800, let up = upscale(image, by: 2) { source = up; scale = 2 }
        let lines = try await recognizeLines(source, offsetX: 0, offsetY: 0).map { line -> Line in
            var l = line
            l.rect = CGRect(x: line.rect.minX / scale, y: line.rect.minY / scale, width: line.rect.width / scale, height: line.rect.height / scale)
            return l
        }
        return groupBubbles(lines).map { g in
            MangaTextBlock(text: g.text, x: g.rect.minX / W, y: g.rect.minY / H, width: g.rect.width / W,
                           height: g.rect.height / H, vertical: g.vertical, charSize: g.charSize / H)
        }
    }

    private static func upscale(_ image: CGImage, by factor: Int) -> CGImage? {
        let w = image.width * factor, h = image.height * factor
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
    }

    // MARK: - 行识别

    struct Line {
        var text: String
        var rect: CGRect  // 像素坐标，原点左上
        var confidence: Float
        var vertical: Bool { rect.height > rect.width * 1.3 }
        var horizontal: Bool { rect.width > rect.height * 1.3 }
        var charSize: Double { Double(min(rect.width, rect.height)) }
    }

    private static let japanese = try! NSRegularExpression(pattern: "[ぁ-んァ-ヶー一-龯々〆]")

    static func recognizeLines(_ image: CGImage, offsetX: Double, offsetY: Double) async throws -> [Line] {
        var request = RecognizeTextRequest()
        request.recognitionLanguages = [Locale.Language(identifier: "ja-JP")]
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let observations = try await request.perform(on: image)
        let w = Double(image.width), h = Double(image.height)
        return observations.compactMap { obs in
            guard let candidate = obs.topCandidates(1).first else { return nil }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            let range = NSRange(text.startIndex..., in: text)
            guard japanese.firstMatch(in: text, range: range) != nil, candidate.confidence >= 0.3 else { return nil }
            let b = obs.boundingBox  // 归一化，原点左下
            let rect = CGRect(x: offsetX + b.origin.x * w, y: offsetY + (1 - b.origin.y - b.height) * h,
                              width: b.width * w, height: b.height * h)
            return Line(text: text, rect: rect, confidence: candidate.confidence)
        }
    }

    /// 合并分块结果：与已有行重叠时保留文字更长/置信度更高的版本。
    static func merge(_ line: Line, into lines: inout [Line]) {
        for i in lines.indices {
            let inter = lines[i].rect.intersection(line.rect)
            guard !inter.isNull else { continue }
            let smaller = min(area(lines[i].rect), area(line.rect))
            if area(inter) > smaller * 0.5 {
                if line.text.count > lines[i].text.count || (line.text.count == lines[i].text.count && line.confidence > lines[i].confidence) {
                    lines[i] = line
                }
                return
            }
        }
        lines.append(line)
    }

    private static func area(_ r: CGRect) -> Double { Double(r.width * r.height) }

    // MARK: - 气泡分组

    struct Group {
        var text: String
        var rect: CGRect
        var vertical: Bool
        var charSize: Double
    }

    static func groupBubbles(_ lines: [Line]) -> [Group] {
        let n = lines.count
        var parent = Array(0..<n)
        func find(_ i: Int) -> Int { var i = i; while parent[i] != i { parent[i] = parent[parent[i]]; i = parent[i] }; return i }

        for i in 0..<n {
            for j in (i + 1)..<n where belongTogether(lines[i], lines[j]) {
                parent[find(i)] = find(j)
            }
        }
        var buckets: [Int: [Line]] = [:]
        for i in 0..<n { buckets[find(i), default: []].append(lines[i]) }

        return buckets.values.map { members in
            let verticalVotes = members.filter(\.vertical).count, horizontalVotes = members.filter(\.horizontal).count
            let vertical = verticalVotes > horizontalVotes || (verticalVotes == horizontalVotes && members.count > 1)
            // 竖排：从右到左逐列；横排：从上到下逐行。
            let ordered = vertical
                ? members.sorted { abs($0.rect.midX - $1.rect.midX) > $0.charSize * 0.5 ? $0.rect.midX > $1.rect.midX : $0.rect.minY < $1.rect.minY }
                : members.sorted { abs($0.rect.midY - $1.rect.midY) > $0.charSize * 0.5 ? $0.rect.midY < $1.rect.midY : $0.rect.minX < $1.rect.minX }
            let rect = ordered.dropFirst().reduce(ordered[0].rect) { $0.union($1.rect) }
            let sizes = ordered.map(\.charSize).sorted()
            return Group(text: ordered.map(\.text).joined(), rect: rect, vertical: vertical, charSize: sizes[sizes.count / 2])
        }
        .sorted { $0.rect.minY < $1.rect.minY }
    }

    /// 判断两行是否属于同一气泡：方向一致、字号接近、间距小于约一个字宽且在另一方向上有重叠。
    static func belongTogether(_ a: Line, _ b: Line) -> Bool {
        let size = (a.charSize + b.charSize) / 2
        guard max(a.charSize, b.charSize) / max(1, min(a.charSize, b.charSize)) < 1.7 else { return false }
        if (a.vertical && b.horizontal) || (a.horizontal && b.vertical) { return false }
        let vertical = a.vertical || b.vertical || (!a.horizontal && !b.horizontal)
        if vertical {
            let gap = max(a.rect.minX, b.rect.minX) - min(a.rect.maxX, b.rect.maxX)
            let overlap = min(a.rect.maxY, b.rect.maxY) - max(a.rect.minY, b.rect.minY)
            return gap < size * 0.9 && overlap > -size * 0.5
        } else {
            let gap = max(a.rect.minY, b.rect.minY) - min(a.rect.maxY, b.rect.maxY)
            let overlap = min(a.rect.maxX, b.rect.maxX) - max(a.rect.minX, b.rect.minX)
            return gap < size * 0.8 && overlap > -size * 0.5
        }
    }
}
