import { Platform } from 'react-native';

import ExpoSmartScan from './ExpoSmartScanModule';
import { SmartScanError, SmartScanErrorCode, toSmartScanError } from './errors';
import { findAmounts, roundMoney } from './parser/amounts';
import { parseReceipt } from './parser/parseReceipt';
import type {
  DocumentDetectionResult,
  ExtractReceiptOptions,
  Receipt,
  ReceiptExtractionResult,
  RecognizeTextOptions,
  SmartScanCapabilities,
  TextLine,
  TextRecognitionResult,
} from './types';

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

async function callNative<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toSmartScanError(error);
  }
}

function assertUri(uri: string): void {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) {
    throw new SmartScanError(
      SmartScanErrorCode.InvalidUri,
      `Expected a file:// URI, received "${String(uri)}".`
    );
  }
}

/**
 * Reports what the current device can do. Synchronous and cheap, so it is safe to call
 * during render to decide which UI to show.
 */
export function getCapabilities(): SmartScanCapabilities {
  return ExpoSmartScan.getCapabilities();
}

/**
 * Runs on-device OCR on an image and returns every line with a normalized bounding box.
 *
 * Uses Apple Vision on iOS and ML Kit's bundled Latin model on Android. Nothing leaves
 * the device.
 *
 * @param uri A `file://` URI, e.g. from `expo-image-picker` or `expo-camera`.
 * @throws {SmartScanError} `ERR_INVALID_URI`, `ERR_IMAGE_LOAD` or `ERR_RECOGNITION_FAILED`.
 */
export async function recognizeText(
  uri: string,
  options: RecognizeTextOptions = {}
): Promise<TextRecognitionResult> {
  assertUri(uri);
  return callNative(() => ExpoSmartScan.recognizeText(uri, options));
}

/**
 * Finds the outline of a document or receipt in a photo.
 *
 * iOS only for now; Android rejects with `ERR_UNSUPPORTED`.
 *
 * @throws {SmartScanError} `ERR_INVALID_URI`, `ERR_IMAGE_LOAD`, `ERR_RECOGNITION_FAILED` or `ERR_UNSUPPORTED`.
 */
export async function detectDocument(uri: string): Promise<DocumentDetectionResult> {
  assertUri(uri);
  return callNative(() => ExpoSmartScan.detectDocument(uri));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? roundMoney(value) : null;
}

/**
 * Language-model output is structurally typed by `@Generable`, but the *values* still
 * need checking: models happily emit "03/14/2026" in a field documented as ISO-8601,
 * or a currency symbol instead of a code.
 */
export function sanitizeReceipt(raw: Receipt): Receipt {
  const merchant = raw.merchant?.trim() || null;
  const date = raw.date && ISO_DATE.test(raw.date) ? raw.date : null;
  const currency = raw.currency?.trim().toUpperCase() ?? null;
  return {
    merchant,
    date,
    currency: currency && ISO_CURRENCY.test(currency) ? currency : null,
    total: finiteOrNull(raw.total),
    subtotal: finiteOrNull(raw.subtotal),
    tax: finiteOrNull(raw.tax),
    lineItems: (raw.lineItems ?? [])
      .filter((item) => item.description?.trim() && Number.isFinite(item.amount))
      .map((item) => ({
        description: item.description.trim(),
        quantity: finiteOrNull(item.quantity),
        unitPrice: finiteOrNull(item.unitPrice),
        amount: roundMoney(item.amount),
      })),
  };
}

/**
 * Cross-checks a model-produced receipt against the OCR text it was generated from.
 * A total that is not printed anywhere on the receipt is the most common hallucination.
 */
export function verifyReceipt(receipt: Receipt, lines: readonly TextLine[]): string[] {
  const warnings: string[] = [];
  const printed = new Set(
    lines.flatMap((l) => findAmounts(l.text).map((a) => Math.abs(a.value).toFixed(2)))
  );

  if (receipt.total !== null && !printed.has(Math.abs(receipt.total).toFixed(2))) {
    warnings.push(`Total ${receipt.total.toFixed(2)} does not appear in the recognized text.`);
  }
  if (receipt.subtotal !== null && receipt.tax !== null && receipt.total !== null) {
    const expected = roundMoney(receipt.subtotal + receipt.tax);
    // Tips and rounding legitimately push the total up, so only flag a total that is lower.
    if (receipt.total + 0.01 < expected) {
      warnings.push(
        `Total ${receipt.total.toFixed(2)} is less than subtotal + tax (${expected.toFixed(2)}).`
      );
    }
  }
  return warnings;
}

/**
 * Extracts structured receipt data from a photo.
 *
 * On iOS 26+ devices with Apple Intelligence enabled, OCR text is handed to the on-device
 * Foundation Models language model with a typed `@Generable` schema. Everywhere else,
 * including Android and older iPhones, the same OCR output goes through the
 * deterministic `parseReceipt` heuristics. `result.engine` says which one ran.
 *
 * @example
 * ```ts
 * const { receipt, engine, durationMs } = await extractReceipt(asset.uri);
 * console.log(engine, receipt.total, receipt.currency);
 * ```
 *
 * @throws {SmartScanError} `ERR_INVALID_URI`, `ERR_IMAGE_LOAD`, `ERR_RECOGNITION_FAILED`,
 * and with `engine: 'foundation-models'` also `ERR_MODEL_UNAVAILABLE` / `ERR_MODEL_FAILED`.
 */
export async function extractReceipt(
  uri: string,
  options: ExtractReceiptOptions = {}
): Promise<ReceiptExtractionResult> {
  assertUri(uri);
  const started = now();
  const { engine = 'auto', dateOrder, defaultCurrency, ...ocrOptions } = options;

  let ocr: TextRecognitionResult;
  let fallbackReason: string | null = null;

  if (engine !== 'heuristic' && Platform.OS === 'ios') {
    const native = await callNative(() =>
      ExpoSmartScan.extractReceipt(uri, {
        ...ocrOptions,
        requireModel: engine === 'foundation-models',
      })
    );
    ocr = native.ocr;
    if (native.receipt) {
      const receipt = sanitizeReceipt(native.receipt);
      return {
        receipt,
        engine: 'foundation-models',
        lines: ocr.lines,
        imageWidth: ocr.imageWidth,
        imageHeight: ocr.imageHeight,
        durationMs: Math.round(now() - started),
        ocrDurationMs: ocr.durationMs,
        fallbackReason: null,
        warnings: verifyReceipt(receipt, ocr.lines),
      };
    }
    fallbackReason = native.fallbackReason;
  } else {
    if (engine === 'foundation-models') {
      throw new SmartScanError(
        SmartScanErrorCode.ModelUnavailable,
        `Foundation Models is not available on ${Platform.OS}.`
      );
    }
    ocr = await recognizeText(uri, ocrOptions);
    if (engine === 'auto') {
      fallbackReason = `platform:${Platform.OS}`;
    }
  }

  const { totalSource, ...receipt } = parseReceipt(ocr.lines, { dateOrder, defaultCurrency });
  const warnings: string[] = [];
  if (totalSource === 'largest') {
    warnings.push('No total label found; used the largest amount on the receipt.');
  }

  return {
    receipt,
    engine: 'heuristic',
    lines: ocr.lines,
    imageWidth: ocr.imageWidth,
    imageHeight: ocr.imageHeight,
    durationMs: Math.round(now() - started),
    ocrDurationMs: ocr.durationMs,
    fallbackReason,
    warnings,
  };
}
