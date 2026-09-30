export interface AmountMatch {
  value: number;
  /** Index of the first character of the match in the (normalized) line. */
  start: number;
  end: number;
}

// Characters OCR engines commonly substitute for digits on thermal-printer receipts.
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: '0',
  o: '0',
  l: '1',
  I: '1',
  '|': '1',
};

/**
 * Repairs the usual OCR damage around numbers without touching ordinary words:
 * "l2.5O" -> "12.50", "4 .99" -> "4.99", "3. 25" -> "3.25", "S4.50" -> "$4.50".
 *
 * Only tokens that already contain a digit *and* a decimal separator are rewritten,
 * which keeps words like "SOLD" or "BOOK" intact.
 */
export function normalizeNumericTokens(line: string): string {
  const collapsed = line
    .replace(/(\d)\s+([.,])\s*(\d{2})(?!\d)/g, '$1$2$3')
    .replace(/(\d)([.,])\s+(\d{2})(?!\d)/g, '$1$2$3');

  // A dollar sign printed on thermal paper is routinely read as a capital S.
  const dollars = collapsed.replace(/(^|\s)S\s?(?=\d+[.,]\d{2}(?!\d))/g, '$1$$');

  // A candidate token must not be glued to a preceding letter, so the "l" in
  // "Novel....14.99" stays a letter.
  return dollars.replace(/(?<!\p{L})[0-9OolI|][0-9OolI|.,]*[.,][0-9OolI|]{2}(?!\d)/gu, (token) =>
    /\d/.test(token) ? token.replace(/[OolI|]/g, (ch) => DIGIT_LOOKALIKES[ch] ?? ch) : token
  );
}

/**
 * Parses a single amount string, accepting both `1,234.56` and `1.234,56` styles.
 * The last separator followed by exactly two digits is the decimal point.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,'-]/g, '');
  const negative = cleaned.startsWith('-') || cleaned.endsWith('-');
  const digits = cleaned.replace(/-/g, '');
  const match = /^(.*?)[.,](\d{2})$/.exec(digits);

  let value: number;
  if (match) {
    const whole = match[1]!.replace(/[.,']/g, '');
    value = Number(`${whole || '0'}.${match[2]}`);
  } else if (/^\d+$/.test(digits)) {
    value = Number(digits);
  } else {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }
  return negative ? -value : value;
}

// Money on receipts is printed with two decimals. Requiring them keeps quantities,
// dates, phone numbers and SKUs out of the amount set. Integer amounts are accepted
// only when a currency symbol makes the intent explicit (e.g. "¥1200").
const DECIMAL_AMOUNT =
  /(?<!\d)(?<!\d[.,])(-\s?)?(?:[$€£₹¥]\s?)?(\d{1,3}(?:[,.']\d{3})+|\d+)[.,](\d{2})(?!\d|[.,]\d|\s?%)(\s?-)?/g;
const SYMBOL_INTEGER_AMOUNT =
  /(?<!\d)(?<!\d[.,])([$€£₹¥])\s?(\d{1,3}(?:[,']\d{3})+|\d+)(?![\d.,]|\s?%)/g;

/** Finds every monetary amount on a line, left to right. */
export function findAmounts(line: string): AmountMatch[] {
  const matches: AmountMatch[] = [];

  for (const m of line.matchAll(DECIMAL_AMOUNT)) {
    const value = parseAmount(m[0]);
    if (value !== null) {
      matches.push({ value, start: m.index, end: m.index + m[0].length });
    }
  }

  for (const m of line.matchAll(SYMBOL_INTEGER_AMOUNT)) {
    const start = m.index;
    const overlaps = matches.some((a) => start < a.end && start + m[0].length > a.start);
    const value = parseAmount(m[2]!);
    if (!overlaps && value !== null) {
      matches.push({ value, start, end: start + m[0].length });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

/** Rounds to cents so floating-point noise never leaks into the output. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
