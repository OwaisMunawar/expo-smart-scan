/**
 * Rectangle in normalized image coordinates (0...1), origin at the top-left of the
 * upright image. EXIF orientation is already applied on both platforms, so these
 * values can be multiplied straight into the rendered image size.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Point in normalized, top-left-origin image coordinates. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** A single line of recognized text. */
export interface TextLine {
  text: string;
  /** Recognizer confidence in the range 0...1. */
  confidence: number;
  box: NormalizedRect;
}

/** Which native recognizer produced a result. */
export type TextEngine = 'apple-vision' | 'ml-kit';

export interface RecognizeTextOptions {
  /**
   * BCP-47 language hints in priority order, e.g. `['en-US', 'de-DE']`.
   * iOS only; ML Kit's Latin recognizer ignores this.
   */
  languages?: string[];
  /** `accurate` (default) or `fast`. iOS only. */
  level?: 'accurate' | 'fast';
  /** Let Vision apply its language model to fix up words. iOS only, defaults to `true`. */
  usesLanguageCorrection?: boolean;
}

export interface TextRecognitionResult {
  lines: TextLine[];
  /** Width of the upright image in pixels. */
  imageWidth: number;
  /** Height of the upright image in pixels. */
  imageHeight: number;
  /** Wall-clock time spent inside the native recognizer. */
  durationMs: number;
  engine: TextEngine;
}

/** Four corners of a detected document, clockwise from the top-left. */
export interface DocumentQuad {
  topLeft: NormalizedPoint;
  topRight: NormalizedPoint;
  bottomRight: NormalizedPoint;
  bottomLeft: NormalizedPoint;
}

export interface DocumentDetectionResult {
  found: boolean;
  quad: DocumentQuad | null;
  /** Detector confidence in the range 0...1; `0` when nothing was found. */
  confidence: number;
  /** `segmentation` uses Vision's document model, `rectangle` is the classic edge detector. */
  method: 'segmentation' | 'rectangle' | null;
  durationMs: number;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  /** Line amount as printed. Negative for discounts and coupons. */
  amount: number;
}

export interface Receipt {
  merchant: string | null;
  /** ISO-8601 calendar date (`YYYY-MM-DD`). */
  date: string | null;
  /** ISO-4217 currency code. */
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  lineItems: ReceiptLineItem[];
}

/** Which extractor produced a receipt. */
export type ReceiptEngine = 'foundation-models' | 'heuristic';

export interface ExtractReceiptOptions extends RecognizeTextOptions {
  /**
   * - `auto` (default): Foundation Models when available, heuristic parser otherwise.
   * - `foundation-models`: fail with `ERR_MODEL_UNAVAILABLE` instead of falling back.
   * - `heuristic`: skip the language model entirely.
   */
  engine?: 'auto' | ReceiptEngine;
  /** Passed through to the heuristic parser. */
  dateOrder?: 'MDY' | 'DMY';
  /** Passed through to the heuristic parser. */
  defaultCurrency?: string;
}

export interface ReceiptExtractionResult {
  receipt: Receipt;
  engine: ReceiptEngine;
  /** OCR output the receipt was built from, useful for drawing overlays. */
  lines: TextLine[];
  imageWidth: number;
  imageHeight: number;
  /** End-to-end time, OCR included. */
  durationMs: number;
  ocrDurationMs: number;
  /** Why `auto` fell back to the heuristic engine, if it did. */
  fallbackReason: string | null;
  /** Non-fatal inconsistencies, e.g. a model total that does not appear in the OCR text. */
  warnings: string[];
}

export type FoundationModelsStatus = 'available' | 'unavailable' | 'unsupported';

export interface SmartScanCapabilities {
  textRecognition: boolean;
  documentDetection: boolean;
  /**
   * `unsupported` means the OS or platform has no on-device model at all;
   * `unavailable` means it exists but is not usable right now (see `foundationModelsReason`).
   */
  foundationModels: FoundationModelsStatus;
  foundationModelsReason: string | null;
}
