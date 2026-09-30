# Architecture

This document records the decisions behind `expo-smart-scan`, in a short ADR style:
context, decision, and the alternatives that were considered and rejected.

## Layers

```
 JS / TypeScript                          Native
 ─────────────────────────────────        ─────────────────────────────────────────
 src/SmartScan.ts   public API       ──▶  ios/ExpoSmartScanModule.swift
   ├─ input validation                      ├─ ImageLoader      (ImageIO, EXIF, downscale)
   ├─ error normalization                   ├─ TextRecognizer   (Vision)
   ├─ engine selection / fallback           ├─ DocumentDetector (Vision)
   └─ model output sanitize + verify        └─ ReceiptExtractor (Foundation Models)
 src/parser/        heuristic parser    android/.../ExpoSmartScanModule.kt
 src/errors.ts      shared error codes      └─ ML Kit Latin text recognizer
```

---

## ADR-1: The heuristic parser lives in TypeScript, not in Swift or Kotlin

**Context.** Receipts must be parsed on devices without Apple Intelligence: every Android
phone, every iPhone before the 15 Pro, and iOS versions before 26.

**Decision.** One parser, written in TypeScript, shared by both platforms. The native side
only produces OCR lines with boxes; the JS side turns them into a receipt.

**Rejected.**

- _A parser per platform._ Two implementations of the same regex-heavy logic drift apart
  within weeks, and every bug has to be fixed twice.
- _Parser in Swift with a Kotlin port later._ Native unit tests need a simulator or an
  emulator. The TypeScript parser runs 70+ cases in about a second on any CI runner.

**Trade-off.** Parsing happens on the JS thread. It runs in well under a millisecond for a
typical receipt, so this has not mattered in practice.

## ADR-2: Foundation Models gets OCR text, not the image

**Context.** Apple's on-device model (iOS 26) is text-only.

**Decision.** Vision runs first. Its lines are merged back into visual rows (description and
price side by side) and passed to `LanguageModelSession.respond(generating:)` with a
`@Generable` schema. Greedy sampling keeps output deterministic for the same input.

**Rejected.**

- _Free-form JSON prompt and `JSONDecoder`._ `@Generable` uses constrained decoding, so the
  output is always structurally valid. A prompt-only approach produces invalid JSON on some
  noisy receipts and needs retry logic.
- _Sending raw Vision observations in reading order._ Vision often returns the item column
  and the price column as separate observations. Without row grouping the model pairs prices
  with the wrong items.

**Trade-off.** The model inherits OCR mistakes. That is why its output is also checked in JS
(ADR-4).

## ADR-3: `auto` falls back quietly; `foundation-models` fails loudly

**Context.** Apps have two kinds of callers: ones that want "the best result available" and
ones that are measuring or requiring the model.

**Decision.** `engine: 'auto'` (the default) never throws because of the model. It returns
`engine: 'heuristic'` with a machine-readable `fallbackReason`
(`appleIntelligenceNotEnabled`, `modelNotReady`, `generationFailed:guardrailViolation`, ...).
`engine: 'foundation-models'` throws `ERR_MODEL_UNAVAILABLE` or `ERR_MODEL_FAILED` instead.

**Rejected.** _Always throw and let the app retry with the heuristic engine._ Every caller
would write the same try/catch, and OCR would run twice.

## ADR-4: Model output is sanitized and verified against the OCR text

**Context.** Constrained decoding guarantees shape, not truth. Small on-device models emit
`"03/14/2026"` in a field documented as ISO-8601, or a total that is not on the receipt.

**Decision.** `sanitizeReceipt` drops values that fail validation (bad dates, non-ISO
currencies, non-finite numbers, empty items). `verifyReceipt` adds `warnings` when the total
is not printed anywhere in the OCR text, or is lower than subtotal + tax.

**Rejected.** _Silently replacing a suspect model total with the heuristic one._ It hides
disagreement from the app. The warnings let the app decide, for example by asking the user to
confirm.

## ADR-5: Typed error codes across the bridge

**Context.** Expo turns native exceptions into JS errors with a `code` string. Without
discipline, codes are derived from class names and differ between iOS and Android.

**Decision.** Swift and Kotlin exceptions set codes explicitly (`ERR_INVALID_URI`,
`ERR_IMAGE_LOAD`, `ERR_RECOGNITION_FAILED`, `ERR_UNSUPPORTED`, `ERR_MODEL_UNAVAILABLE`,
`ERR_MODEL_FAILED`). The JS layer rewraps every rejection as `SmartScanError`, typed with
the `SmartScanErrorCode` union; anything unexpected becomes `ERR_UNKNOWN`.

**Rejected.** _Passing native errors straight through._ Callers would need to know about
`CodedError`, and a new native code would silently widen the error surface.

## ADR-6: Images are decoded once, upright and downscaled

**Context.** A 48 MP HEIC decodes to ~190 MB of pixels. Vision's coordinates are relative to
whatever orientation it is told the image has.

**Decision.** `ImageLoader` decodes through `CGImageSourceCreateThumbnailAtIndex` with
`kCGImageSourceCreateThumbnailWithTransform` and a 3000 px cap. EXIF rotation is baked in,
so all boxes are for the upright image and the JS overlay can use them directly. Reported
`imageWidth` / `imageHeight` are the original upright dimensions.

**Rejected.** _Passing the full-resolution image with an orientation hint._ Correct, but
memory spikes are enough to get a background app killed, and receipt text stays legible at
3000 px.

## ADR-7: Blocking Vision calls run on a GCD queue, not the Swift concurrency pool

**Context.** Expo Modules supports `async` Swift closures, which run on the cooperative pool.
`VNImageRequestHandler.perform` is synchronous and can take hundreds of milliseconds.

**Decision.** Vision work is wrapped in `runBlocking`, which hops to a `userInitiated`
dispatch queue and resumes a continuation. Foundation Models calls are natively async and
stay on the pool.

**Rejected.** _Calling `perform` directly inside the async closure._ It works, but it holds a
cooperative thread for the duration, and the pool has only as many threads as CPU cores.

## ADR-8: Document detection prefers segmentation, falls back to rectangles

**Decision.** `VNDetectDocumentSegmentationRequest` first (handles low contrast and curled
paper). If it fails or scores below 0.5, `VNDetectRectanglesRequest` with a minimum aspect
ratio of 0.1, since long receipts are rejected by the default of 0.5. `result.method` reports
which one produced the quad.

## Known limitations

- Android has no document detection and no language-model path yet (see the README roadmap).
- The heuristic parser targets Latin-script receipts. Right-to-left and CJK receipts are
  recognized by Vision but parsed poorly.
- A bare `$` resolves to `USD` unless `defaultCurrency` is set; `Rs` stays unresolved without
  a default because it is used by several currencies.
