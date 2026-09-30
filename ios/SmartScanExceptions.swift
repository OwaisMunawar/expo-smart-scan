import ExpoModulesCore

// Codes must stay in sync with `SmartScanErrorCode` in src/errors.ts.

final class InvalidUriException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_INVALID_URI" }
  override var reason: String { "Expected a file:// URI, received '\(param)'." }
}

final class ImageLoadException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_IMAGE_LOAD" }
  override var reason: String { "Could not decode an image at '\(param)'." }
}

final class RecognitionFailedException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_RECOGNITION_FAILED" }
  override var reason: String { "Vision request failed: \(param)" }
}

final class ModelUnavailableException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_MODEL_UNAVAILABLE" }
  override var reason: String { "Foundation Models is not available: \(param)." }
}

final class ModelFailedException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_MODEL_FAILED" }
  override var reason: String { "Foundation Models generation failed: \(param)." }
}
