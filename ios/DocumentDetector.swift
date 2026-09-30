import CoreGraphics
import Foundation
import Vision

enum DocumentDetector {
  static func detect(uri: String) async throws -> [String: Any] {
    let result = try await runBlocking { () throws -> Detection in
      let image = try ImageLoader.load(uri: uri)
      let start = DispatchTime.now().uptimeNanoseconds
      let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: .up)

      // The segmentation model copes with low-contrast backgrounds and curled paper far
      // better than edge detection, but it needs the Neural Engine and can fail on some
      // simulators and older devices. Rectangle detection is the dependable fallback.
      let segmentation = VNDetectDocumentSegmentationRequest()
      if (try? handler.perform([segmentation])) != nil,
        let observation = segmentation.results?.first,
        observation.confidence > 0.5
      {
        return Detection(observation: observation, method: "segmentation", start: start)
      }

      let rectangles = VNDetectRectanglesRequest()
      rectangles.maximumObservations = 1
      rectangles.minimumConfidence = 0.6
      rectangles.minimumSize = 0.2
      // Receipts are long and thin; the default 0.5 would reject most of them.
      rectangles.minimumAspectRatio = 0.1
      rectangles.quadratureTolerance = 20
      do {
        try handler.perform([rectangles])
      } catch {
        throw RecognitionFailedException(error.localizedDescription)
      }
      return Detection(observation: rectangles.results?.first, method: "rectangle", start: start)
    }
    return result.dictionary
  }

  private struct Detection: Sendable {
    let quad: [CGPoint]?
    let confidence: Float
    let method: String?
    let durationMs: Double

    init(observation: VNRectangleObservation?, method: String, start: UInt64) {
      if let observation {
        quad = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
          .map(TextRecognizer.flipped)
        confidence = observation.confidence
        self.method = method
      } else {
        quad = nil
        confidence = 0
        self.method = nil
      }
      durationMs = elapsedMs(since: start)
    }

    var dictionary: [String: Any] {
      let point = { (p: CGPoint) -> [String: Double] in ["x": Double(p.x), "y": Double(p.y)] }
      var quadValue: Any = NSNull()
      if let quad {
        quadValue = [
          "topLeft": point(quad[0]),
          "topRight": point(quad[1]),
          "bottomRight": point(quad[2]),
          "bottomLeft": point(quad[3]),
        ]
      }
      return [
        "found": quad != nil,
        "quad": quadValue,
        "confidence": Double(confidence),
        "method": method ?? NSNull(),
        "durationMs": durationMs,
      ]
    }
  }
}
