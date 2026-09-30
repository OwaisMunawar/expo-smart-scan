import CoreGraphics
import Foundation
import Vision

struct OCRLine: Sendable {
  let text: String
  let confidence: Float
  /// Normalized, top-left origin.
  let box: CGRect

  var dictionary: [String: Any] {
    [
      "text": text,
      "confidence": Double(confidence),
      "box": [
        "x": Double(box.minX),
        "y": Double(box.minY),
        "width": Double(box.width),
        "height": Double(box.height),
      ],
    ]
  }
}

struct OCRResult: Sendable {
  let lines: [OCRLine]
  let imageWidth: Int
  let imageHeight: Int
  let durationMs: Double

  var dictionary: [String: Any] {
    [
      "lines": lines.map(\.dictionary),
      "imageWidth": imageWidth,
      "imageHeight": imageHeight,
      "durationMs": durationMs,
      "engine": "apple-vision",
    ]
  }
}

struct TextRecognitionOptions: Sendable {
  var languages: [String]?
  var fast = false
  var usesLanguageCorrection = true

  init(_ raw: [String: Any]) {
    languages = raw["languages"] as? [String]
    fast = (raw["level"] as? String) == "fast"
    usesLanguageCorrection = raw["usesLanguageCorrection"] as? Bool ?? true
  }
}

enum TextRecognizer {
  static func recognize(uri: String, options: TextRecognitionOptions) async throws -> OCRResult {
    try await runBlocking {
      let image = try ImageLoader.load(uri: uri)
      let start = DispatchTime.now().uptimeNanoseconds

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = options.fast ? .fast : .accurate
      request.usesLanguageCorrection = options.usesLanguageCorrection
      if let languages = options.languages, !languages.isEmpty {
        request.recognitionLanguages = languages
      } else {
        request.automaticallyDetectsLanguage = true
      }

      let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: .up)
      do {
        try handler.perform([request])
      } catch {
        throw RecognitionFailedException(error.localizedDescription)
      }

      let lines: [OCRLine] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return OCRLine(
          text: candidate.string,
          confidence: candidate.confidence,
          box: flipped(observation.boundingBox)
        )
      }

      return OCRResult(
        lines: lines,
        imageWidth: image.uprightWidth,
        imageHeight: image.uprightHeight,
        durationMs: elapsedMs(since: start)
      )
    }
  }

  /// Vision uses a bottom-left origin; React Native layout uses top-left.
  static func flipped(_ rect: CGRect) -> CGRect {
    CGRect(x: rect.minX, y: 1 - rect.maxY, width: rect.width, height: rect.height)
  }

  static func flipped(_ point: CGPoint) -> CGPoint {
    CGPoint(x: point.x, y: 1 - point.y)
  }
}

extension OCRResult {
  /// OCR lines re-assembled into visual rows, top to bottom. This matters for the
  /// language model: a receipt's price column only makes sense next to its description.
  var rowText: String {
    guard !lines.isEmpty else { return "" }
    let heights = lines.map(\.box.height).sorted()
    let tolerance = heights[heights.count / 2] * 0.5

    var rows: [(centre: CGFloat, members: [OCRLine])] = []
    for line in lines.sorted(by: { $0.box.midY < $1.box.midY }) {
      if let last = rows.indices.last, abs(line.box.midY - rows[last].centre) <= tolerance {
        rows[last].members.append(line)
        let members = rows[last].members
        rows[last].centre = members.map(\.box.midY).reduce(0, +) / CGFloat(members.count)
      } else {
        rows.append((line.box.midY, [line]))
      }
    }
    return rows
      .map { $0.members.sorted { $0.box.minX < $1.box.minX }.map(\.text).joined(separator: "  ") }
      .joined(separator: "\n")
  }
}
