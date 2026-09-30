import ExpoModulesCore

public final class ExpoSmartScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSmartScan")

    Function("getCapabilities") { () -> [String: Any] in
      let (status, reason) = ReceiptExtractor.modelStatus()
      return [
        "textRecognition": true,
        "documentDetection": true,
        "foundationModels": status,
        "foundationModelsReason": reason ?? NSNull(),
      ]
    }

    AsyncFunction("recognizeText") { (uri: String, options: [String: Any]) async throws -> [String: Any] in
      let result = try await TextRecognizer.recognize(uri: uri, options: TextRecognitionOptions(options))
      return result.dictionary
    }

    AsyncFunction("detectDocument") { (uri: String) async throws -> [String: Any] in
      try await DocumentDetector.detect(uri: uri)
    }

    AsyncFunction("extractReceipt") { (uri: String, options: [String: Any]) async throws -> [String: Any] in
      let ocr = try await TextRecognizer.recognize(uri: uri, options: TextRecognitionOptions(options))
      let requireModel = options["requireModel"] as? Bool ?? false
      let outcome = try await ReceiptExtractor.extract(from: ocr, requireModel: requireModel)
      return [
        "receipt": outcome.receipt?.dictionary ?? NSNull(),
        "ocr": ocr.dictionary,
        "modelDurationMs": outcome.durationMs,
        "fallbackReason": outcome.fallbackReason ?? NSNull(),
      ]
    }
  }
}
