import { Platform } from 'react-native';

import ExpoSmartScan from '../ExpoSmartScanModule';
import {
  detectDocument,
  extractReceipt,
  getCapabilities,
  recognizeText,
  sanitizeReceipt,
  verifyReceipt,
} from '../SmartScan';
import { SmartScanError, SmartScanErrorCode, isSmartScanError, toSmartScanError } from '../errors';
import type { Receipt, TextLine, TextRecognitionResult } from '../types';

jest.mock('../ExpoSmartScanModule', () => ({
  __esModule: true,
  default: {
    getCapabilities: jest.fn(),
    recognizeText: jest.fn(),
    detectDocument: jest.fn(),
    extractReceipt: jest.fn(),
  },
}));

const native = ExpoSmartScan as jest.Mocked<typeof ExpoSmartScan>;
const URI = 'file:///tmp/receipt.jpg';

const line = (text: string, y: number): TextLine => ({
  text,
  confidence: 0.9,
  box: { x: 0.1, y, width: 0.8, height: 0.04 },
});

const ocr: TextRecognitionResult = {
  lines: [line('Harbor Books', 0.1), line('Notebook 12.00', 0.2), line('TOTAL 12.00', 0.3)],
  imageWidth: 1000,
  imageHeight: 2000,
  durationMs: 42,
  engine: 'apple-vision',
};

const modelReceipt: Receipt = {
  merchant: ' Harbor Books ',
  date: '2026-09-30',
  currency: 'usd',
  total: 12,
  subtotal: null,
  tax: null,
  lineItems: [{ description: 'Notebook', quantity: 1, unitPrice: 12, amount: 12 }],
};

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

beforeEach(() => {
  jest.resetAllMocks();
  setPlatform('ios');
});

describe('input validation', () => {
  it.each([recognizeText, detectDocument, extractReceipt])(
    '%p rejects non-file URIs with ERR_INVALID_URI',
    async (fn) => {
      await expect(fn('https://example.com/a.jpg')).rejects.toMatchObject({
        code: SmartScanErrorCode.InvalidUri,
      });
      expect(native.recognizeText).not.toHaveBeenCalled();
    }
  );
});

describe('error mapping', () => {
  it('converts native coded errors into SmartScanError', async () => {
    native.recognizeText.mockRejectedValue(
      Object.assign(new Error('Could not decode image'), { code: 'ERR_IMAGE_LOAD' })
    );
    const error = await recognizeText(URI).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmartScanError);
    expect(isSmartScanError(error, SmartScanErrorCode.ImageLoad)).toBe(true);
    expect((error as SmartScanError).message).toBe('Could not decode image');
  });

  it('maps unknown codes and non-errors to ERR_UNKNOWN', () => {
    expect(toSmartScanError(Object.assign(new Error('x'), { code: 'E_WHATEVER' })).code).toBe(
      'ERR_UNKNOWN'
    );
    expect(toSmartScanError('boom').code).toBe('ERR_UNKNOWN');
    const original = new SmartScanError(SmartScanErrorCode.Unsupported, 'nope');
    expect(toSmartScanError(original)).toBe(original);
    expect(isSmartScanError(new Error('plain'))).toBe(false);
  });
});

describe('passthrough calls', () => {
  it('forwards getCapabilities, recognizeText and detectDocument', async () => {
    native.getCapabilities.mockReturnValue({
      textRecognition: true,
      documentDetection: true,
      foundationModels: 'available',
      foundationModelsReason: null,
    });
    native.recognizeText.mockResolvedValue(ocr);
    native.detectDocument.mockResolvedValue({
      found: false,
      quad: null,
      confidence: 0,
      method: null,
      durationMs: 3,
    });

    expect(getCapabilities().foundationModels).toBe('available');
    await expect(recognizeText(URI, { level: 'fast' })).resolves.toBe(ocr);
    expect(native.recognizeText).toHaveBeenCalledWith(URI, { level: 'fast' });
    await expect(detectDocument(URI)).resolves.toMatchObject({ found: false });
  });
});

