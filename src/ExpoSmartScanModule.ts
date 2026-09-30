import { NativeModule, requireNativeModule } from 'expo';

import type {
  DocumentDetectionResult,
  Receipt,
  RecognizeTextOptions,
  SmartScanCapabilities,
  TextRecognitionResult,
} from './types';

/** Shape returned by the native `extractReceipt`, before the JS layer post-processes it. */
export interface NativeReceiptResult {
  /** `null` when the language model was skipped or unavailable. */
  receipt: Receipt | null;
  ocr: TextRecognitionResult;
  modelDurationMs: number;
  fallbackReason: string | null;
}

export interface NativeExtractOptions extends RecognizeTextOptions {
  /** When `true`, the native side throws `ERR_MODEL_UNAVAILABLE` instead of returning `receipt: null`. */
  requireModel: boolean;
}

declare class ExpoSmartScanNativeModule extends NativeModule {
  getCapabilities(): SmartScanCapabilities;
  recognizeText(uri: string, options: RecognizeTextOptions): Promise<TextRecognitionResult>;
  detectDocument(uri: string): Promise<DocumentDetectionResult>;
  extractReceipt(uri: string, options: NativeExtractOptions): Promise<NativeReceiptResult>;
}

export default requireNativeModule<ExpoSmartScanNativeModule>('ExpoSmartScan');
