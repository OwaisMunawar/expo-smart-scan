import type { Receipt, ReceiptLineItem, TextLine } from '../types';
import { findAmounts, normalizeNumericTokens, roundMoney, type AmountMatch } from './amounts';
import { detectCurrency } from './currency';
import { parseDate, type DateOrder } from './dates';
import { groupIntoRows } from './rows';

export interface ParseReceiptOptions {
  /** How to read ambiguous numeric dates like `03/04/2026`. Defaults to `MDY`. */
  dateOrder?: DateOrder;
  /** Used when the receipt only shows an ambiguous symbol such as `$` or `Rs`. */
  defaultCurrency?: string;
}

/** How the total was determined, from most to least trustworthy. */
export type TotalSource = 'label' | 'subtotal+tax' | 'largest' | null;

export interface ParsedReceipt extends Receipt {
  totalSource: TotalSource;
}

type RowKind = 'total' | 'subtotal' | 'tax' | 'tender' | 'meta' | 'other';

interface Row {
  text: string;
  kind: RowKind;
  /** Higher wins when several rows look like a total. */
  totalRank: number;
  amounts: AmountMatch[];
}

const SUBTOTAL = /\bsub\s*-?\s*t[o0]ta[l1]\b/i;
const NOT_A_TOTAL =
  /\b(t[o0]ta[l1]\s*(savings?|saved|discounts?|items?|qty|quantity|tax|tips?|number|no\.?))\b|\b(items?|qty)\s*t[o0]ta[l1]\b|\btaxable\b/i;
const TOTAL_RANKS: [RegExp, number][] = [
  [/\bgrand\s*t[o0]ta[l1]\b/i, 4],
  [/\b(amount|balance|total)\s*(due|payable|to\s*pay)\b/i, 3],
  [/\b(net\s*)?t[o0]ta[l1]\b|\bsumme\b|\bgesamt\b|\bmontant\b|\bimporte\b/i, 2],
  [/\bbalance\b|\bamount\b/i, 1],
];
const TAX = /\b(tax|vat|gst|hst|pst|mwst|tva|iva)\b/i;
const TENDER =
  /\b(cash|change|tender(ed)?|visa|master\s*card|mastercard|amex|debit|credit|card|paid|payment|auth(orization)?|approval|approved|ref(erence)?|terminal)\b/i;
