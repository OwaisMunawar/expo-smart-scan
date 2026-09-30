const ISO_CODES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'CHF',
  'JPY',
  'CNY',
  'INR',
  'PKR',
  'AED',
  'SAR',
  'QAR',
  'SGD',
  'HKD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'MXN',
  'BRL',
  'ZAR',
];

const ISO_PATTERN = new RegExp(`\\b(${ISO_CODES.join('|')})\\b`, 'g');

const SYMBOLS: [RegExp, string][] = [
  [/€/g, 'EUR'],
  [/£/g, 'GBP'],
  [/₹/g, 'INR'],
  [/¥/g, 'JPY'],
  [/\bDhs?\b\.?/gi, 'AED'],
];

/**
 * Picks the most frequently mentioned currency across all lines.
 *
 * Explicit ISO codes win over symbols. A bare `$` or `Rs` is ambiguous (USD/CAD/AUD,
 * INR/PKR/LKR), so it resolves to `defaultCurrency`, and a bare `$` falls back to
 * `USD` only when no default is given.
 */
export function detectCurrency(lines: readonly string[], defaultCurrency?: string): string | null {
  const votes = new Map<string, number>();
  const vote = (code: string, weight: number) => votes.set(code, (votes.get(code) ?? 0) + weight);

  let sawDollar = false;

  for (const line of lines) {
    for (const m of line.matchAll(ISO_PATTERN)) vote(m[1]!, 2);
    for (const [pattern, code] of SYMBOLS) {
      const hits = line.match(pattern)?.length ?? 0;
      if (hits) vote(code, hits);
    }
    if (line.includes('$')) sawDollar = true;
  }

  if (votes.size > 0) {
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  if (defaultCurrency) {
    return defaultCurrency.toUpperCase();
  }
  return sawDollar ? 'USD' : null;
}