describe('extractReceipt', () => {
  it('returns the sanitized model receipt when Foundation Models ran', async () => {
    native.extractReceipt.mockResolvedValue({
      receipt: modelReceipt,
      ocr,
      modelDurationMs: 900,
      fallbackReason: null,
    });

    const result = await extractReceipt(URI);

    expect(native.extractReceipt).toHaveBeenCalledWith(URI, { requireModel: false });
    expect(result.engine).toBe('foundation-models');
    expect(result.receipt.merchant).toBe('Harbor Books');
    expect(result.receipt.currency).toBe('USD');
    expect(result.warnings).toEqual([]);
    expect(result.ocrDurationMs).toBe(42);
  });

  it('falls back to the heuristic parser with the reason the model was skipped', async () => {
    native.extractReceipt.mockResolvedValue({
      receipt: null,
      ocr,
      modelDurationMs: 0,
      fallbackReason: 'appleIntelligenceNotEnabled',
    });

    const result = await extractReceipt(URI, { languages: ['en-US'] });

    expect(native.extractReceipt).toHaveBeenCalledWith(URI, {
      languages: ['en-US'],
      requireModel: false,
    });
    expect(result.engine).toBe('heuristic');
    expect(result.fallbackReason).toBe('appleIntelligenceNotEnabled');
    expect(result.receipt.total).toBe(12);
    expect(result.receipt).not.toHaveProperty('totalSource');
  });

  it('asks native to require the model when engine is foundation-models', async () => {
    native.extractReceipt.mockRejectedValue(
      Object.assign(new Error('Model not ready'), { code: 'ERR_MODEL_UNAVAILABLE' })
    );
    await expect(extractReceipt(URI, { engine: 'foundation-models' })).rejects.toMatchObject({
      code: 'ERR_MODEL_UNAVAILABLE',
    });
    expect(native.extractReceipt).toHaveBeenCalledWith(URI, { requireModel: true });
  });

  it('skips the model entirely for engine: heuristic', async () => {
    native.recognizeText.mockResolvedValue(ocr);
    const result = await extractReceipt(URI, { engine: 'heuristic', dateOrder: 'DMY' });
    expect(native.extractReceipt).not.toHaveBeenCalled();
    expect(result.engine).toBe('heuristic');
    expect(result.fallbackReason).toBeNull();
  });

  it('uses OCR + heuristics on Android and warns when the total was guessed', async () => {
    setPlatform('android');
    native.recognizeText.mockResolvedValue({
      ...ocr,
      engine: 'ml-kit',
      lines: [line('Market Stall', 0.1), line('Honey 9.00', 0.2)],
    });

    const result = await extractReceipt(URI);

    expect(native.extractReceipt).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe('platform:android');
    expect(result.warnings).toEqual([
      'No total label found; used the largest amount on the receipt.',
    ]);
  });

  it('rejects engine: foundation-models off iOS without touching native code', async () => {
    setPlatform('android');
    await expect(extractReceipt(URI, { engine: 'foundation-models' })).rejects.toMatchObject({
      code: 'ERR_MODEL_UNAVAILABLE',
    });
    expect(native.recognizeText).not.toHaveBeenCalled();
  });
});

describe('sanitizeReceipt', () => {
  it('drops malformed model values instead of passing them through', () => {
    expect(
      sanitizeReceipt({
        merchant: '   ',
        date: '03/14/2026',
        currency: '$',
        total: Number.NaN,
        subtotal: 10.004,
        tax: null,
        lineItems: [
          { description: ' ', quantity: null, unitPrice: null, amount: 1 },
          { description: 'Tea', quantity: 2, unitPrice: 1.5, amount: 3.0000001 },
          { description: 'Bad', quantity: null, unitPrice: null, amount: Number.POSITIVE_INFINITY },
        ],
      })
    ).toEqual({
      merchant: null,
      date: null,
      currency: null,
      total: null,
      subtotal: 10,
      tax: null,
      lineItems: [{ description: 'Tea', quantity: 2, unitPrice: 1.5, amount: 3 }],
    });
  });
});

describe('verifyReceipt', () => {
  it('flags a total that is not printed on the receipt', () => {
    expect(verifyReceipt({ ...modelReceipt, total: 99 }, ocr.lines)).toEqual([
      'Total 99.00 does not appear in the recognized text.',
    ]);
  });

  it('flags item amounts that were computed rather than read', () => {
    const doubled = {
      ...modelReceipt,
      lineItems: [{ description: 'Notebook', quantity: 2, unitPrice: 12, amount: 24 }],
    };
    expect(verifyReceipt(doubled, ocr.lines)).toEqual([
      '1 of 1 item amounts do not appear in the recognized text.',
    ]);
  });

  it('flags a total below subtotal + tax', () => {
    const lines = [line('Subtotal 10.00', 0.1), line('Tax 1.00', 0.2), line('Total 10.00', 0.3)];
    expect(
      verifyReceipt({ ...modelReceipt, total: 10, subtotal: 10, tax: 1, lineItems: [] }, lines)
    ).toEqual(['Total 10.00 is less than subtotal + tax (11.00).']);
  });
});