const META =
  /\b(tel|phone|fax|www\.|https?:|e-?mail|receipt|invoice|order|table|server|cashier|guests?|store\s*(#|no\.?|\d)|trans(action)?|thank|welcome|visit|survey|open\s*daily|hours)\b|@\w+\.\w+/i;
const PHONE = /\(?\+?\d{1,3}\)?[\s.-]?\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{0,4}/;
const STREET =
  /^\s*\d{1,5}\s+\w+.*\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|hwy|suite|ste|strasse|straße)\b\.?/i;
const TRAILING_FLAGS = /^\s*(?:[A-Z]{1,2}|\*{1,2})?\s*$/;

function classify(text: string): Omit<Row, 'text' | 'amounts'> {
  if (SUBTOTAL.test(text)) return { kind: 'subtotal', totalRank: 0 };
  // "Amount tendered" and "Balance on card" are payment rows, but "TOTAL VISA" is a total.
  if (TENDER.test(text) && !/\bt[o0]ta[l1]\b|\bdue\b/i.test(text))
    return { kind: 'tender', totalRank: 0 };
  if (NOT_A_TOTAL.test(text)) {
    return { kind: TAX.test(text) ? 'tax' : 'meta', totalRank: 0 };
  }
  for (const [pattern, rank] of TOTAL_RANKS) {
    if (pattern.test(text)) return { kind: 'total', totalRank: rank };
  }
  if (TAX.test(text)) return { kind: 'tax', totalRank: 0 };
  if (TENDER.test(text)) return { kind: 'tender', totalRank: 0 };
  if (META.test(text)) return { kind: 'meta', totalRank: 0 };
  return { kind: 'other', totalRank: 0 };
}

function toRows(input: readonly (string | TextLine)[]): string[] {
  if (input.length > 0 && input.every((l) => typeof l !== 'string')) {
    return groupIntoRows(input);
  }
  return input.map((l) => (typeof l === 'string' ? l : l.text));
}

/** Amount on this row, or on the next row when OCR split a label from its value. */
function amountFor(rows: Row[], index: number): number | null {
  const row = rows[index]!;
  const last = row.amounts[row.amounts.length - 1];
  if (last) return last.value;

  const next = rows[index + 1];
  if (
    next &&
    next.amounts.length > 0 &&
    !/[a-z]{3,}/i.test(next.text.replace(/\b[A-Z]{3}\b/g, ''))
  ) {
    return next.amounts[next.amounts.length - 1]!.value;
  }
  return null;
}

function letterRatio(text: string): number {
  const compact = text.replace(/\s/g, '');
  if (compact.length === 0) return 0;
  return (compact.match(/\p{L}/gu)?.length ?? 0) / compact.length;
}

function findMerchant(rows: Row[], order: DateOrder): { name: string | null; index: number } {
  const limit = Math.min(rows.length, 8);
  for (let i = 0; i < limit; i++) {
    const row = rows[i]!;
    // Banners like "*** WELCOME ***" are decoration, not part of the name.
    const text = row.text.replace(/^[^\p{L}\d]+|[^\p{L}\d)'’]+$/gu, '').replace(/\s{2,}/g, ' ');

    const welcome = /^welcome\s+to\s+(.+)$/i.exec(text);
    if (welcome) {
      return { name: welcome[1]!, index: i };
    }

    if (
      row.kind === 'other' &&
      row.amounts.length === 0 &&
      (text.match(/\p{L}/gu)?.length ?? 0) >= 3 &&
      letterRatio(text) >= 0.6 &&
      !parseDate(text, order) &&
      !PHONE.test(text) &&
      !STREET.test(text)
    ) {
      return { name: text, index: i };
    }
  }
  return { name: null, index: -1 };
}

const QTY_TIMES_PRICE = /(\d{1,3})\s*[xX×@]\s*$/;
const LEADING_QTY_TIMES = /^\s*(\d{1,3})\s*[xX×]\s+/;
const LEADING_QTY = /^\s*(\d{1,2})\s+(?=\p{L})/u;

function toLineItem(row: Row): ReceiptLineItem | null {
  const last = row.amounts[row.amounts.length - 1];
  if (!last || !TRAILING_FLAGS.test(row.text.slice(last.end))) {
    return null;
  }

  let description = row.text.slice(0, row.amounts[0]!.start);
  let quantity: number | null = null;
  let unitPrice: number | null = row.amounts.length > 1 ? row.amounts[0]!.value : null;

  const qtyBeforeUnit = QTY_TIMES_PRICE.exec(description);
  if (qtyBeforeUnit && row.amounts.length > 1) {
    quantity = Number(qtyBeforeUnit[1]);
    description = description.slice(0, qtyBeforeUnit.index);
  } else if (qtyBeforeUnit && row.amounts.length === 1) {
    // "Latte 2 @ 4.50" with no extended amount: the single amount is the unit price.
    quantity = Number(qtyBeforeUnit[1]);
    unitPrice = last.value;
    description = description.slice(0, qtyBeforeUnit.index);
  }

  const leading = LEADING_QTY_TIMES.exec(description) ?? LEADING_QTY.exec(description);
  if (leading && quantity === null) {
    quantity = Number(leading[1]);
    description = description.slice(leading[0].length);
  }

  description = description
    .replace(/\b\d{6,}\b/g, '') // SKUs and barcodes
    .replace(/[.·•_]{2,}/g, ' ') // dot leaders
    .replace(/[$€£₹¥]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:*-]+|[\s:*-]+$/g, '');

  if ((description.match(/\p{L}/gu)?.length ?? 0) < 2) {
    return null;
  }

  let amount = last.value;
  if (quantity !== null && unitPrice !== null && row.amounts.length === 1) {
    amount = roundMoney(quantity * unitPrice);
  }
  if (unitPrice === null && quantity !== null && quantity > 1) {
    unitPrice = roundMoney(amount / quantity);
  }

  return { description, quantity, unitPrice, amount };
}

/**
 * Heuristic receipt parser used on every platform where the on-device language model
 * is not available. Deterministic, dependency-free and fast enough to run on each OCR
 * pass (well under a millisecond for a typical receipt).
 *
 * Accepts either plain strings (one per row) or raw `TextLine`s from `recognizeText`,
 * in which case observations are first merged back into visual rows.
 *
 * @example
 * ```ts
 * const { lines } = await recognizeText(uri);
 * const receipt = parseReceipt(lines, { dateOrder: 'DMY' });
 * ```
 */
export function parseReceipt(
  input: readonly (string | TextLine)[],
  options: ParseReceiptOptions = {}
): ParsedReceipt {
  const order = options.dateOrder ?? 'MDY';
  const texts = toRows(input)
    .map((t) => normalizeNumericTokens(t).trim())
    .filter((t) => t.length > 0);

  const rows: Row[] = texts.map((text) => ({
    text,
    ...classify(text),
    amounts: findAmounts(text),
  }));

  const merchant = findMerchant(rows, order);

  let date: string | null = null;
  for (const row of rows) {
    date = parseDate(row.text, order);
    if (date) break;
  }

  let subtotal: number | null = null;
  let tax: number | null = null;
  let labelledTotal: { value: number; rank: number } | null = null;

  rows.forEach((row, i) => {
    if (row.kind === 'subtotal') {
      subtotal ??= amountFor(rows, i);
    } else if (row.kind === 'tax') {
      const value = amountFor(rows, i);
      if (value !== null) tax = roundMoney((tax ?? 0) + value);
    } else if (row.kind === 'total') {
      const value = amountFor(rows, i);
      if (value === null || value <= 0) return;
      // Among equally strong labels prefer the larger value: the second "TOTAL" on a
      // card slip usually includes the tip, which is what was actually charged.
      if (
        !labelledTotal ||
        row.totalRank > labelledTotal.rank ||
        (row.totalRank === labelledTotal.rank && value > labelledTotal.value)
      ) {
        labelledTotal = { value, rank: row.totalRank };
      }
    }
  });

  let total: number | null = null;
  let totalSource: TotalSource = null;
  const bestLabel = labelledTotal as { value: number; rank: number } | null;
  if (bestLabel) {
    total = bestLabel.value;
    totalSource = 'label';
  } else if (subtotal !== null && tax !== null) {
    total = roundMoney(subtotal + tax);
    totalSource = 'subtotal+tax';
  } else {
    const candidates = rows
      .filter((r) => r.kind !== 'tender' && r.kind !== 'meta')
      .flatMap((r) => r.amounts.map((a) => a.value))
      .filter((v) => v > 0);
    if (candidates.length > 0) {
      total = Math.max(...candidates);
      totalSource = 'largest';
    }
  }

  // Items live between the header and the first summary row.
  const firstSummary = rows.findIndex(
    (r) => r.kind === 'subtotal' || r.kind === 'total' || r.kind === 'tax' || r.kind === 'tender'
  );
  const itemRows = rows.slice(merchant.index + 1, firstSummary === -1 ? rows.length : firstSummary);
  const lineItems = itemRows
    .filter((r) => r.kind === 'other' && !parseDate(r.text, order))
    .map(toLineItem)
    .filter((item): item is ReceiptLineItem => item !== null);

  return {
    merchant: merchant.name,
    date,
    currency: detectCurrency(texts, options.defaultCurrency),
    total,
    subtotal,
    tax,
    lineItems,
    totalSource,
  };
}
