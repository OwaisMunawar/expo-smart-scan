package expo.modules.smartscan

import expo.modules.kotlin.exception.CodedException

// Codes must stay in sync with `SmartScanErrorCode` in src/errors.ts.

internal class InvalidUriException(uri: String) :
  CodedException("ERR_INVALID_URI", "Expected a file:// URI, received '$uri'.", null)

internal class ImageLoadException(uri: String, cause: Throwable?) :
  CodedException("ERR_IMAGE_LOAD", "Could not decode an image at '$uri'.", cause)

internal class RecognitionFailedException(cause: Throwable) :
  CodedException("ERR_RECOGNITION_FAILED", "ML Kit text recognition failed: ${cause.message}", cause)

internal class UnsupportedException(feature: String) :
  CodedException("ERR_UNSUPPORTED", "$feature is not implemented on Android yet.", null)
