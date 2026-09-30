import CoreGraphics
import Foundation
import ImageIO

/// A decoded image, already rotated upright, plus the size of the original upright image.
struct LoadedImage: @unchecked Sendable {
  let cgImage: CGImage
  let uprightWidth: Int
  let uprightHeight: Int
}

enum ImageLoader {
  /// Vision gains nothing from 48 MP input for receipt-sized text, and a full-resolution
  /// decode of a modern camera photo costs ~200 MB. 3000 px keeps 8 pt print legible.
  static let maxPixelSize = 3000

  static func load(uri: String) throws -> LoadedImage {
    guard let url = URL(string: uri), url.isFileURL else {
      throw InvalidUriException(uri)
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw ImageLoadException(uri)
    }

    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let pixelWidth = properties?[kCGImagePropertyPixelWidth] as? Int ?? 0
    let pixelHeight = properties?[kCGImagePropertyPixelHeight] as? Int ?? 0
    let orientation = (properties?[kCGImagePropertyOrientation] as? UInt32)
      .flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up

    // The thumbnail API applies the EXIF transform, so everything downstream can treat
    // the image as `.up` and bounding boxes line up with what the user sees.
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw ImageLoadException(uri)
    }

    let rotated: Bool
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored: rotated = true
    default: rotated = false
    }
    let width = pixelWidth > 0 ? (rotated ? pixelHeight : pixelWidth) : image.width
    let height = pixelHeight > 0 ? (rotated ? pixelWidth : pixelHeight) : image.height

    return LoadedImage(cgImage: image, uprightWidth: width, uprightHeight: height)
  }
}

/// Runs blocking work off the cooperative thread pool. Vision's `perform` is synchronous
/// and can take hundreds of milliseconds; holding a Swift concurrency thread that long
/// starves every other task in the process.
func runBlocking<T: Sendable>(_ work: @escaping @Sendable () throws -> T) async throws -> T {
  try await withCheckedThrowingContinuation { continuation in
    DispatchQueue.global(qos: .userInitiated).async {
      continuation.resume(with: Result { try work() })
    }
  }
}

func elapsedMs(since start: UInt64) -> Double {
  let nanos = DispatchTime.now().uptimeNanoseconds - start
  return (Double(nanos) / 1_000_000).rounded()
}
