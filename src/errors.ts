/**
 * Error codes shared by the Swift, Kotlin and TypeScript layers. The native modules
 * throw exceptions with exactly these codes, so callers can branch on `error.code`
 * without string-matching messages.
 */
export const SmartScanErrorCode = {
  /** The URI is not a readable `file://` URL. */
  InvalidUri: 'ERR_INVALID_URI',
  /** The file exists but could not be decoded as an image. */
  ImageLoad: 'ERR_IMAGE_LOAD',
  /** The platform recognizer failed. */
  RecognitionFailed: 'ERR_RECOGNITION_FAILED',
  /** The feature is not implemented on this platform. */
  Unsupported: 'ERR_UNSUPPORTED',
  /** `engine: 'foundation-models'` was requested but the model cannot be used. */
  ModelUnavailable: 'ERR_MODEL_UNAVAILABLE',
  /** The on-device model was reachable but generation failed. */
  ModelFailed: 'ERR_MODEL_FAILED',
  /** Anything the native side threw that is not one of the codes above. */
  Unknown: 'ERR_UNKNOWN',
} as const;

// Value and type share a name on purpose, mirroring how a TS enum would be consumed.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SmartScanErrorCode = (typeof SmartScanErrorCode)[keyof typeof SmartScanErrorCode];

const KNOWN_CODES = new Set<string>(Object.values(SmartScanErrorCode));

/** The only error type thrown by the public API. */
export class SmartScanError extends Error {
  readonly code: SmartScanErrorCode;

  constructor(code: SmartScanErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SmartScanError';
    this.code = code;
    if (options?.cause !== undefined) {
      // Assigned manually because Hermes does not implement the ES2022 `cause` option.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Type guard that also narrows to a specific code when one is given. */
export function isSmartScanError<C extends SmartScanErrorCode>(
  error: unknown,
  code?: C
): error is SmartScanError & { code: C } {
  return error instanceof SmartScanError && (code === undefined || error.code === code);
}

/**
 * Converts whatever crossed the bridge into a `SmartScanError`. Expo surfaces native
 * exceptions as `CodedError`s with a `code` property; anything else is `ERR_UNKNOWN`.
 */
export function toSmartScanError(error: unknown): SmartScanError {
  if (error instanceof SmartScanError) {
    return error;
  }
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof code === 'string' && KNOWN_CODES.has(code)) {
    return new SmartScanError(code as SmartScanErrorCode, message, { cause: error });
  }
  return new SmartScanError(SmartScanErrorCode.Unknown, message, { cause: error });
}
