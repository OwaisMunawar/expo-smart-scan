import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Outcome of trying the on-device language model. `receipt == nil` means the caller
/// should run the heuristic parser on the OCR text instead.
struct ModelOutcome: Sendable {
  var receipt: ReceiptPayload?
  var durationMs: Double = 0
  var fallbackReason: String?
}

struct LineItemPayload: Sendable {
  let description: String
  let quantity: Double?
  let unitPrice: Double?
  let amount: Double
}

struct ReceiptPayload: Sendable {
  let merchant: String?
  let date: String?
  let currency: String?
  let total: Double?
  let subtotal: Double?
  let tax: Double?
  let lineItems: [LineItemPayload]

  var dictionary: [String: Any] {
    [
      "merchant": merchant ?? NSNull(),
      "date": date ?? NSNull(),
      "currency": currency ?? NSNull(),
      "total": total ?? NSNull(),
      "subtotal": subtotal ?? NSNull(),
      "tax": tax ?? NSNull(),
      "lineItems": lineItems.map { item -> [String: Any] in
        [
          "description": item.description,
          "quantity": item.quantity ?? NSNull(),
          "unitPrice": item.unitPrice ?? NSNull(),
          "amount": item.amount,
        ]
      },
    ]
  }
}

enum ReceiptExtractor {
  /// `available`, `unavailable` or `unsupported`, plus a machine-readable reason.
  static func modelStatus() -> (status: String, reason: String?) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      switch SystemLanguageModel.default.availability {
      case .available:
        return ("available", nil)
      case .unavailable(.deviceNotEligible):
        return ("unavailable", "deviceNotEligible")
      case .unavailable(.appleIntelligenceNotEnabled):
        return ("unavailable", "appleIntelligenceNotEnabled")
      case .unavailable(.modelNotReady):
        return ("unavailable", "modelNotReady")
      case .unavailable:
        return ("unavailable", "unknown")
      }
    }
    return ("unsupported", "requiresIOS26")
    #else
    return ("unsupported", "sdkWithoutFoundationModels")
    #endif
  }

  static func extract(from ocr: OCRResult, requireModel: Bool) async throws -> ModelOutcome {
    let (status, reason) = modelStatus()
    guard status == "available" else {
      if requireModel {
        throw ModelUnavailableException(reason ?? status)
      }
      return ModelOutcome(fallbackReason: reason ?? status)
    }

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return try await generate(from: ocr, requireModel: requireModel)
    }
    #endif
    return ModelOutcome(fallbackReason: "requiresIOS26")
  }
}

#if canImport(FoundationModels)

@available(iOS 26.0, *)
@Generable(description: "Structured data read from a printed purchase receipt")
struct GeneratedReceipt {
  @Guide(description: "Business name as printed at the top of the receipt")
  var merchant: String?

  @Guide(description: "Purchase date formatted as YYYY-MM-DD")
  var date: String?

  @Guide(description: "Three-letter ISO 4217 currency code such as USD, EUR or GBP")
  var currency: String?

  @Guide(description: "Final amount charged, including tax and tip")
  var total: Double?

  @Guide(description: "Amount before tax, if printed")
  var subtotal: Double?

  @Guide(description: "Total tax, if printed")
  var tax: Double?

  @Guide(description: "Purchased items in printed order. Excludes subtotal, tax, total, payment and change rows.")
  var lineItems: [GeneratedLineItem]
}

@available(iOS 26.0, *)
@Generable
struct GeneratedLineItem {
  @Guide(description: "Item name as printed, without quantity or price")
  var name: String

  @Guide(description: "Quantity if a count such as '2 x' is printed on the row, otherwise empty")
  var quantity: Int?

  @Guide(description: "Price per unit only if printed as a separate number, otherwise empty")
  var unitPrice: Double?

  // Small models tend to "helpfully" multiply quantity by price or flip signs, so the
  // guide pins the value to what is literally printed.
  @Guide(description: "The number printed at the right end of the row, copied exactly. Negative only if printed with a minus sign, e.g. '1.00-'.")
  var amount: Double
}

@available(iOS 26.0, *)
extension ReceiptExtractor {
  private static let instructions = """
    You extract data from OCR text of a shopping receipt. Each line is one printed row; \
    columns are separated by two spaces, so an item row looks like "Name  4.50". \
    Characters may be misread. Copy numbers exactly as printed and never calculate them. \
    Discount rows are items too. Leave a field empty rather than guessing, and never \
    invent items.
    """

  /// The on-device model has a 4k-token context shared by instructions, schema and
  /// output. Long receipts are truncated from the bottom (loyalty blurbs, survey codes)
  /// because the fields that matter are almost always in the top two thirds.
  private static let maxPromptCharacters = 6000

  fileprivate static func generate(from ocr: OCRResult, requireModel: Bool) async throws -> ModelOutcome {
    let text = String(ocr.rowText.prefix(maxPromptCharacters))
    guard !text.isEmpty else {
      return ModelOutcome(fallbackReason: "noText")
    }

    let start = DispatchTime.now().uptimeNanoseconds
    let session = LanguageModelSession(instructions: instructions)
    do {
      let response = try await session.respond(
        to: "Receipt text:\n\(text)",
        generating: GeneratedReceipt.self,
        options: GenerationOptions(sampling: .greedy)
      )
      let generated = response.content
      let receipt = ReceiptPayload(
        merchant: generated.merchant,
        date: generated.date,
        currency: generated.currency,
        total: generated.total,
        subtotal: generated.subtotal,
        tax: generated.tax,
        lineItems: generated.lineItems.map {
          LineItemPayload(
            description: $0.name,
            quantity: $0.quantity.map(Double.init),
            unitPrice: $0.unitPrice,
            amount: $0.amount
          )
        }
      )
      return ModelOutcome(receipt: receipt, durationMs: elapsedMs(since: start))
    } catch let error as LanguageModelSession.GenerationError {
      let reason = "generationFailed:\(caseName(of: error))"
      if requireModel {
        throw ModelFailedException(reason)
      }
      return ModelOutcome(durationMs: elapsedMs(since: start), fallbackReason: reason)
    }
  }

  private static func caseName(of error: LanguageModelSession.GenerationError) -> String {
    switch error {
    case .exceededContextWindowSize: return "exceededContextWindowSize"
    case .assetsUnavailable: return "assetsUnavailable"
    case .guardrailViolation: return "guardrailViolation"
    case .unsupportedGuide: return "unsupportedGuide"
    case .unsupportedLanguageOrLocale: return "unsupportedLanguageOrLocale"
    case .decodingFailure: return "decodingFailure"
    case .rateLimited: return "rateLimited"
    case .concurrentRequests: return "concurrentRequests"
    case .refusal: return "refusal"
    @unknown default: return "unknown"
    }
  }
}

#endif
