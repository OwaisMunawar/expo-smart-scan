# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added

- `recognizeText(uri, options)` using Apple Vision on iOS and ML Kit (bundled Latin model)
  on Android. Lines include normalized, top-left-origin bounding boxes and confidence.
- `detectDocument(uri)` on iOS using Vision document segmentation with a rectangle-detection
  fallback.
- `extractReceipt(uri, options)` using Apple Foundation Models (`@Generable` schema) on
  iOS 26+ when available, with automatic fallback to the heuristic parser.
- `parseReceipt(lines, options)`: pure TypeScript receipt parser for merchant, date, currency,
  subtotal, tax, total and line items.
- `getCapabilities()` to check what the current device supports.
- Typed `SmartScanError` with stable error codes shared by Swift, Kotlin and TypeScript.
- Example app with OCR overlay, engine switch and latency readout.
